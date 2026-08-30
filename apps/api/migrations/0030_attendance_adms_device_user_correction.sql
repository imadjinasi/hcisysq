CREATE TABLE IF NOT EXISTS attendance_adms_device_user_corrections (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  legacy_pin text NOT NULL CHECK (legacy_pin ~ '^[0-9]{1,128}$'),
  intended_pin text NOT NULL CHECK (intended_pin ~ '^[0-9]{1,128}$'),
  reason text NOT NULL DEFAULT 'pin_typo' CHECK (reason IN ('pin_typo')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'cancelled', 'resolved')),
  created_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  cancelled_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  resolved_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  cancelled_at timestamptz NULL,
  resolved_at timestamptz NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (legacy_pin <> intended_pin),
  CHECK (
    (status = 'planned' AND cancelled_at IS NULL AND resolved_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_at IS NOT NULL AND cancelled_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_device_user_corrections_one_legacy_plan_idx
  ON attendance_adms_device_user_corrections (device_id, legacy_pin)
  WHERE status = 'planned';

CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_device_user_corrections_one_intended_plan_idx
  ON attendance_adms_device_user_corrections (device_id, intended_pin)
  WHERE status = 'planned';

ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_type_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_wire_command_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_reason_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_shape_check;

ALTER TABLE attendance_adms_commands
  ADD CONSTRAINT attendance_adms_commands_command_type_check
    CHECK (command_type IN ('sync_new', 'data_query', 'read_info', 'query_user_info', 'update_user_info')),
  ADD CONSTRAINT attendance_adms_commands_reason_check
    CHECK (reason IN (
      'registration_recovery', 'admin_sync_new', 'admin_range_recovery',
      'admin_read_information', 'scheduled_reconciliation', 'admin_query_user_info',
      'admin_update_user_info'
    )),
  ADD CONSTRAINT attendance_adms_commands_wire_command_check
    CHECK (
      wire_command IN ('LOG', 'INFO')
      OR wire_command ~ '^DATA QUERY ATTLOG StartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\tEndTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$'
      OR wire_command ~ '^DATA UPDATE USERINFO PIN=[0-9]{1,128}\tName=[^\t\r\n]{1,160}$'
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
      OR (
        command_type = 'update_user_info'
        AND reason = 'admin_update_user_info'
        AND wire_command ~ '^DATA UPDATE USERINFO PIN=[0-9]{1,128}\tName=[^\t\r\n]{1,160}$'
        AND requested_range_start IS NULL
        AND requested_range_end IS NULL
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
      'device_user_correction_resolved'
    ));