CREATE TABLE IF NOT EXISTS payslip_import_batches (
  id uuid PRIMARY KEY,
  source_filename text NOT NULL,
  checksum_sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('previewed', 'committed', 'published')),
  row_count integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  committed_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  published_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz NULL,
  published_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS payslip_import_batches_created_idx
  ON payslip_import_batches (created_at DESC);

CREATE TABLE IF NOT EXISTS payslip_import_rows (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES payslip_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  employee_id uuid NULL REFERENCES employees(id) ON DELETE RESTRICT,
  employee_number text NOT NULL,
  period date NULL,
  lines jsonb NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS payslip_import_rows_batch_idx
  ON payslip_import_rows (batch_id, row_number);

CREATE TABLE IF NOT EXISTS payslips (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  period date NOT NULL,
  lines jsonb NOT NULL,
  source_batch_id uuid NOT NULL REFERENCES payslip_import_batches(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  published_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  UNIQUE (employee_id, period)
);

CREATE INDEX IF NOT EXISTS payslips_employee_period_idx
  ON payslips (employee_id, period DESC);

CREATE INDEX IF NOT EXISTS payslips_published_idx
  ON payslips (employee_id, period DESC)
  WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS payslip_audit_events (
  id uuid PRIMARY KEY,
  actor_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  action text NOT NULL,
  batch_id uuid NULL REFERENCES payslip_import_batches(id) ON DELETE SET NULL,
  payslip_id uuid NULL REFERENCES payslips(id) ON DELETE SET NULL,
  employee_id uuid NULL REFERENCES employees(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payslip_audit_events_time_idx
  ON payslip_audit_events (occurred_at DESC);

INSERT INTO permissions (permission_key, description) VALUES
  ('payslips.import', 'Membuat dan mengulas batch import payslip tanpa menghitung payroll'),
  ('payslips.publish', 'Mempublikasikan draft payslip yang sudah divalidasi')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_key) VALUES
  ('10000000-0000-4000-8000-000000000002', 'payslips.import'),
  ('10000000-0000-4000-8000-000000000002', 'payslips.publish')
ON CONFLICT DO NOTHING;
