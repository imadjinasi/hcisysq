-- Leave completion hardening.
-- Keep sequential approval and attendance-resolution transitions authoritative in PostgreSQL.

CREATE UNIQUE INDEX IF NOT EXISTS leave_request_approval_steps_one_pending_idx
  ON leave_request_approval_steps (leave_request_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION enforce_attendance_resolution_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Resolved attendance classifications are terminal. A retry or stale writer
  -- must not replace the classification that already won the transition.
  IF OLD.status = 'resolved' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'attendance resolution is already final';
  END IF;

  -- Once an annual conversion has been proposed, only the owning employee's
  -- accept/reject flow may move the case. HC must first receive a rejection
  -- that returns the case to open before proposing another outcome.
  IF OLD.status = 'awaiting_employee' THEN
    IF NEW.status = 'open'
      AND NEW.proposed_resolution IS NULL
      AND NEW.final_resolution IS NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'resolved'
      AND OLD.proposed_resolution = 'annual_conversion'
      AND NEW.final_resolution = 'annual_conversion' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'attendance resolution is awaiting employee decision';
  END IF;

  -- An open case may remain open for manual review, wait for an explicit
  -- annual-conversion decision, or be classified directly by HC.
  IF OLD.status = 'open' THEN
    IF NEW.status IN ('open', 'awaiting_employee', 'resolved') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'invalid attendance resolution transition';
END;
$$;

DROP TRIGGER IF EXISTS attendance_resolution_transition_guard
  ON attendance_resolution_cases;

CREATE TRIGGER attendance_resolution_transition_guard
BEFORE UPDATE ON attendance_resolution_cases
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.final_resolution IS DISTINCT FROM NEW.final_resolution)
EXECUTE FUNCTION enforce_attendance_resolution_transition();
