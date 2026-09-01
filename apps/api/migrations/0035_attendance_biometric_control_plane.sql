ALTER TABLE attendance_biometric_credentials
  ADD COLUMN IF NOT EXISTS envelope_version text NOT NULL DEFAULT 'aes-256-gcm-v1',
  ADD COLUMN IF NOT EXISTS last_reencrypted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_reencrypted_by_account_id uuid NULL
    REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE attendance_biometric_credentials
  DROP CONSTRAINT IF EXISTS attendance_biometric_credentials_envelope_version_check;
ALTER TABLE attendance_biometric_credentials
  ADD CONSTRAINT attendance_biometric_credentials_envelope_version_check
    CHECK (length(envelope_version) BETWEEN 1 AND 80);

CREATE INDEX IF NOT EXISTS attendance_biometric_credentials_lifecycle_review_idx
  ON attendance_biometric_credentials (lifecycle, employee_id, updated_at DESC);

ALTER TABLE attendance_biometric_audit_events
  DROP CONSTRAINT IF EXISTS attendance_biometric_audit_events_action_check;
ALTER TABLE attendance_biometric_audit_events
  ADD CONSTRAINT attendance_biometric_audit_events_action_check
    CHECK (
      action IN (
        'credential_imported',
        'credential_retired',
        'credential_reencrypted',
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
    );
