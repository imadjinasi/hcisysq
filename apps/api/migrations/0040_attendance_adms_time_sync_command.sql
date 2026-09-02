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
          'work_code_delivery', 'message_delivery', 'time_sync', 'duplicate_punch_period', 'reboot',
          'biometric_query', 'biometric_restore', 'biometric_enrollment', 'biometric_delete',
          'clear_attendance', 'clear_photo_cache', 'clear_all_data', 'firmware_upgrade'
        )
      )
    );

ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_wire_command_check;
ALTER TABLE attendance_adms_commands
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
      OR wire_command ~ '^SET OPTION AlarmReRec=[0-9]{1,5}$'
      OR wire_command ~ '^SET OPTIONS DateTime=[0-9]{1,12}$'
      OR wire_command ~ '^DATA QUERY FINGERTMP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}$'
      OR wire_command ~ '^DATA QUERY tablename=biodata,fielddesc=\*,filter=Type=(1|2|6|8|9|10)\tPin=[0-9]{1,128}\tNo=[0-9]{1,3}$'
      OR wire_command ~ '^ENROLL_FP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}\tRETRY=[0-9]{1,2}\tOVERWRITE=[01]$'
      OR wire_command ~ '^ENROLL_BIO TYPE=(1|2|6|8|9|10)\tNO=[0-9]{1,3}\tPIN=[0-9]{1,128}\tRETRY=[0-9]{1,2}\tOVERWRITE=[01]\tMODE=1$'
      OR wire_command ~ '^DATA DELETE FINGERTMP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}$'
      OR wire_command ~ '^DATA DELETE FACE PIN=[0-9]{1,128}$'
      OR wire_command ~ '^DATA DELETE BIODATA Pin=[0-9]{1,128}\tType=(1|2|6|8|9|10)\tNo=[0-9]{1,3}$'
      OR wire_command ~ '^UPGRADE type=1,checksum=[0-9a-f]{32},size=[0-9]{1,9},url=/iclock/file\?token=[A-Za-z0-9_-]{32,128}$'
    );

ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_shape_check;
ALTER TABLE attendance_adms_commands
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
          OR (command_type = 'device_option' AND physical_capability_key = 'time_sync' AND wire_command = 'TIME_SYNC')
          OR (command_type = 'reboot' AND physical_capability_key = 'reboot' AND wire_command = 'REBOOT')
          OR (command_type = 'biometric_query' AND physical_capability_key = 'biometric_query')
          OR (command_type = 'biometric_restore' AND physical_capability_key = 'biometric_restore' AND wire_command = 'BIOMETRIC_RESTORE' AND biometric_credential_id IS NOT NULL)
          OR (command_type = 'biometric_enroll' AND physical_capability_key = 'biometric_enrollment')
          OR (command_type = 'biometric_delete' AND physical_capability_key = 'biometric_delete')
          OR (command_type = 'device_clear' AND physical_capability_key IN ('clear_attendance', 'clear_photo_cache', 'clear_all_data'))
          OR (command_type = 'firmware_upgrade' AND physical_capability_key = 'firmware_upgrade' AND wire_command = 'FIRMWARE_UPGRADE' AND firmware_ticket_id IS NOT NULL)
        )
      )
    );
