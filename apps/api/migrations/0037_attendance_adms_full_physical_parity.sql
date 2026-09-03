CREATE TABLE IF NOT EXISTS attendance_adms_physical_capabilities (
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  capability_key text NOT NULL CHECK (capability_key IN (
    'work_code_delivery', 'message_delivery', 'time_sync', 'duplicate_punch_period',
    'reboot', 'biometric_query', 'biometric_restore', 'biometric_enrollment',
    'biometric_delete', 'clear_attendance', 'clear_photo_cache', 'clear_all_data',
    'firmware_upgrade', 'attendance_photo'
  )),
  state text NOT NULL DEFAULT 'documented' CHECK (
    state IN ('documented', 'canary_pending', 'verified', 'failed', 'unsupported', 'blocked')
  ),
  last_operation_id uuid NULL,
  last_result_code integer NULL,
  verified_at timestamptz NULL,
  verified_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, capability_key)
);

CREATE TABLE IF NOT EXISTS attendance_adms_physical_operations (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  capability_key text NOT NULL CHECK (capability_key IN (
    'work_code_delivery', 'message_delivery', 'time_sync', 'duplicate_punch_period',
    'reboot', 'biometric_query', 'biometric_restore', 'biometric_enrollment',
    'biometric_delete', 'clear_attendance', 'clear_photo_cache', 'clear_all_data',
    'firmware_upgrade', 'attendance_photo'
  )),
  operation_key text NOT NULL CHECK (char_length(operation_key) BETWEEN 1 AND 80),
  mode text NOT NULL CHECK (mode IN ('canary', 'execute')),
  status text NOT NULL DEFAULT 'running' CHECK (
    status IN ('running', 'succeeded', 'failed', 'cancelled')
  ),
  destructive boolean NOT NULL DEFAULT false,
  requested_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code text NULL CHECK (failure_code IS NULL OR char_length(failure_code) <= 120),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status <> 'running' AND completed_at IS NOT NULL)
  )
);

ALTER TABLE attendance_adms_physical_capabilities
  DROP CONSTRAINT IF EXISTS attendance_adms_physical_capabilities_last_operation_id_fkey;
