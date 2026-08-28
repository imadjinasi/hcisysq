ALTER TABLE attendance_adms_devices
  ADD COLUMN IF NOT EXISTS pre_registration_recovery_completed_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS attendance_adms_commands (
  id uuid PRIMARY KEY,
  command_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  command_type text NOT NULL CHECK (command_type IN ('sync_new')),
  wire_command text NOT NULL CHECK (wire_command IN ('LOG')),
  dedupe_key text NULL UNIQUE,
  reason text NOT NULL CHECK (reason IN ('registration_recovery')),
  status text NOT NULL CHECK (
    status IN ('pending', 'delivered', 'acknowledged', 'succeeded', 'failed', 'expired', 'cancelled')
  ),
  requested_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  delivered_at timestamptz NULL,
  acknowledged_at timestamptz NULL,
  completed_at timestamptz NULL,
  return_code integer NULL,
  result_command text NULL,
  result_raw text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_commands_device_status_idx
  ON attendance_adms_commands (device_id, status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_commands_active_sync_idx
  ON attendance_adms_commands (device_id, command_type)
  WHERE status IN ('pending', 'delivered', 'acknowledged');

CREATE TABLE IF NOT EXISTS attendance_adms_command_events (
  id uuid PRIMARY KEY,
  command_id uuid NOT NULL REFERENCES attendance_adms_commands(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN ('queued', 'delivered', 'acknowledged', 'succeeded', 'failed')
  ),
  actor_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  request_id uuid NULL REFERENCES attendance_adms_request_journal(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_command_events_command_idx
  ON attendance_adms_command_events (command_id, created_at);

CREATE OR REPLACE FUNCTION reject_attendance_adms_command_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ADMS command events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_command_events_immutable
  ON attendance_adms_command_events;
CREATE TRIGGER attendance_adms_command_events_immutable
BEFORE UPDATE OR DELETE ON attendance_adms_command_events
FOR EACH ROW EXECUTE FUNCTION reject_attendance_adms_command_event_mutation();
