CREATE TABLE IF NOT EXISTS attendance_adms_detected_devices (
  id uuid PRIMARY KEY,
  serial_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'claimed', 'ignored')),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_ip text NULL,
  observed_count bigint NOT NULL DEFAULT 1 CHECK (observed_count > 0),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_device_id uuid NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  claimed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'claimed' AND claimed_device_id IS NOT NULL AND claimed_at IS NOT NULL)
    OR (status <> 'claimed' AND claimed_device_id IS NULL AND claimed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS attendance_adms_detected_status_seen_idx
  ON attendance_adms_detected_devices (status, last_seen_at DESC);

ALTER TABLE attendance_adms_devices
  ADD COLUMN IF NOT EXISTS connectivity_timeout_seconds integer NULL
    CHECK (connectivity_timeout_seconds BETWEEN 30 AND 3600),
  ADD COLUMN IF NOT EXISTS reconciliation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_interval_minutes integer NOT NULL DEFAULT 1440
    CHECK (reconciliation_interval_minutes BETWEEN 60 AND 10080),
  ADD COLUMN IF NOT EXISTS reconciliation_lookback_hours integer NOT NULL DEFAULT 48
    CHECK (reconciliation_lookback_hours BETWEEN 1 AND 744),
  ADD COLUMN IF NOT EXISTS reconciliation_last_requested_at timestamptz NULL;

ALTER TABLE attendance_adms_commands
  ADD COLUMN IF NOT EXISTS requested_range_start timestamptz NULL,
  ADD COLUMN IF NOT EXISTS requested_range_end timestamptz NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_command_type_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_wire_command_check,
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_reason_check;

ALTER TABLE attendance_adms_commands
  ADD CONSTRAINT attendance_adms_commands_command_type_check
    CHECK (command_type IN ('sync_new', 'data_query', 'read_info')),
  ADD CONSTRAINT attendance_adms_commands_reason_check
    CHECK (reason IN (
      'registration_recovery', 'admin_sync_new', 'admin_range_recovery',
      'admin_read_information', 'scheduled_reconciliation'
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
    );

DROP INDEX IF EXISTS attendance_adms_commands_active_sync_idx;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_commands_one_active_idx
  ON attendance_adms_commands (device_id)
  WHERE status IN ('pending', 'delivered', 'acknowledged');

ALTER TABLE attendance_adms_command_events
  DROP CONSTRAINT IF EXISTS attendance_adms_command_events_event_type_check;
ALTER TABLE attendance_adms_command_events
  ADD CONSTRAINT attendance_adms_command_events_event_type_check
    CHECK (event_type IN ('queued', 'delivered', 'acknowledged', 'succeeded', 'failed', 'expired', 'cancelled'));

ALTER TABLE attendance_adms_admin_audit_events
  DROP CONSTRAINT IF EXISTS attendance_adms_admin_audit_events_action_check;
ALTER TABLE attendance_adms_admin_audit_events
  ADD CONSTRAINT attendance_adms_admin_audit_events_action_check
    CHECK (action IN (
      'device_registered', 'device_updated', 'mapping_created', 'mapping_ended',
      'device_claimed', 'transfer_requested', 'command_requested', 'command_cancelled'
    ));
