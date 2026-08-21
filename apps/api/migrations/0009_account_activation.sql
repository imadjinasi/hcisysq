CREATE TABLE IF NOT EXISTS account_activation_tokens (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  revoked_at timestamptz NULL,
  issued_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_activation_tokens_one_active_idx
  ON account_activation_tokens (account_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS account_activation_tokens_expiry_idx
  ON account_activation_tokens (expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
