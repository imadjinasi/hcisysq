ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS line_handling text NOT NULL DEFAULT 'approval'
    CHECK (line_handling IN ('approval', 'notify', 'none')),
  ADD COLUMN IF NOT EXISTS evidence_requirement text NOT NULL DEFAULT 'none'
    CHECK (evidence_requirement IN ('none', 'required', 'required_deferred_allowed', 'conditional')),
  ADD COLUMN IF NOT EXISTS emergency_notice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS leave_request_hc_tasks (
  id uuid PRIMARY KEY,
  leave_request_id uuid NOT NULL UNIQUE REFERENCES leave_requests(id) ON DELETE CASCADE,
  task_kind text NOT NULL CHECK (task_kind IN ('validate', 'approve')),
  status text NOT NULL CHECK (
    status IN ('waiting', 'pending', 'needs_correction', 'validated', 'approved', 'rejected')
  ),
  assigned_role_key text NOT NULL DEFAULT 'human_capital',
  note text NULL,
  acted_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  acted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_request_hc_tasks_queue_idx
  ON leave_request_hc_tasks (status, created_at ASC)
  WHERE status IN ('pending', 'needs_correction');

CREATE TABLE IF NOT EXISTS leave_request_evidence (
  id uuid PRIMARY KEY,
  leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'supporting_document',
  original_filename text NOT NULL,
  content_type text NOT NULL CHECK (
    content_type IN ('application/pdf', 'image/jpeg', 'image/png')
  ),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  uploaded_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_request_evidence_request_idx
  ON leave_request_evidence (leave_request_id, created_at ASC);

INSERT INTO permissions (permission_key, description) VALUES
  ('leave.validate', 'Memvalidasi administrasi cuti yang menjadi kewenangan Human Capital'),
  ('leave.evidence.read', 'Membaca dokumen pendukung cuti sesuai kewenangan')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_key) VALUES
  ('10000000-0000-4000-8000-000000000002', 'leave.validate'),
  ('10000000-0000-4000-8000-000000000002', 'leave.evidence.read')
ON CONFLICT DO NOTHING;
