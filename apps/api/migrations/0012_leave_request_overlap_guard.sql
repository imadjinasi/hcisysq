-- Prevent simultaneous active individual leave requests for the same employee.
-- The only intentional overlap is the administrative annual-conversion record
-- with the source leave request whose unresolved dates it settles.

CREATE OR REPLACE FUNCTION enforce_active_leave_request_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('in_review', 'approved') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM leave_requests existing
    WHERE existing.employee_id = NEW.employee_id
      AND existing.id <> NEW.id
      AND existing.status IN ('in_review', 'approved')
      AND existing.start_on <= NEW.end_on
      AND existing.end_on >= NEW.start_on
      AND NOT (
        -- NEW is the administrative annual conversion for the existing source request.
        (
          NEW.policy_key = 'annual'
          AND NEW.validation_summary ->> 'source' = 'attendance_resolution'
          AND EXISTS (
            SELECT 1
            FROM attendance_resolution_cases resolution
            WHERE resolution.id::text = NEW.validation_summary ->> 'sourceCaseId'
              AND resolution.source_leave_request_id = existing.id
          )
        )
        OR
        -- Existing is an administrative annual conversion for NEW as its source request.
        (
          existing.policy_key = 'annual'
          AND existing.validation_summary ->> 'source' = 'attendance_resolution'
          AND EXISTS (
            SELECT 1
            FROM attendance_resolution_cases resolution
            WHERE resolution.id::text = existing.validation_summary ->> 'sourceCaseId'
              AND resolution.source_leave_request_id = NEW.id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'active leave request overlaps another active leave request';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_request_active_overlap_guard ON leave_requests;

CREATE TRIGGER leave_request_active_overlap_guard
BEFORE INSERT OR UPDATE OF employee_id, start_on, end_on, status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION enforce_active_leave_request_no_overlap();
