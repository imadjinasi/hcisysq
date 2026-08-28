CREATE TABLE IF NOT EXISTS attendance_adms_devices (
  id uuid PRIMARY KEY,
  serial_number text NOT NULL UNIQUE,
  lifecycle text NOT NULL CHECK (lifecycle IN ('active', 'disabled', 'quarantined')),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  display_name text NULL,
  model text NULL,
  firmware_version text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NULL,
  last_seen_at timestamptz NULL,
  last_successful_request_at timestamptz NULL,
  last_ip text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_adms_request_journal (
  id uuid PRIMARY KEY,
  device_id uuid NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  serial_candidate_hash text NULL,
  method text NOT NULL,
  path text NOT NULL,
  raw_query text NOT NULL,
  content_type text NULL,
  source_ip text NULL,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  body bytea NULL,
  body_sha256 text NULL,
  body_byte_length integer NOT NULL CHECK (body_byte_length >= 0),
  body_captured boolean NOT NULL,
  classification text NOT NULL,
  response_status integer NOT NULL,
  response_body text NULL,
  received_at timestamptz NOT NULL,
  durable_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_request_journal_device_idx
  ON attendance_adms_request_journal (device_id, received_at DESC);

CREATE TABLE IF NOT EXISTS attendance_adms_events (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  source_request_id uuid NOT NULL REFERENCES attendance_adms_request_journal(id) ON DELETE RESTRICT,
  event_identity_hash text NOT NULL UNIQUE,
  pin text NOT NULL,
  occurred_at_raw text NOT NULL,
  occurred_at timestamptz NOT NULL,
  raw_line text NOT NULL,
  raw_fields jsonb NOT NULL,
  raw_line_sha256 text NOT NULL,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_events_device_time_idx
  ON attendance_adms_events (device_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS attendance_adms_quarantines (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES attendance_adms_request_journal(id) ON DELETE RESTRICT,
  device_id uuid NULL REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  raw_line text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_adms_quarantines_request_idx
  ON attendance_adms_quarantines (request_id, created_at);

CREATE TABLE IF NOT EXISTS attendance_adms_cursors (
  device_id uuid PRIMARY KEY REFERENCES attendance_adms_devices(id) ON DELETE RESTRICT,
  attlog_stamp text NOT NULL,
  source_request_id uuid NOT NULL REFERENCES attendance_adms_request_journal(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION reject_attendance_adms_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ADMS raw fact tables are append-only';
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_request_journal_immutable ON attendance_adms_request_journal;
CREATE TRIGGER attendance_adms_request_journal_immutable
BEFORE UPDATE OR DELETE ON attendance_adms_request_journal
FOR EACH ROW EXECUTE FUNCTION reject_attendance_adms_fact_mutation();

DROP TRIGGER IF EXISTS attendance_adms_events_immutable ON attendance_adms_events;
CREATE TRIGGER attendance_adms_events_immutable
BEFORE UPDATE OR DELETE ON attendance_adms_events
FOR EACH ROW EXECUTE FUNCTION reject_attendance_adms_fact_mutation();

DROP TRIGGER IF EXISTS attendance_adms_quarantines_immutable ON attendance_adms_quarantines;
CREATE TRIGGER attendance_adms_quarantines_immutable
BEFORE UPDATE OR DELETE ON attendance_adms_quarantines
FOR EACH ROW EXECUTE FUNCTION reject_attendance_adms_fact_mutation();
