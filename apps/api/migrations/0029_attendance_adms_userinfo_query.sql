ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_type_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_wire_command_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_reason_check;

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
      OR (
        wire_command ~ '^DATA QUERY ATTLOG StartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\tEndTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
        AND requested_range_start IS NOT NULL
        AND requested_range_end IS NOT NULL
        AND requested_range_start <= requested_range_end
      )
      OR (
        wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$'
        AND requested_range_start IS NULL
        AND requested_range_end IS NULL
      )
    );
