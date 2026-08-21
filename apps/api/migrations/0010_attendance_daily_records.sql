CREATE TABLE IF NOT EXISTS attendance_daily_records (
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL,
  check_in_at timestamptz NULL,
  check_out_at timestamptz NULL,
  source text NOT NULL
    CHECK (source IN ('manual', 'integration')),
  source_reference text NULL,
  note text NULL CHECK (note IS NULL OR length(note) <= 1000),
  created_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  updated_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, attendance_date),
  CHECK (check_in_at IS NOT NULL OR check_out_at IS NOT NULL),
  CHECK (check_in_at IS NULL OR check_out_at IS NULL OR check_out_at >= check_in_at)
);

ALTER TABLE attendance_daily_records
  ALTER COLUMN source DROP DEFAULT;

CREATE INDEX IF NOT EXISTS attendance_daily_records_date_idx
  ON attendance_daily_records (attendance_date DESC, employee_id);

CREATE INDEX IF NOT EXISTS attendance_daily_records_employee_idx
  ON attendance_daily_records (employee_id, attendance_date DESC);

CREATE TABLE IF NOT EXISTS attendance_daily_audit_events (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  attendance_date date NOT NULL,
  actor_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  before_record jsonb NULL,
  after_record jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_daily_audit_events_employee_idx
  ON attendance_daily_audit_events (employee_id, attendance_date DESC, created_at DESC);
