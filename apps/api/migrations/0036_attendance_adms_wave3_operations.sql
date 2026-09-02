CREATE TABLE IF NOT EXISTS attendance_adms_work_codes (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9A-Za-z._-]{1,32}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_adms_work_code_targets (
  work_code_id uuid NOT NULL REFERENCES attendance_adms_work_codes(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  desired_state text NOT NULL CHECK (desired_state IN ('present', 'absent')),
  delivery_state text NOT NULL DEFAULT 'not_verified'
    CHECK (delivery_state IN ('not_verified', 'pending', 'succeeded', 'failed')),
  updated_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_code_id, device_id)
);

CREATE TABLE IF NOT EXISTS attendance_adms_device_messages (
  id uuid PRIMARY KEY,
  audience text NOT NULL CHECK (audience IN ('public', 'private')),
  employee_id uuid NULL REFERENCES employees(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  message_text text NOT NULL CHECK (char_length(message_text) BETWEEN 1 AND 500),
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  active boolean NOT NULL DEFAULT true,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (audience = 'public' AND employee_id IS NULL)
    OR (audience = 'private' AND employee_id IS NOT NULL)
  ),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS attendance_adms_device_message_targets (
  message_id uuid NOT NULL REFERENCES attendance_adms_device_messages(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  desired_state text NOT NULL CHECK (desired_state IN ('present', 'absent')),
  delivery_state text NOT NULL DEFAULT 'not_verified'
    CHECK (delivery_state IN ('not_verified', 'pending', 'succeeded', 'failed')),
  updated_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, device_id)
);

CREATE TABLE IF NOT EXISTS attendance_adms_saved_filters (
  id uuid PRIMARY KEY,
  owner_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id uuid NULL REFERENCES attendance_adms_devices(id) ON DELETE CASCADE,
  view_key text NOT NULL CHECK (view_key IN ('transactions', 'commands', 'logs')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (owner_account_id, device_id, view_key, name)
);

CREATE TABLE IF NOT EXISTS attendance_adms_offline_imports (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  source_request_id uuid NOT NULL REFERENCES attendance_adms_request_journal(id) ON DELETE RESTRICT,
  source_filename text NOT NULL CHECK (char_length(source_filename) BETWEEN 1 AND 255),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  parsed_event_count integer NOT NULL CHECK (parsed_event_count >= 0),
  inserted_event_count integer NOT NULL CHECK (inserted_event_count >= 0),
  duplicate_event_count integer NOT NULL CHECK (duplicate_event_count >= 0),
  quarantine_count integer NOT NULL CHECK (quarantine_count >= 0),
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, source_sha256)
);

CREATE INDEX IF NOT EXISTS attendance_adms_offline_imports_device_created_idx
  ON attendance_adms_offline_imports (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_adms_saved_filters_owner_view_idx
  ON attendance_adms_saved_filters (owner_account_id, view_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS attendance_adms_device_messages_active_idx
  ON attendance_adms_device_messages (active, starts_at, ends_at);

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
      'pending_commands_cleared'
    ));