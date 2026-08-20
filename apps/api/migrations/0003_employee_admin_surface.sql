ALTER TABLE employee_import_jobs
  ADD COLUMN IF NOT EXISTS created_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE employee_import_jobs
  ADD COLUMN IF NOT EXISTS committed_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employee_import_jobs_created_by_idx
  ON employee_import_jobs (created_by_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS employee_import_jobs_committed_by_idx
  ON employee_import_jobs (committed_by_account_id, committed_at DESC)
  WHERE committed_by_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_full_name_lower_idx
  ON employees (lower(full_name));

CREATE INDEX IF NOT EXISTS employees_email_lower_idx
  ON employees (lower(email))
  WHERE email IS NOT NULL;
