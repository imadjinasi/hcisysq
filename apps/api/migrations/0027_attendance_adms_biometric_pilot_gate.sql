ALTER TABLE attendance_adms_devices
  ADD COLUMN IF NOT EXISTS biometric_collection_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS biometric_collection_enabled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS biometric_collection_enabled_by_account_id uuid NULL
    REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE attendance_adms_devices
  DROP CONSTRAINT IF EXISTS attendance_adms_devices_biometric_collection_provenance_check;
ALTER TABLE attendance_adms_devices
  ADD CONSTRAINT attendance_adms_devices_biometric_collection_provenance_check
  CHECK (
    NOT biometric_collection_enabled
    OR biometric_collection_enabled_at IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS attendance_adms_devices_biometric_collection_idx
  ON attendance_adms_devices (biometric_collection_enabled, lifecycle)
  WHERE biometric_collection_enabled = true;
