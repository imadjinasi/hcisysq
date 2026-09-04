ALTER TABLE attendance_adms_commands
  DROP CONSTRAINT IF EXISTS attendance_adms_commands_wire_command_check;
ALTER TABLE attendance_adms_commands
  ADD CONSTRAINT attendance_adms_commands_wire_command_check
    CHECK (
      wire_command IN (
        'LOG', 'INFO', 'DATA QUERY USERINFO', 'RELOAD OPTIONS', 'REBOOT',
        'CLEAR LOG', 'CLEAR PHOTO', 'CLEAR DATA', 'BIOMETRIC_RESTORE',
        'FIRMWARE_UPGRADE', 'TIME_SYNC'
      )
      OR wire_command ~ '^DATA QUERY ATTLOG StartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\tEndTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA QUERY USERINFO PIN=[0-9]{1,128}$'
      OR wire_command ~ '^DATA UPDATE USERINFO PIN=[0-9]{1,128}\tName=[^\t\r\n]{1,160}$'
      OR wire_command ~ '^DATA UPDATE WORKCODE CODE=[0-9]{1,10}\tName=[^\t\r\n]{1,120}$'
      OR wire_command ~ '^DATA DELETE WORKCODE CODE=[0-9]{1,10}$'
      OR wire_command ~ '^DATA UPDATE SMS MSG=[^\t\r\n]{1,250}[^\t\r\n]{0,250}\tTAG=(253|254)\tUID=[0-9]{1,10}\tMIN=[0-9]{1,6}\tStartTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA UPDATE USER_SMS PIN=[0-9]{1,128}\tUID=[0-9]{1,10}$'
      OR wire_command ~ '^DATA DELETE SMS UID=[0-9]{1,10}$'
      OR wire_command ~ '^DATA UPDATE user Pin=[0-9]{1,128}\tName=[^\t\r\n]{1,160}\tPasswd=\tCard=\tGroup=[0-9]{1,2}\tPri=0\tExpiredTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA UPDATE user Pin=[0-9]{1,128}\tExpiredTime=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
      OR wire_command ~ '^DATA UPDATE userauthorize Pin=[0-9]{1,128}\tAuthorizeTimezoneId=[0-9]{1,2}\tAuthorizeDoorId=[0-9]{1,2}$'
      OR wire_command ~ '^SET OPTION AlarmReRec=[0-9]{1,5}$'
      OR wire_command ~ '^SET OPTIONS DateTime=[0-9]{1,12}$'
      OR wire_command ~ '^SET OPTIONS NTPServer=[A-Za-z0-9._:-]{1,253}$'
      OR wire_command ~ '^SET OPTIONS WebServerIP=[A-Za-z0-9._:-]{1,253},WebServerPort=[0-9]{1,5}$'
      OR wire_command ~ '^DATA QUERY FINGERTMP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}$'
      OR wire_command ~ '^DATA QUERY tablename=biodata,fielddesc=\*,filter=Type=(1|2|6|8|9|10)\tPin=[0-9]{1,128}\tNo=[0-9]{1,3}$'
      OR wire_command ~ '^ENROLL_FP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}\tRETRY=[0-9]{1,2}\tOVERWRITE=[01]$'
      OR wire_command ~ '^ENROLL_BIO TYPE=(1|2|6|8|9|10)\tNO=[0-9]{1,3}\tPIN=[0-9]{1,128}\tRETRY=[0-9]{1,2}\tOVERWRITE=[01]\tMODE=1$'
      OR wire_command ~ '^DATA DELETE FINGERTMP PIN=[0-9]{1,128}\tFID=[0-9]{1,2}$'
      OR wire_command ~ '^DATA DELETE FACE PIN=[0-9]{1,128}$'
      OR wire_command ~ '^DATA DELETE BIODATA Pin=[0-9]{1,128}\tType=(1|2|6|8|9|10)\tNo=[0-9]{1,3}$'
      OR wire_command ~ '^UPGRADE type=1,checksum=[0-9a-f]{32},size=[0-9]{1,9},url=/iclock/file\?token=[A-Za-z0-9_-]{32,128}$'
    );
