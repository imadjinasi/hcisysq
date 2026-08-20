ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS direct_manager_employee_id uuid NULL REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_direct_manager_not_self'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_direct_manager_not_self
      CHECK (direct_manager_employee_id IS NULL OR direct_manager_employee_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS employees_direct_manager_idx
  ON employees (direct_manager_employee_id)
  WHERE direct_manager_employee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_employee_unique
  ON accounts (employee_id)
  WHERE employee_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_employee_link_required'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_employee_link_required
      CHECK (principal_type <> 'EMPLOYEE' OR employee_id IS NOT NULL) NOT VALID;
    ALTER TABLE accounts VALIDATE CONSTRAINT accounts_employee_link_required;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY,
  role_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NULL,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_key text PRIMARY KEY,
  description text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS account_role_assignments (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('own', 'unit', 'organization')),
  organizational_unit_id uuid NULL REFERENCES organizational_units(id) ON DELETE RESTRICT,
  starts_on date NULL,
  ends_on date NULL,
  reason text NULL,
  assigned_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope_type = 'unit' AND organizational_unit_id IS NOT NULL)
    OR (scope_type <> 'unit' AND organizational_unit_id IS NULL)
  ),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS account_role_assignments_account_idx
  ON account_role_assignments (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_role_assignments_role_idx
  ON account_role_assignments (role_id);

CREATE TABLE IF NOT EXISTS access_audit_events (
  id uuid PRIMARY KEY,
  actor_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_audit_events_time_idx
  ON access_audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS access_audit_events_entity_idx
  ON access_audit_events (entity_type, entity_id, occurred_at DESC);

INSERT INTO permissions (permission_key, description) VALUES
  ('employees.read.unit', 'Membaca employee master dalam unit yang ditugaskan'),
  ('employees.read.all', 'Membaca employee master seluruh organisasi'),
  ('employees.manage', 'Mengelola employee master sesuai policy'),
  ('attendance.read.unit', 'Membaca data kehadiran unit yang ditugaskan'),
  ('leave.approve', 'Memproses approval cuti sesuai scope'),
  ('reports.read.organization', 'Membaca report agregat organisasi'),
  ('reports.export.organization', 'Mengekspor report organisasi yang diizinkan')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO roles (id, role_key, name, description, is_system) VALUES
  ('10000000-0000-4000-8000-000000000001', 'unit_manager', 'Unit Manager', 'Akses tambahan untuk pengelolaan tim dan approval pada unit tertentu.', true),
  ('10000000-0000-4000-8000-000000000002', 'human_capital', 'Human Capital', 'Administrasi Human Capital sesuai permission dan scope yang diberikan.', true),
  ('10000000-0000-4000-8000-000000000003', 'finance', 'Finance', 'Akses ke workflow keuangan yang akan dibuka per modul.', true),
  ('10000000-0000-4000-8000-000000000004', 'management', 'Management', 'Dashboard dan report manajemen sesuai mandat.', true),
  ('10000000-0000-4000-8000-000000000005', 'special_approver', 'Special Approver', 'Capability approval tertentu di luar resolver struktur normal.', true)
ON CONFLICT (role_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = now();

INSERT INTO role_permissions (role_id, permission_key) VALUES
  ('10000000-0000-4000-8000-000000000001', 'employees.read.unit'),
  ('10000000-0000-4000-8000-000000000001', 'attendance.read.unit'),
  ('10000000-0000-4000-8000-000000000001', 'leave.approve'),
  ('10000000-0000-4000-8000-000000000002', 'employees.read.all'),
  ('10000000-0000-4000-8000-000000000002', 'employees.manage'),
  ('10000000-0000-4000-8000-000000000003', 'reports.read.organization'),
  ('10000000-0000-4000-8000-000000000004', 'reports.read.organization'),
  ('10000000-0000-4000-8000-000000000004', 'reports.export.organization'),
  ('10000000-0000-4000-8000-000000000005', 'leave.approve')
ON CONFLICT DO NOTHING;
