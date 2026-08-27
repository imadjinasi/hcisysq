ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS identity_issuer text NULL,
  ADD COLUMN IF NOT EXISTS identity_subject text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_identity_pair_nullability_check'
      AND conrelid = 'accounts'::regclass
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_identity_pair_nullability_check
      CHECK (
        (identity_issuer IS NULL AND identity_subject IS NULL)
        OR (identity_issuer IS NOT NULL AND identity_subject IS NOT NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_identity_issuer_subject_unique
  ON accounts (identity_issuer, identity_subject)
  WHERE identity_issuer IS NOT NULL AND identity_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_oidc_transactions (
  state_hash text PRIMARY KEY CHECK (length(state_hash) = 64),
  code_verifier text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_oidc_transactions_expires_idx
  ON auth_oidc_transactions (expires_at);
