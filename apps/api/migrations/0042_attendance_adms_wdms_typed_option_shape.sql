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
          OR (
            command_type = 'device_option'
            AND physical_capability_key IN (
              'duplicate_punch_period', 'time_sync', 'ntp_config',
              'user_profile_upsert', 'user_enable_disable', 'server_config'
            )
          )
          OR (command_type = 'physical_user' AND physical_capability_key IN ('user_profile_upsert', 'user_enable_disable'))
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
