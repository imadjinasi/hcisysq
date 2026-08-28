CREATE TABLE IF NOT EXISTS attendance_adms_device_roster_entries (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE CASCADE,
  pin text NOT NULL CHECK (length(pin) BETWEEN 1 AND 128),
  display_name text NULL CHECK (display_name IS NULL OR length(display_name) <= 160),
  card_number text NULL CHECK (card_number IS NULL OR length(card_number) <= 160),
  privilege text NULL CHECK (privilege IS NULL OR length(privilege) <= 80),
  verify_mode text NULL CHECK (verify_mode IS NULL OR length(verify_mode) <= 80),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_request_id uuid NULL REFERENCES attendance_adms_request_journal(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, pin),
  CHECK (last_seen_at >= first_seen_at)
);

CREATE INDEX IF NOT EXISTS attendance_adms_device_roster_last_seen_idx
  ON attendance_adms_device_roster_entries (device_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS attendance_biometric_credentials (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  modality text NOT NULL CHECK (modality IN ('fingerprint', 'face', 'palm', 'bio_photo')),
  slot_index integer NULL CHECK (slot_index IS NULL OR slot_index BETWEEN 0 AND 255),
  vendor_format text NOT NULL CHECK (length(vendor_format) BETWEEN 1 AND 120),
  vendor_version text NULL CHECK (vendor_version IS NULL OR length(vendor_version) <= 120),
  origin_device_id uuid NULL REFERENCES attendance_adms_devices(id) ON DELETE SET NULL,
  source_pin text NULL CHECK (source_pin IS NULL OR length(source_pin) BETWEEN 1 AND 128),
  captured_at timestamptz NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  lifecycle text NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active', 'retired', 'destroyed')),
  payload_sha256 text NULL CHECK (payload_sha256 IS NULL OR payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_byte_length integer NULL CHECK (payload_byte_length IS NULL OR payload_byte_length >= 0),
  encryption_key_id text NULL CHECK (encryption_key_id IS NULL OR length(encryption_key_id) BETWEEN 1 AND 80),
  payload_ciphertext bytea NULL,
  payload_iv bytea NULL,
  payload_auth_tag bytea NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  destroyed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      lifecycle IN ('active', 'retired')
      AND payload_sha256 IS NOT NULL
      AND payload_byte_length IS NOT NULL
      AND encryption_key_id IS NOT NULL
      AND payload_ciphertext IS NOT NULL
      AND payload_iv IS NOT NULL
      AND octet_length(payload_iv) = 12
      AND payload_auth_tag IS NOT NULL
      AND octet_length(payload_auth_tag) = 16
      AND destroyed_at IS NULL
    )
    OR
    (
      lifecycle = 'destroyed'
      AND payload_sha256 IS NULL
      AND payload_byte_length IS NULL
      AND encryption_key_id IS NULL
      AND payload_ciphertext IS NULL
      AND payload_iv IS NULL
      AND payload_auth_tag IS NULL
      AND destroyed_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_biometric_credentials_active_dedupe_idx
  ON attendance_biometric_credentials (employee_id, modality, payload_sha256)
  WHERE payload_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS attendance_biometric_credentials_employee_idx
  ON attendance_biometric_credentials (employee_id, lifecycle, modality, created_at DESC);

CREATE TABLE IF NOT EXISTS attendance_biometric_device_states (
  credential_id uuid NOT NULL REFERENCES attendance_biometric_credentials(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (
    state IN ('unknown', 'missing', 'present', 'stale', 'conflict', 'pending', 'succeeded', 'failed')
  ),
  device_payload_sha256 text NULL CHECK (
    device_payload_sha256 IS NULL OR device_payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  device_vendor_format text NULL CHECK (
    device_vendor_format IS NULL OR length(device_vendor_format) <= 120
  ),
  observed_at timestamptz NULL,
  last_synced_at timestamptz NULL,
  last_error_code text NULL CHECK (last_error_code IS NULL OR length(last_error_code) <= 120),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (credential_id, device_id)
);

CREATE INDEX IF NOT EXISTS attendance_biometric_device_states_device_idx
  ON attendance_biometric_device_states (device_id, state, updated_at DESC);

CREATE TABLE IF NOT EXISTS attendance_biometric_audit_events (
  id uuid PRIMARY KEY,
  actor_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action IN (
      'credential_imported',
      'credential_retired',
      'distribution_requested',
      'distribution_succeeded',
      'distribution_failed',
      'device_delete_requested',
      'device_deleted',
      'master_destroyed',
      'enrollment_requested',
      'enrollment_completed',
      'enrollment_failed'
    )
  ),
  credential_id uuid NULL REFERENCES attendance_biometric_credentials(id) ON DELETE RESTRICT,
  employee_id uuid NULL REFERENCES employees(id) ON DELETE RESTRICT,
  device_id uuid NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_biometric_audit_credential_idx
  ON attendance_biometric_audit_events (credential_id, created_at DESC);

CREATE INDEX IF NOT EXISTS attendance_biometric_audit_employee_idx
  ON attendance_biometric_audit_events (employee_id, created_at DESC);

CREATE OR REPLACE FUNCTION reject_attendance_biometric_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'biometric audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS attendance_biometric_audit_immutable
  ON attendance_biometric_audit_events;
CREATE TRIGGER attendance_biometric_audit_immutable
BEFORE UPDATE OR DELETE ON attendance_biometric_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_attendance_biometric_audit_mutation();
