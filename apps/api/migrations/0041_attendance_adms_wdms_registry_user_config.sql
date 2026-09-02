ALTER TABLE attendance_adms_devices
  ADD COLUMN IF NOT EXISTS organizational_unit_id uuid NULL
    REFERENCES organizational_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_context text NULL,
  ADD COLUMN IF NOT EXISTS worksite_label text NULL,
  ADD COLUMN IF NOT EXISTS device_role text NOT NULL DEFAULT 'attendance_only',
  ADD COLUMN IF NOT EXISTS transfer_mode text NOT NULL DEFAULT 'push',
  ADD COLUMN IF NOT EXISTS heartbeat_interval_seconds integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS desired_push_protocol_version text NULL;

ALTER TABLE attendance_adms_devices
  DROP CONSTRAINT IF EXISTS attendance_adms_devices_area_context_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_devices_worksite_label_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_devices_device_role_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_devices_transfer_mode_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_devices_heartbeat_interval_seconds_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_devices_desired_push_protocol_version_check;
ALTER TABLE attendance_adms_devices
  ADD CONSTRAINT attendance_adms_devices_area_context_check
    CHECK (area_context IS NULL OR char_length(area_context) BETWEEN 1 AND 160),
  ADD CONSTRAINT attendance_adms_devices_worksite_label_check
    CHECK (worksite_label IS NULL OR char_length(worksite_label) BETWEEN 1 AND 160),
  ADD CONSTRAINT attendance_adms_devices_device_role_check
    CHECK (device_role = 'attendance_only'),
  ADD CONSTRAINT attendance_adms_devices_transfer_mode_check
    CHECK (transfer_mode = 'push'),
  ADD CONSTRAINT attendance_adms_devices_heartbeat_interval_seconds_check
    CHECK (heartbeat_interval_seconds BETWEEN 5 AND 3600),
  ADD CONSTRAINT attendance_adms_devices_desired_push_protocol_version_check
    CHECK (
      desired_push_protocol_version IS NULL
      OR desired_push_protocol_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    );

CREATE TABLE IF NOT EXISTS attendance_adms_job_codes (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9A-Za-z._-]{1,32}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance_adms_physical_capabilities
  DROP CONSTRAINT IF EXISTS attendance_adms_physical_capabilities_capability_key_check;
ALTER TABLE attendance_adms_physical_capabilities
  ADD CONSTRAINT attendance_adms_physical_capabilities_capability_key_check
  CHECK (capability_key IN (
    'work_code_delivery', 'message_delivery', 'time_sync', 'duplicate_punch_period',
    'reboot', 'biometric_query', 'biometric_restore', 'biometric_enrollment',
    'biometric_delete', 'clear_attendance', 'clear_photo_cache', 'clear_all_data',
    'firmware_upgrade', 'attendance_photo', 'user_profile_upsert',
    'user_enable_disable', 'server_config', 'ntp_config'
  ));

ALTER TABLE attendance_adms_physical_operations
  DROP CONSTRAINT IF EXISTS attendance_adms_physical_operations_capability_key_check;
ALTER TABLE attendance_adms_physical_operations
  ADD CONSTRAINT attendance_adms_physical_operations_capability_key_check
  CHECK (capability_key IN (
    'work_code_delivery', 'message_delivery', 'time_sync', 'duplicate_punch_period',
    'reboot', 'biometric_query', 'biometric_restore', 'biometric_enrollment',
    'biometric_delete', 'clear_attendance', 'clear_photo_cache', 'clear_all_data',
    'firmware_upgrade', 'attendance_photo', 'user_profile_upsert',
    'user_enable_disable', 'server_config', 'ntp_config'
  ));

ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_physical_shape_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_type_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_wire_command_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_shape_check;

