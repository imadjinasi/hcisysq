CREATE OR REPLACE FUNCTION enforce_attendance_adms_biometric_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lifecycle <> 'active' THEN
    NEW.biometric_collection_enabled := false;
    NEW.biometric_collection_enabled_at := NULL;
    NEW.biometric_collection_enabled_by_account_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_biometric_lifecycle_guard
  ON attendance_adms_devices;
CREATE TRIGGER attendance_adms_biometric_lifecycle_guard
BEFORE UPDATE OF lifecycle ON attendance_adms_devices
FOR EACH ROW EXECUTE FUNCTION enforce_attendance_adms_biometric_lifecycle_guard();

ALTER TABLE attendance_adms_devices
  DROP CONSTRAINT IF EXISTS attendance_adms_devices_biometric_active_lifecycle_check;
ALTER TABLE attendance_adms_devices
  ADD CONSTRAINT attendance_adms_devices_biometric_active_lifecycle_check
  CHECK (NOT biometric_collection_enabled OR lifecycle = 'active');
