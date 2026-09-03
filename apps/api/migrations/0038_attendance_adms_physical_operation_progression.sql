CREATE OR REPLACE FUNCTION advance_attendance_adms_physical_operation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  op attendance_adms_physical_operations%ROWTYPE;
  next_command_id uuid;
  terminal_status text;
  target_work_code_id uuid;
  target_message_id uuid;
BEGIN
  IF NEW.physical_operation_id IS NULL OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO op
  FROM attendance_adms_physical_operations
  WHERE id = NEW.physical_operation_id
  FOR UPDATE;

  IF op.id IS NULL OR op.status <> 'running' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'succeeded' THEN
    SELECT id INTO next_command_id
    FROM attendance_adms_commands
    WHERE physical_operation_id = NEW.physical_operation_id
      AND status = 'queued'
    ORDER BY physical_sequence
    LIMIT 1
    FOR UPDATE;

    IF next_command_id IS NOT NULL THEN
      UPDATE attendance_adms_commands
      SET status = 'pending', updated_at = NEW.updated_at
      WHERE id = next_command_id;
      RETURN NEW;
    END IF;

    UPDATE attendance_adms_physical_operations
    SET status = 'succeeded', completed_at = NEW.updated_at, updated_at = NEW.updated_at
    WHERE id = op.id;

    IF op.mode = 'canary' THEN
      INSERT INTO attendance_adms_physical_capabilities (
        device_id, capability_key, state, last_operation_id, last_result_code,
        verified_at, verified_by_account_id, safe_metadata, updated_at
      ) VALUES (
        op.device_id, op.capability_key, 'verified', op.id, NEW.return_code,
        NEW.updated_at, op.requested_by_account_id,
        jsonb_build_object('lastVerifiedOperationKey', op.operation_key), NEW.updated_at
      )
      ON CONFLICT (device_id, capability_key) DO UPDATE
      SET state = 'verified',
          last_operation_id = EXCLUDED.last_operation_id,
          last_result_code = EXCLUDED.last_result_code,
          verified_at = EXCLUDED.verified_at,
          verified_by_account_id = EXCLUDED.verified_by_account_id,
          safe_metadata = attendance_adms_physical_capabilities.safe_metadata || EXCLUDED.safe_metadata,
          updated_at = EXCLUDED.updated_at;
    END IF;

    IF op.capability_key = 'work_code_delivery' THEN
      target_work_code_id := NULLIF(op.safe_metadata ->> 'workCodeId', '')::uuid;
      IF target_work_code_id IS NOT NULL THEN
        UPDATE attendance_adms_work_code_targets AS target
        SET delivery_state = 'succeeded', updated_at = NEW.updated_at
        WHERE target.work_code_id = target_work_code_id
          AND target.device_id = op.device_id;
      END IF;
    ELSIF op.capability_key = 'message_delivery' THEN
      target_message_id := NULLIF(op.safe_metadata ->> 'messageId', '')::uuid;
      IF target_message_id IS NOT NULL THEN
        UPDATE attendance_adms_device_message_targets AS target
        SET delivery_state = 'succeeded', updated_at = NEW.updated_at
        WHERE target.message_id = target_message_id
          AND target.device_id = op.device_id;
      END IF;
    ELSIF op.capability_key = 'biometric_restore' AND NEW.biometric_credential_id IS NOT NULL THEN
      INSERT INTO attendance_biometric_device_states (
        credential_id, device_id, state, observed_at, last_error_code, safe_metadata, updated_at
      ) VALUES (
        NEW.biometric_credential_id, op.device_id, 'present', NEW.updated_at, NULL,
        jsonb_build_object('source', 'physical_restore_command'), NEW.updated_at
      )
      ON CONFLICT (credential_id, device_id) DO UPDATE
      SET state = 'present', observed_at = EXCLUDED.observed_at, last_error_code = NULL,
          safe_metadata = attendance_biometric_device_states.safe_metadata || EXCLUDED.safe_metadata,
          updated_at = EXCLUDED.updated_at;
    ELSIF op.capability_key = 'biometric_delete' AND NEW.biometric_credential_id IS NOT NULL THEN
      INSERT INTO attendance_biometric_device_states (
        credential_id, device_id, state, observed_at, last_error_code, safe_metadata, updated_at
      ) VALUES (
        NEW.biometric_credential_id, op.device_id, 'missing', NEW.updated_at, NULL,
        jsonb_build_object('source', 'physical_delete_command'), NEW.updated_at
      )
      ON CONFLICT (credential_id, device_id) DO UPDATE
      SET state = 'missing', observed_at = EXCLUDED.observed_at, last_error_code = NULL,
          safe_metadata = attendance_biometric_device_states.safe_metadata || EXCLUDED.safe_metadata,
          updated_at = EXCLUDED.updated_at;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status IN ('failed', 'expired', 'cancelled') THEN
    terminal_status := CASE WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'failed' END;

    UPDATE attendance_adms_commands
    SET status = 'cancelled', completed_at = COALESCE(completed_at, NEW.updated_at), updated_at = NEW.updated_at
    WHERE physical_operation_id = NEW.physical_operation_id
      AND status = 'queued';

    UPDATE attendance_adms_physical_operations
    SET status = terminal_status,
        failure_code = CASE
          WHEN NEW.return_code IS NULL THEN 'command_' || NEW.status
          ELSE 'device_return_' || NEW.return_code::text
        END,
        completed_at = NEW.updated_at,
        updated_at = NEW.updated_at
    WHERE id = op.id;

    IF op.mode = 'canary' THEN
      INSERT INTO attendance_adms_physical_capabilities (
        device_id, capability_key, state, last_operation_id, last_result_code,
        safe_metadata, updated_at
      ) VALUES (
        op.device_id, op.capability_key, 'failed', op.id, NEW.return_code,
        jsonb_build_object('lastFailedOperationKey', op.operation_key), NEW.updated_at
      )
      ON CONFLICT (device_id, capability_key) DO UPDATE
      SET state = 'failed',
          last_operation_id = EXCLUDED.last_operation_id,
          last_result_code = EXCLUDED.last_result_code,
          safe_metadata = attendance_adms_physical_capabilities.safe_metadata || EXCLUDED.safe_metadata,
          updated_at = EXCLUDED.updated_at;
    END IF;

    IF op.capability_key = 'work_code_delivery' THEN
      target_work_code_id := NULLIF(op.safe_metadata ->> 'workCodeId', '')::uuid;
      IF target_work_code_id IS NOT NULL THEN
        UPDATE attendance_adms_work_code_targets AS target
        SET delivery_state = 'failed', updated_at = NEW.updated_at
        WHERE target.work_code_id = target_work_code_id
          AND target.device_id = op.device_id;
      END IF;
    ELSIF op.capability_key = 'message_delivery' THEN
      target_message_id := NULLIF(op.safe_metadata ->> 'messageId', '')::uuid;
      IF target_message_id IS NOT NULL THEN
        UPDATE attendance_adms_device_message_targets AS target
        SET delivery_state = 'failed', updated_at = NEW.updated_at
        WHERE target.message_id = target_message_id
          AND target.device_id = op.device_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_physical_operation_advance ON attendance_adms_commands;
CREATE TRIGGER attendance_adms_physical_operation_advance
AFTER UPDATE OF status ON attendance_adms_commands
FOR EACH ROW
EXECUTE FUNCTION advance_attendance_adms_physical_operation();
