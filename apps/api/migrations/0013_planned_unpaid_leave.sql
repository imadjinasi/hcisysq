-- Planned leave and unpaid leave completion.
-- Keep HC validation distinct from actual HC approval and make Hajj use concurrency-safe.

INSERT INTO permissions (permission_key, description) VALUES
  ('leave.hc.approve', 'Melakukan persetujuan Human Capital yang merupakan actual approval sesuai kebijakan')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

-- Actual HC approval is intentionally not granted to the generic Human Capital
-- validator role. It is an additive authorization that can be assigned to the
-- employee who carries the explicit HC-approver mandate.
INSERT INTO role_permissions (role_id, permission_key) VALUES
  ('10000000-0000-4000-8000-000000000005', 'leave.hc.approve')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT employee_id
    FROM leave_requests
    WHERE policy_key = 'hajj' AND status IN ('in_review', 'approved')
    GROUP BY employee_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'multiple active Hajj requests exist for one employee';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS leave_hajj_one_active_request_idx
  ON leave_requests (employee_id)
  WHERE policy_key = 'hajj' AND status IN ('in_review', 'approved');

CREATE TABLE IF NOT EXISTS leave_hajj_final_usage (
  employee_id uuid PRIMARY KEY REFERENCES employees(id) ON DELETE RESTRICT,
  leave_request_id uuid NOT NULL UNIQUE REFERENCES leave_requests(id) ON DELETE RESTRICT,
  used_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT employee_id
    FROM leave_requests
    WHERE policy_key = 'hajj' AND status = 'approved'
    GROUP BY employee_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'multiple approved Hajj requests exist for one employee';
  END IF;
END $$;

INSERT INTO leave_hajj_final_usage (employee_id, leave_request_id, used_at)
SELECT employee_id, id, coalesce(final_decided_at, updated_at, created_at, now())
FROM leave_requests
WHERE policy_key = 'hajj' AND status = 'approved'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION claim_final_hajj_usage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.policy_key <> 'hajj' OR NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO leave_hajj_final_usage (employee_id, leave_request_id, used_at)
  VALUES (NEW.employee_id, NEW.id, coalesce(NEW.final_decided_at, now()));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_hajj_final_usage_guard ON leave_requests;
CREATE TRIGGER leave_hajj_final_usage_guard
AFTER INSERT OR UPDATE OF status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION claim_final_hajj_usage();

CREATE OR REPLACE FUNCTION enforce_hc_task_semantics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  handling text;
BEGIN
  SELECT hc_handling INTO handling
  FROM leave_requests
  WHERE id = NEW.leave_request_id;

  IF handling = 'validate' AND NEW.task_kind <> 'validate' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'HC task kind does not match validation handling';
  END IF;
  IF handling = 'approve' AND NEW.task_kind <> 'approve' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'HC task kind does not match approval handling';
  END IF;
  IF handling NOT IN ('validate', 'approve') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'HC task is not allowed for this leave handling';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_request_hc_task_semantics_guard ON leave_request_hc_tasks;
CREATE TRIGGER leave_request_hc_task_semantics_guard
BEFORE INSERT OR UPDATE OF task_kind, leave_request_id ON leave_request_hc_tasks
FOR EACH ROW
EXECUTE FUNCTION enforce_hc_task_semantics();
