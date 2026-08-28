CREATE TABLE IF NOT EXISTS attendance_adms_employee_mappings (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  pin text NOT NULL CHECK (length(pin) BETWEEN 1 AND 128),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz NULL,
  created_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  ended_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_employee_mappings_active_pin_idx
  ON attendance_adms_employee_mappings (device_id, pin)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS attendance_adms_employee_mappings_employee_idx
  ON attendance_adms_employee_mappings (employee_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS attendance_adms_employee_mappings_device_pin_time_idx
  ON attendance_adms_employee_mappings (device_id, pin, effective_from DESC);

CREATE TABLE IF NOT EXISTS attendance_adms_projection_audit_events (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL,
  action text NOT NULL CHECK (
    action IN ('created', 'updated', 'skipped_manual_conflict', 'skipped_foreign_integration')
  ),
  mapping_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  before_record jsonb NULL,
  after_record jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_projection_audit_employee_idx
  ON attendance_adms_projection_audit_events (employee_id, attendance_date DESC, created_at DESC);

CREATE OR REPLACE FUNCTION reject_attendance_adms_projection_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ADMS projection audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_projection_audit_immutable
  ON attendance_adms_projection_audit_events;
CREATE TRIGGER attendance_adms_projection_audit_immutable
BEFORE UPDATE OR DELETE ON attendance_adms_projection_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_attendance_adms_projection_audit_mutation();
