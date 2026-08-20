CREATE TABLE IF NOT EXISTS leave_calendar_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  working_weekday_mask smallint NULL CHECK (
    working_weekday_mask IS NULL OR (working_weekday_mask BETWEEN 1 AND 127)
  ),
  updated_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO leave_calendar_settings (singleton, timezone)
VALUES (true, 'Asia/Jakarta')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS leave_calendar_exceptions (
  calendar_date date PRIMARY KEY,
  is_working_day boolean NOT NULL,
  label text NULL,
  updated_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  policy_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('in_review', 'approved', 'rejected', 'cancelled')),
  start_on date NOT NULL,
  end_on date NOT NULL,
  working_days integer NOT NULL CHECK (working_days > 0),
  reason text NULL,
  annual_period_key text NULL CHECK (
    annual_period_key IS NULL OR annual_period_key IN ('JAN_MAR', 'APR_JUN', 'JUL_SEP', 'OCT_DEC')
  ),
  annual_entitlement_days integer NULL CHECK (
    annual_entitlement_days IS NULL OR annual_entitlement_days > 0
  ),
  annual_period_limit_days integer NULL CHECK (
    annual_period_limit_days IS NULL OR annual_period_limit_days > 0
  ),
  annual_available_before integer NULL CHECK (
    annual_available_before IS NULL OR annual_available_before >= 0
  ),
  hc_handling text NOT NULL CHECK (hc_handling IN ('notify', 'validate', 'approve', 'none')),
  idempotency_key text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  final_decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_on >= start_on),
  UNIQUE (employee_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS leave_requests_employee_status_idx
  ON leave_requests (employee_id, status, start_on DESC);

CREATE INDEX IF NOT EXISTS leave_requests_annual_usage_idx
  ON leave_requests (employee_id, annual_period_key, start_on)
  WHERE policy_key = 'annual' AND status IN ('in_review', 'approved');

CREATE TABLE IF NOT EXISTS leave_request_approval_steps (
  id uuid PRIMARY KEY,
  leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order > 0),
  approver_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  sources text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL CHECK (status IN ('waiting', 'pending', 'approved', 'rejected')),
  acted_by_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  acted_at timestamptz NULL,
  decision_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (leave_request_id, step_order)
);

CREATE INDEX IF NOT EXISTS leave_request_approval_steps_inbox_idx
  ON leave_request_approval_steps (approver_employee_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS leave_request_events (
  id uuid PRIMARY KEY,
  leave_request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  actor_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_request_events_request_idx
  ON leave_request_events (leave_request_id, occurred_at ASC);

CREATE TABLE IF NOT EXISTS leave_notification_outbox (
  id uuid PRIMARY KEY,
  leave_request_id uuid NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('employee', 'role')),
  target_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS leave_notification_outbox_pending_idx
  ON leave_notification_outbox (status, created_at ASC)
  WHERE status = 'pending';
