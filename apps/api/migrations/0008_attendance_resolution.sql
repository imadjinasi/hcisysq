ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS administration_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (
      administration_status IN (
        'pending',
        'validated',
        'partially_validated',
        'not_validated',
        'not_applicable'
      )
    );

UPDATE leave_requests
SET administration_status = CASE
  WHEN hc_handling = 'validate' AND status = 'in_review' THEN 'pending'
  WHEN hc_handling = 'validate' AND status = 'approved' THEN 'validated'
  ELSE 'not_applicable'
END
WHERE administration_status = 'not_applicable';

CREATE TABLE IF NOT EXISTS leave_request_validation_days (
  leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  calendar_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('validated', 'unresolved')),
  validated_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (leave_request_id, calendar_date)
);

CREATE INDEX IF NOT EXISTS leave_request_validation_days_status_idx
  ON leave_request_validation_days (status, calendar_date);

CREATE TABLE IF NOT EXISTS attendance_resolution_cases (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  source_leave_request_id uuid NOT NULL UNIQUE REFERENCES leave_requests(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'awaiting_employee', 'resolved')),
  proposed_resolution text NULL
    CHECK (
      proposed_resolution IS NULL OR proposed_resolution IN (
        'dispensation',
        'unpaid_absence',
        'annual_conversion',
        'manual_review'
      )
    ),
  final_resolution text NULL
    CHECK (
      final_resolution IS NULL OR final_resolution IN (
        'dispensation',
        'unpaid_absence',
        'annual_conversion'
      )
    ),
  note text NULL,
  employee_response_note text NULL,
  proposed_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  resolved_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  employee_decided_at timestamptz NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'resolved' AND final_resolution IS NOT NULL AND resolved_at IS NOT NULL)
    OR status <> 'resolved'
  )
);

CREATE INDEX IF NOT EXISTS attendance_resolution_cases_queue_idx
  ON attendance_resolution_cases (status, created_at ASC)
  WHERE status IN ('open', 'awaiting_employee');

CREATE INDEX IF NOT EXISTS attendance_resolution_cases_employee_idx
  ON attendance_resolution_cases (employee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attendance_resolution_days (
  attendance_resolution_case_id uuid NOT NULL REFERENCES attendance_resolution_cases(id) ON DELETE CASCADE,
  calendar_date date NOT NULL,
  PRIMARY KEY (attendance_resolution_case_id, calendar_date)
);

CREATE INDEX IF NOT EXISTS attendance_resolution_days_date_idx
  ON attendance_resolution_days (calendar_date);

INSERT INTO permissions (permission_key, description) VALUES
  ('attendance.resolution.read', 'Membaca kasus penyelesaian ketidakhadiran sesuai kewenangan'),
  ('attendance.resolution.manage', 'Menetapkan atau mengusulkan penyelesaian ketidakhadiran sesuai kewenangan')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_key) VALUES
  ('10000000-0000-4000-8000-000000000002', 'attendance.resolution.read'),
  ('10000000-0000-4000-8000-000000000002', 'attendance.resolution.manage')
ON CONFLICT DO NOTHING;
