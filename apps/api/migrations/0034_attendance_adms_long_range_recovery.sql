CREATE TABLE IF NOT EXISTS attendance_adms_recovery_jobs (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  requested_range_start timestamptz NOT NULL,
  requested_range_end timestamptz NOT NULL,
  chunk_days integer NOT NULL CHECK (chunk_days BETWEEN 1 AND 31),
  total_chunks integer NOT NULL CHECK (total_chunks > 0),
  status text NOT NULL DEFAULT 'running' CHECK (
    status IN ('running', 'succeeded', 'failed', 'cancelled')
  ),
  requested_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  failure_reason text NULL CHECK (failure_reason IS NULL OR length(failure_reason) <= 160),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_range_start <= requested_range_end),
  CHECK (
    (status = 'running' AND completed_at IS NULL)
    OR (status <> 'running' AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_recovery_jobs_one_active_idx
  ON attendance_adms_recovery_jobs (device_id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS attendance_adms_recovery_jobs_device_created_idx
  ON attendance_adms_recovery_jobs (device_id, created_at DESC);

ALTER TABLE attendance_adms_commands
  ADD COLUMN IF NOT EXISTS recovery_job_id uuid NULL
    REFERENCES attendance_adms_recovery_jobs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS recovery_sequence integer NULL;

ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_recovery_shape_check;
ALTER TABLE attendance_adms_commands
  ADD CONSTRAINT attendance_adms_commands_recovery_shape_check
    CHECK (
      (recovery_job_id IS NULL AND recovery_sequence IS NULL)
      OR (recovery_job_id IS NOT NULL AND recovery_sequence IS NOT NULL AND recovery_sequence > 0)
    );

CREATE UNIQUE INDEX IF NOT EXISTS attendance_adms_commands_recovery_sequence_idx
  ON attendance_adms_commands (recovery_job_id, recovery_sequence)
  WHERE recovery_job_id IS NOT NULL;

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
      'sync_new', 'data_query', 'read_info', 'query_user_info', 'update_user_info'
    )),
  ADD CONSTRAINT attendance_adms_commands_reason_check
    CHECK (reason IN (
      'registration_recovery', 'admin_sync_new', 'admin_range_recovery',
      'admin_long_range_recovery', 'admin_read_information',
      'scheduled_reconciliation', 'admin_query_user_info', 'admin_update_user_info'
    )),
  ADD CONSTRAINT attendance_adms_commands_wire_command_check
    CHECK (
      wire_command IN ('LOG', 'INFO', 'DATA QUERY USERINFO')
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
        AND recovery_job_id IS NULL
      )
      OR (
        command_type = 'read_info'
        AND wire_command = 'INFO'
        AND reason = 'admin_read_information'
        AND requested_range_start IS NULL
        AND requested_range_end IS NULL
        AND recovery_job_id IS NULL
      )
      OR (
        command_type = 'data_query'
        AND reason IN (
          'admin_range_recovery', 'admin_long_range_recovery', 'scheduled_reconciliation'
        )
        AND wire_command ~ '^DATA QUERY ATTLOG StartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\tEndTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
        AND requested_range_start IS NOT NULL
        AND requested_range_end IS NOT NULL
        AND requested_range_start <= requested_range_end
        AND (
          (reason = 'admin_long_range_recovery' AND recovery_job_id IS NOT NULL)
          OR (reason <> 'admin_long_range_recovery' AND recovery_job_id IS NULL)
        )
      )
      OR (
        command_type = 'query_user_info'
        AND reason = 'admin_query_user_info'
        AND (
          wire_command = 'DATA QUERY USERINFO'
          OR wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$'
        )
        AND requested_range_start IS NULL
        AND requested_range_end IS NULL
        AND recovery_job_id IS NULL
      )
      OR (
        command_type = 'update_user_info'
        AND reason = 'admin_update_user_info'
        AND wire_command ~ '^DATA UPDATE USERINFO PIN=[0-9]{1,128}\tName=[^\t\r\n]{1,160}$'
        AND requested_range_start IS NULL
        AND requested_range_end IS NULL
        AND recovery_job_id IS NULL
      )
    );

CREATE OR REPLACE FUNCTION advance_attendance_adms_recovery_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_job_status text;
  next_command_id uuid;
BEGIN
  IF NEW.recovery_job_id IS NULL OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT status
    INTO current_job_status
  FROM attendance_adms_recovery_jobs
  WHERE id = NEW.recovery_job_id
  FOR UPDATE;

  IF current_job_status IS NULL OR current_job_status <> 'running' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'succeeded' THEN
    SELECT id
      INTO next_command_id
    FROM attendance_adms_commands
    WHERE recovery_job_id = NEW.recovery_job_id
      AND status = 'queued'
    ORDER BY recovery_sequence
    LIMIT 1
    FOR UPDATE;

    IF next_command_id IS NULL THEN
      UPDATE attendance_adms_recovery_jobs
      SET status = 'succeeded',
          completed_at = now(),
          updated_at = now(),
          failure_reason = NULL
      WHERE id = NEW.recovery_job_id;
    ELSE
      UPDATE attendance_adms_commands
      SET status = 'pending',
          expires_at = now() + interval '24 hours',
          updated_at = now()
      WHERE id = next_command_id;

      UPDATE attendance_adms_recovery_jobs
      SET updated_at = now()
      WHERE id = NEW.recovery_job_id;
    END IF;

  ELSIF NEW.status IN ('failed', 'expired') THEN
    UPDATE attendance_adms_recovery_jobs
    SET status = 'failed',
        failure_reason = CASE
          WHEN NEW.status = 'expired' THEN 'chunk_expired'
          ELSE 'chunk_failed'
        END,
        completed_at = now(),
        updated_at = now()
    WHERE id = NEW.recovery_job_id;

    UPDATE attendance_adms_commands
    SET status = 'cancelled',
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE recovery_job_id = NEW.recovery_job_id
      AND status = 'queued';

  ELSIF NEW.status = 'cancelled' THEN
    UPDATE attendance_adms_recovery_jobs
    SET status = 'cancelled',
        completed_at = now(),
        updated_at = now()
    WHERE id = NEW.recovery_job_id;

    UPDATE attendance_adms_commands
    SET status = 'cancelled',
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE recovery_job_id = NEW.recovery_job_id
      AND status = 'queued';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_advance_recovery_job
  ON attendance_adms_commands;
CREATE TRIGGER attendance_adms_advance_recovery_job
AFTER UPDATE OF status ON attendance_adms_commands
FOR EACH ROW
WHEN (NEW.recovery_job_id IS NOT NULL)
EXECUTE FUNCTION advance_attendance_adms_recovery_job();