ALTER TABLE attendance_adms_commands
  ADD CONSTRAINT attendance_adms_commands_physical_shape_check
    CHECK (
      (physical_operation_id IS NULL AND physical_sequence IS NULL AND physical_capability_key IS NULL)
      OR (
        physical_operation_id IS NOT NULL
        AND physical_sequence IS NOT NULL
        AND physical_sequence > 0
        AND physical_capability_key IN (
          'work_code_delivery', 'message_delivery', 'time_sync', 'duplicate_punch_period',
          'reboot', 'biometric_query', 'biometric_restore', 'biometric_enrollment',
          'biometric_delete', 'clear_attendance', 'clear_photo_cache', 'clear_all_data',
          'firmware_upgrade', 'user_profile_upsert', 'user_enable_disable',
          'server_config', 'ntp_config'
        )
      )
    ),
  ADD CONSTRAINT attendance_adms_commands_command_type_check
    CHECK (command_type IN (
      'sync_new', 'data_query', 'read_info', 'query_user_info', 'update_user_info',
      'physical_work_code', 'physical_message', 'physical_user', 'device_option',
      'device_network', 'reboot', 'biometric_query', 'biometric_restore',
      'biometric_enroll', 'biometric_delete', 'device_clear', 'firmware_upgrade'
    )),
  ADD CONSTRAINT attendance_adms_commands_wire_command_check
    CHECK (
      wire_command IN (
        'LOG', 'INFO', 'DATA QUERY USERINFO', 'RELOAD OPTIONS', 'REBOOT',
        'CLEAR LOG', 'CLEAR PHOTO', 'CLEAR DATA', 'BIOMETRIC_RESTORE',
        'FIRMWARE_UPGRADE', 'TIME_SYNC'
      )
      OR wire_command ~ '^DATA QUERY ATTLOG StartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\tEndTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$'
      OR wire_command ~ '^DATA UPDATE USERINFO PIN=[0-9]{1,128}\tName=[^\t\r\n]{1,160}$'
      OR wire_command ~ '^DATA UPDATE WORKCODE CODE=[0-9]{1,10}\tName=[^\t\r\n]{1,120}$'
      OR wire_command ~ '^DATA DELETE WORKCODE CODE=[0-9]{1,10}$'
      OR wire_command ~ '^DATA UPDATE SMS MSG=[^\t\r\n]{1,500}\tTAG=(253|254)\tUID=[0-9]{1,10}\tMIN=[0-9]{1,6}\tStartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA UPDATE USER_SMS PIN=[0-9]{1,128}\tUID=[0-9]{1,10}$'
      OR wire_command ~ '^DATA DELETE SMS UID=[0-9]{1,10}$'
      OR wire_command ~ '^DATA UPDATE user Pin=[0-9]{1,128}\tName=[^\t\r\n]{1,160}\tPasswd=\tCard=\tGroup=[0-9]{1,2}\tPri=0\tExpiredTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA UPDATE user Pin=[0-9]{1,128}\tExpiredTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA UPDATE userauthorize Pin=[0-9]{1,128}\tAuthorizeTimezoneId=[0-9]{1,2}\tAuthorizeDoorId=[0-9]{1,2}$'
      OR wire_command ~ '^SET OPTION AlarmReRec=[0-9]{1,5}$'
      OR wire_command ~ '^SET OPTIONS DateTime=[0-9]{1,12}$'
      OR wire_command ~ '^SET OPTIONS NTPServer=[A-Za-z0-9._:-]{1,253}$'
      OR wire_command ~ '^SET OPTIONS WebServerIP=[A-Za-z0-9._:-]{1,253},WebServerPort=[0-9]{1,5}$'
      OR wire_command ~ '^DATA QUERY FINGERTMP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}$'
      OR wire_command ~ '^DATA QUERY tablename=biodata,fielddesc=\*,filter=Type=(1|2|6|8|9|10)\tPin=[0-9]{1,128}\tNo=[0-9]{1,3}$'
      OR wire_command ~ '^ENROLL_FP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}\tRETRY=[0-9]{1,2}\tOVERWRITE=[01]$'
      OR wire_command ~ '^ENROLL_BIO TYPE=(1|2|6|8|9|10)\tNO=[0-9]{1,3}\tPIN=[0-9]{1,128}\tRETRY=[0-9]{1,2}\tOVERWRITE=[01]\tMODE=1$'
      OR wire_command ~ '^DATA DELETE FINGERTMP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}$'
      OR wire_command ~ '^DATA DELETE FACE PIN=[0-9]{1,128}$'
      OR wire_command ~ '^DATA DELETE BIODATA Pin=[0-9]{1,128}\tType=(1|2|6|8|9|10)\tNo=[0-9]{1,3}$'
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
          OR (command_type = 'physical_user' AND physical_capability_key IN ('user_profile_upsert', 'user_enable_disable'))
          OR (command_type = 'device_option' AND physical_capability_key IN ('duplicate_punch_period', 'time_sync', 'ntp_config'))
          OR (command_type = 'device_network' AND physical_capability_key = 'server_config')
          OR (command_type = 'reboot' AND physical_capability_key = 'reboot' AND wire_command = 'REBOOT')
          OR (command_type = 'biometric_query' AND physical_capability_key = 'biometric_query')
          OR (command_type = 'biometric_restore' AND physical_capability_key = 'biometric_restore' AND wire_command = 'BIOMETRIC_RESTORE' AND biometric_credential_id IS NOT NULL)
          OR (command_type = 'biometric_enroll' AND physical_capability_key = 'biometric_enrollment')
          OR (command_type = 'biometric_delete' AND physical_capability_key = 'biometric_delete')
          OR (command_type = 'device_clear' AND physical_capability_key IN ('clear_attendance', 'clear_photo_cache', 'clear_all_data'))
          OR (
            command_type = 'firmware_upgrade'
            AND physical_capability_key = 'firmware_upgrade'
            AND wire_command ~ '^UPGRADE type=1,checksum=[0-9a-f]{32},size=[0-9]{1,9},url=/iclock/file\?token=[A-Za-z0-9_-]{32,128}$'
            AND firmware_ticket_id IS NOT NULL
          )
        )
      )
    );

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
      'physical_capability_updated', 'firmware_package_uploaded',
      'wdms_device_profile_updated', 'job_code_saved'
    ));
