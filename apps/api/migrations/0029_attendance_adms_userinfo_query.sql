ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_type_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_wire_command_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_reason_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_shape_check;

ALTER TABLE attendance_adms_commands
  ADD CONSTRAINT attendance_adms_commands_command_type_check
    CHECK (command_type IN ('sync_new', 'data_query', 'read_info', 'query_user_info')),
  ADD CONSTRAINT attendance_adms_commands_reason_check
    CHECK (reason IN (
      'registration_recovery', 'admin_sync_new', 'admin_range_recovery',
      'admin_read_information', 'scheduled_reconciliation', 'admin_query_user_info'
    )),
  ADD CONSTRAINT attendance_adms_commands_wire_command_check
    CHECK (
      wire_command IN ('LOG', 'INFO')
      OR wire_command ~ '^DATA QUERY ATTLOG StartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\tEndTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$'
    ),
  ADD CONSTRAINT attendance_adms_commands_command_shape_check
    CHECK (
      (
        command_type = 'sync_new'
        AND wire_command = 'LOG'
        AND reason IN ('registration_recovery', 'admin_sync_new')
        AND requested_range_start IS NULL
        AND requested_range_end IS NULL
      )
      OR (
        command_type = 'read_info'
        AND wire_command = 'INFO'
        AND reason = 'admin_read_information'
        AND requested_range_start IS NULL
        AND requested_range_end IS NULL
      )
      OR (
        command_type = 'data_query'
        AND reason IN ('admin_range_recovery', 'scheduled_reconciliation')
        AND wire_command ~ '^DATA QUERY ATTLOG StartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\tEndTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
        AND requested_range_start IS NOT NULL
        AND requested_range_end IS NOT NULL
        AND requested_range_start <= requested_range_end
      )
      OR (
        command_type = 'query_user_info'
        AND reason = 'admin_query_user_info'
        AND wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$'
        AND requested_range_start IS NULL
        AND requested_range_end IS NULL
      )
    );
