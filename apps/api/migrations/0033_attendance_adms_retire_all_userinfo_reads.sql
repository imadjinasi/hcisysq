CREATE OR REPLACE FUNCTION reject_retired_attendance_adms_userinfo_reads()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.wire_command = 'DATA QUERY USERINFO'
     OR NEW.wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$' THEN
    RAISE EXCEPTION 'active USERINFO reads are retired after physical firmware validation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_adms_reject_retired_userinfo_reads
  ON attendance_adms_commands;
DROP TRIGGER IF EXISTS attendance_adms_reject_retired_full_roster_query
  ON attendance_adms_commands;

CREATE TRIGGER attendance_adms_reject_retired_userinfo_reads
BEFORE INSERT ON attendance_adms_commands
FOR EACH ROW
EXECUTE FUNCTION reject_retired_attendance_adms_userinfo_reads();
