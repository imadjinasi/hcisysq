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
