CREATE TABLE IF NOT EXISTS organizational_units (
  id uuid PRIMARY KEY,
  normalized_name text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY,
  normalized_name text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_import_jobs (
  id uuid PRIMARY KEY,
  source_filename text NOT NULL,
  source_sheet text NOT NULL,
  checksum_sha256 text NOT NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  insert_count integer NOT NULL DEFAULT 0 CHECK (insert_count >= 0),
  update_count integer NOT NULL DEFAULT 0 CHECK (update_count >= 0),
  warning_count integer NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  error_count integer NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  status text NOT NULL CHECK (status IN ('previewed', 'committed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS employee_import_jobs_checksum_idx
  ON employee_import_jobs (checksum_sha256, created_at DESC);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY,
  employee_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'inactive', 'resigned')),
  employment_status text NULL,
  organizational_unit_id uuid NULL REFERENCES organizational_units(id),
  position_id uuid NULL REFERENCES positions(id),
  employment_type text NULL,
  functional_position text NULL,
  structural_position text NULL,
  email text NULL,
  phone text NULL,
  education text NULL,
  started_on date NULL,
  ended_on date NULL,
  source_last_import_job_id uuid NULL REFERENCES employee_import_jobs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employees_status_idx ON employees (status);
CREATE INDEX IF NOT EXISTS employees_unit_idx ON employees (organizational_unit_id);
CREATE INDEX IF NOT EXISTS employees_position_idx ON employees (position_id);

CREATE TABLE IF NOT EXISTS employee_import_rows (
  import_job_id uuid NOT NULL REFERENCES employee_import_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  employee_number text NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'error', 'skip')),
  payload jsonb NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (import_job_id, row_number)
);

CREATE INDEX IF NOT EXISTS employee_import_rows_employee_number_idx
  ON employee_import_rows (employee_number);
