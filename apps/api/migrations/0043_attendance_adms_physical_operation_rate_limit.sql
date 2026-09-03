CREATE INDEX IF NOT EXISTS attendance_adms_physical_operations_device_capability_created_idx
  ON attendance_adms_physical_operations (device_id, capability_key, created_at DESC);

CREATE OR REPLACE FUNCTION enforce_attendance_adms_physical_operation_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance_adms_physical_operations existing
    WHERE existing.device_id = NEW.device_id
      AND existing.capability_key = NEW.capability_key
      AND existing.status = 'running'
  ) THEN
    RAISE EXCEPTION 'physical capability already has a running operation'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance_adms_physical_operations existing
    WHERE existing.device_id = NEW.device_id
      AND existing.capability_key = NEW.capability_key
      AND existing.created_at > now() - interval '30 seconds'
  ) THEN
    RAISE EXCEPTION 'physical capability rate limit exceeded'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.destructive OR NEW.capability_key = 'firmware_upgrade' THEN
    IF EXISTS (
      SELECT 1
      FROM attendance_adms_physical_operations existing
      WHERE existing.device_id = NEW.device_id
        AND (existing.destructive OR existing.capability_key = 'firmware_upgrade')
        AND existing.created_at > now() - interval '1 hour'
    ) THEN
      RAISE EXCEPTION 'destructive physical operation cooldown is active'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_physical_operation_rate_limit ON attendance_adms_physical_operations;
CREATE TRIGGER attendance_adms_physical_operation_rate_limit
BEFORE INSERT ON attendance_adms_physical_operations
FOR EACH ROW
EXECUTE FUNCTION enforce_attendance_adms_physical_operation_rate_limit();
