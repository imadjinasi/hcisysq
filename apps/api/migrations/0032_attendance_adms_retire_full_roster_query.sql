CREATE OR REPLACE FUNCTION reject_retired_attendance_adms_full_roster_query()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.command_type = 'query_user_info'
     AND NEW.reason = 'admin_query_user_info'
     AND NEW.wire_command = 'DATA QUERY USERINFO' THEN
    RAISE EXCEPTION 'full roster USERINFO query is retired after physical firmware validation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_reject_retired_full_roster_query
  ON attendance_adms_commands;

CREATE TRIGGER attendance_adms_reject_retired_full_roster_query
BEFORE INSERT ON attendance_adms_commands
FOR EACH ROW
EXECUTE FUNCTION reject_retired_attendance_adms_full_roster_query();
