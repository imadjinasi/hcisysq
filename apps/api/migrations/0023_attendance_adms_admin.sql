CREATE TABLE IF NOT EXISTS attendance_adms_admin_audit_events (
  id uuid PRIMARY KEY,
  actor_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action IN ('device_registered', 'device_updated', 'mapping_created', 'mapping_ended')
  ),
  device_id uuid NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  mapping_id uuid NULL REFERENCES attendance_adms_employee_mappings(id) ON DELETE RESTRICT,
  before_state jsonb NULL,
  after_state jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_admin_audit_device_idx
  ON attendance_adms_admin_audit_events (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS attendance_adms_admin_audit_mapping_idx
  ON attendance_adms_admin_audit_events (mapping_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_attendance_adms_admin_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ADMS admin audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_admin_audit_immutable
  ON attendance_adms_admin_audit_events;
CREATE TRIGGER attendance_adms_admin_audit_immutable
BEFORE UPDATE OR DELETE ON attendance_adms_admin_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_attendance_adms_admin_audit_mutation();

CREATE OR REPLACE FUNCTION reject_overlapping_attendance_adms_employee_mapping()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance_adms_employee_mappings existing
    WHERE existing.id <> NEW.id
      AND existing.device_id = NEW.device_id
      AND existing.pin = NEW.pin
      AND tstzrange(
        existing.effective_from,
        COALESCE(existing.effective_to, 'infinity'::timestamptz),
        '[)'
      ) && tstzrange(
        NEW.effective_from,
        COALESCE(NEW.effective_to, 'infinity'::timestamptz),
        '[)'
      )
  ) THEN
    RAISE EXCEPTION 'ADMS employee mapping overlaps existing mapping'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_employee_mapping_no_overlap
  ON attendance_adms_employee_mappings;
CREATE TRIGGER attendance_adms_employee_mapping_no_overlap
BEFORE INSERT OR UPDATE OF device_id, pin, effective_from, effective_to
ON attendance_adms_employee_mappings
FOR EACH ROW EXECUTE FUNCTION reject_overlapping_attendance_adms_employee_mapping();