ALTER TABLE attendance_adms_physical_capabilities
  ADD CONSTRAINT attendance_adms_physical_capabilities_last_operation_id_fkey
  FOREIGN KEY (last_operation_id) REFERENCES attendance_adms_physical_operations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS attendance_adms_physical_operations_device_created_idx
  ON attendance_adms_physical_operations (device_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_physical_operations_one_running_capability_idx
  ON attendance_adms_physical_operations (device_id, capability_key)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS attendance_adms_firmware_packages (
  id uuid PRIMARY KEY,
  target_model text NOT NULL CHECK (char_length(target_model) BETWEEN 1 AND 160),
  target_version text NOT NULL CHECK (char_length(target_version) BETWEEN 1 AND 160),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
  md5 text NOT NULL CHECK (md5 ~ '^[0-9a-f]{32}$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 1 AND 134217728),
  payload bytea NOT NULL,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_model, target_version, sha256)
);

CREATE TABLE IF NOT EXISTS attendance_adms_firmware_download_tickets (
  id uuid PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES attendance_adms_firmware_packages(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_adms_firmware_download_tickets_device_idx
  ON attendance_adms_firmware_download_tickets (device_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS attendance_adms_attendance_photos (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  source_request_id uuid NOT NULL UNIQUE REFERENCES attendance_adms_request_journal(id) ON DELETE RESTRICT,
  pin text NULL CHECK (pin IS NULL OR pin ~ '^[0-9]{1,128}$'),
  occurred_at_raw text NULL CHECK (occurred_at_raw IS NULL OR char_length(occurred_at_raw) <= 80),
  occurred_at timestamptz NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_byte_length integer NOT NULL CHECK (payload_byte_length BETWEEN 1 AND 5242880),
  encryption_key_id text NOT NULL CHECK (char_length(encryption_key_id) BETWEEN 1 AND 80),
  payload_ciphertext bytea NOT NULL,
  payload_iv bytea NOT NULL,
  payload_auth_tag bytea NOT NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_adms_attendance_photos_device_time_idx
  ON attendance_adms_attendance_photos (device_id, occurred_at DESC NULLS LAST, created_at DESC);

DROP TRIGGER IF EXISTS attendance_adms_attendance_photos_immutable ON attendance_adms_attendance_photos;
CREATE TRIGGER attendance_adms_attendance_photos_immutable
BEFORE UPDATE OR DELETE ON attendance_adms_attendance_photos
FOR EACH ROW EXECUTE FUNCTION reject_attendance_adms_fact_mutation();

ALTER TABLE attendance_adms_commands
  ADD COLUMN IF NOT EXISTS physical_operation_id uuid NULL
    REFERENCES attendance_adms_physical_operations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS physical_sequence integer NULL,
  ADD COLUMN IF NOT EXISTS physical_capability_key text NULL,
  ADD COLUMN IF NOT EXISTS biometric_credential_id uuid NULL
    REFERENCES attendance_biometric_credentials(id) ON DELETE RESTRICT;

ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_physical_shape_check;
ALTER TABLE attendance_adms_commands
  ADD CONSTRAINT attendance_adms_commands_physical_shape_check
    CHECK (
      (physical_operation_id IS NULL AND physical_sequence IS NULL AND physical_capability_key IS NULL)
      OR (
        physical_operation_id IS NOT NULL
        AND physical_sequence IS NOT NULL
        AND physical_sequence > 0
        AND physical_capability_key IN (
          'work_code_delivery', 'message_delivery', 'duplicate_punch_period', 'reboot',
          'biometric_query', 'biometric_restore', 'biometric_enrollment', 'biometric_delete',
          'clear_attendance', 'clear_photo_cache', 'clear_all_data', 'firmware_upgrade'
        )
      )
    );
CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_commands_physical_sequence_idx
  ON attendance_adms_commands (physical_operation_id, physical_sequence)
  WHERE physical_operation_id IS NOT NULL;

ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_status_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_type_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_wire_command_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_reason_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_shape_check;

ALTER TABLE attendance_adms_commands
  ADD CONSTRAINT attendance_adms_commands_status_check
    CHECK (status IN (
      'queued', 'pending', 'delivered', 'acknowledged',
      'succeeded', 'failed', 'expired', 'cancelled'
    )),
  ADD CONSTRAINT attendance_adms_commands_command_type_check
    CHECK (command_type IN (
      'sync_new', 'data_query', 'read_info', 'query_user_info', 'update_user_info',
      'physical_work_code', 'physical_message', 'device_option', 'reboot',
      'biometric_query', 'biometric_restore', 'biometric_enroll', 'biometric_delete',
      'device_clear', 'firmware_upgrade'
    )),
  ADD CONSTRAINT attendance_adms_commands_reason_check
    CHECK (reason IN (
      'registration_recovery', 'admin_sync_new', 'admin_range_recovery',
      'admin_long_range_recovery', 'admin_read_information',
      'scheduled_reconciliation', 'admin_query_user_info', 'admin_update_user_info',
      'admin_physical_operation'
    )),
  ADD CONSTRAINT attendance_adms_commands_wire_command_check
    CHECK (
      wire_command IN (
        'LOG', 'INFO', 'DATA QUERY USERINFO', 'RELOAD OPTIONS', 'REBOOT',
        'CLEAR LOG', 'CLEAR PHOTO', 'CLEAR DATA', 'BIOMETRIC_RESTORE'
      )
      OR wire_command ~ '^DATA QUERY ATTLOG StartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\tEndTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$'
      OR wire_command ~ '^DATA UPDATE USERINFO PIN=[0-9]{1,128}\tName=[^\t\r\n]{1,160}$'
      OR wire_command ~ '^DATA UPDATE WORKCODE CODE=[0-9]{1,10}\tName=[^\t\r\n]{1,120}$'
      OR wire_command ~ '^DATA DELETE WORKCODE CODE=[0-9]{1,10}$'
      OR wire_command ~ '^DATA UPDATE SMS MSG=[^\t\r\n]{1,500}\tTAG=(253|254)\tUID=[0-9]{1,10}\tMIN=[0-9]{1,6}\tStartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA UPDATE USER_SMS PIN=[0-9]{1,128}\tUID=[0-9]{1,10}$'
      OR wire_command ~ '^DATA DELETE SMS UID=[0-9]{1,10}$'
      OR wire_command ~ '^SET OPTION AlarmReRec=[0-9]{1,5}$'
      OR wire_command ~ '^DATA QUERY FINGERTMP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}$'
      OR wire_command ~ '^DATA QUERY tablename=biodata,fielddesc=\*,filter=Type=(1|2|6|8|9|10)\tPin=[0-9]{1,128}\tNo=[0-9]{1,3}$'
      OR wire_command ~ '^ENROLL_FP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}\tRETRY=[0-9]{1,2}\tOVERWRITE=[01]$'
      OR wire_command ~ '^ENROLL_BIO TYPE=(1|2|6|8|9|10)\tNO=[0-9]{1,3}\tPIN=[0-9]{1,128}\tRETRY=[0-9]{1,2}\tOVERWRITE=[01]\tMODE=1$'
      OR wire_command ~ '^DATA DELETE FINGERTMP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}$'
      OR wire_command ~ '^UPGRADE type=1,checksum=[0-9a-f]{32},size=[0-9]{1,9},url=/iclock/file\?token=[A-Za-z0-9_-]{32,128}$'
    ),
  ADD CONSTRAINT attendance_adms_commands_command_shape_check
    CHECK (
      (
        command_type = 'sync_new'
        AND wire_command = 'LOG'
        AND reason IN ('registration_recovery', 'admin_sync_new')
        AND requested_range_start IS NULL AND requested_range_end IS NULL
        AND recovery_job_id IS NULL AND physical_operation_id IS NULL
      )
      OR (
        command_type = 'read_info'
        AND wire_command = 'INFO'
        AND reason = 'admin_read_information'
        AND requested_range_start IS NULL AND requested_range_end IS NULL
        AND recovery_job_id IS NULL AND physical_operation_id IS NULL
      )
      OR (
        command_type = 'data_query'
        AND reason IN ('admin_range_recovery', 'admin_long_range_recovery', 'scheduled_reconciliation')
        AND wire_command ~ '^DATA QUERY ATTLOG StartTime='
        AND requested_range_start IS NOT NULL AND requested_range_end IS NOT NULL
        AND requested_range_start <= requested_range_end
        AND (
          (reason = 'admin_long_range_recovery' AND recovery_job_id IS NOT NULL)
          OR (reason <> 'admin_long_range_recovery' AND recovery_job_id IS NULL)
        )
        AND physical_operation_id IS NULL
      )
      OR (
        command_type = 'query_user_info'
        AND reason = 'admin_query_user_info'
        AND (wire_command = 'DATA QUERY USERINFO' OR wire_command ~ '^DATA QUERY USERINFO PIN=')
        AND requested_range_start IS NULL AND requested_range_end IS NULL
        AND recovery_job_id IS NULL AND physical_operation_id IS NULL
      )
      OR (
        command_type = 'update_user_info'
        AND reason = 'admin_update_user_info'
        AND wire_command ~ '^DATA UPDATE USERINFO PIN='
        AND requested_range_start IS NULL AND requested_range_end IS NULL
        AND recovery_job_id IS NULL AND physical_operation_id IS NULL
      )
      OR (
        reason = 'admin_physical_operation'
        AND physical_operation_id IS NOT NULL
        AND physical_capability_key IS NOT NULL
        AND recovery_job_id IS NULL
        AND requested_range_start IS NULL AND requested_range_end IS NULL
        AND (
          (command_type = 'physical_work_code' AND physical_capability_key = 'work_code_delivery')
          OR (command_type = 'physical_message' AND physical_capability_key = 'message_delivery')
          OR (command_type = 'device_option' AND physical_capability_key = 'duplicate_punch_period')
          OR (command_type = 'reboot' AND physical_capability_key = 'reboot' AND wire_command = 'REBOOT')
          OR (command_type = 'biometric_query' AND physical_capability_key = 'biometric_query')
          OR (command_type = 'biometric_restore' AND physical_capability_key = 'biometric_restore' AND wire_command = 'BIOMETRIC_RESTORE' AND biometric_credential_id IS NOT NULL)
          OR (command_type = 'biometric_enroll' AND physical_capability_key = 'biometric_enrollment')
          OR (command_type = 'biometric_delete' AND physical_capability_key = 'biometric_delete')
          OR (command_type = 'device_clear' AND physical_capability_key IN ('clear_attendance', 'clear_photo_cache', 'clear_all_data'))
          OR (command_type = 'firmware_upgrade' AND physical_capability_key = 'firmware_upgrade')
        )
      )
    );

ALTER TABLE attendance_adms_device_messages
  ADD COLUMN IF NOT EXISTS device_uid bigint GENERATED BY DEFAULT AS IDENTITY;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_device_messages_device_uid_idx
  ON attendance_adms_device_messages (device_uid);

ALTER TABLE attendance_adms_admin_audit_events
  DROP CONSTRAINT IF EXISTS attendance_adms_admin_audit_events_action_check;
ALTER TABLE attendance_adms_admin_audit_events
  ADD CONSTRAINT attendance_adms_admin_audit_events_action_check
    CHECK (action IN (
      'device_registered', 'device_updated', 'mapping_created', 'mapping_ended',
      'device_claimed', 'transfer_requested', 'command_requested', 'command_cancelled',
      'device_user_correction_planned', 'device_user_correction_cancelled',
      'device_user_correction_resolved',
      'work_code_saved', 'work_code_target_updated',
      'device_message_saved', 'device_message_target_updated',
      'offline_attlog_imported', 'saved_filter_saved', 'saved_filter_deleted',
      'pending_commands_cleared', 'physical_operation_requested',
      'physical_capability_updated', 'firmware_package_uploaded'
    ));
