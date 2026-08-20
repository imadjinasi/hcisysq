CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  employee_id uuid NULL REFERENCES employees(id) ON DELETE SET NULL,
  email text NOT NULL,
  principal_type text NOT NULL CHECK (
    principal_type IN ('EMPLOYEE', 'FOUNDATION_BOARD', 'SUPER_ADMIN')
  ),
  status text NOT NULL CHECK (
    status IN ('invited', 'active', 'suspended', 'inactive')
  ),
  password_hash text NULL,
  password_changed_at timestamptz NULL,
  mfa_secret_ciphertext text NULL,
  mfa_secret_iv text NULL,
  mfa_secret_tag text NULL,
  mfa_enabled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    principal_type = 'EMPLOYEE'
    OR employee_id IS NULL
  ),
  CHECK (
    mfa_enabled_at IS NULL
    OR (
      mfa_secret_ciphertext IS NOT NULL
      AND mfa_secret_iv IS NOT NULL
      AND mfa_secret_tag IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower_unique
  ON accounts (lower(email));

CREATE INDEX IF NOT EXISTS accounts_principal_status_idx
  ON accounts (principal_type, status);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  ip_address text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_account_active_idx
  ON auth_sessions (account_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_recovery_codes (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code_hash text NOT NULL CHECK (length(code_hash) = 64),
  used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, code_hash)
);

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id uuid PRIMARY KEY,
  account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  email text NULL,
  ip_address text NULL,
  user_agent text NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_audit_events_account_time_idx
  ON auth_audit_events (account_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS auth_audit_events_type_time_idx
  ON auth_audit_events (event_type, occurred_at DESC);
