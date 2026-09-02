const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const PIN_PATTERN = /^\d{1,128}$/;
const CODE_PATTERN = /^\d{1,10}$/;
const HASH_PATTERN = /^[a-f0-9]{32}$/;

function bounded(value: string, max: number, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || CONTROL_PATTERN.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function pin(value: string) {
  if (!PIN_PATTERN.test(value)) throw new Error("ADMS PIN is invalid");
  return value;
}

function numericCode(value: string) {
  if (!CODE_PATTERN.test(value)) throw new Error("ADMS Work Code must be numeric for physical delivery");
  return value;
}

export type PhysicalCapabilityKey =
  | "work_code_delivery"
  | "message_delivery"
  | "time_sync"
  | "duplicate_punch_period"
  | "reboot"
  | "biometric_query"
  | "biometric_restore"
  | "biometric_enrollment"
  | "biometric_delete"
  | "clear_attendance"
  | "clear_photo_cache"
  | "clear_all_data"
  | "firmware_upgrade"
  | "attendance_photo";

export const PHYSICAL_CAPABILITY_KEYS: readonly PhysicalCapabilityKey[] = [
  "work_code_delivery",
  "message_delivery",
  "time_sync",
  "duplicate_punch_period",
  "reboot",
  "biometric_query",
  "biometric_restore",
  "biometric_enrollment",
  "biometric_delete",
  "clear_attendance",
  "clear_photo_cache",
  "clear_all_data",
  "firmware_upgrade",
  "attendance_photo",
] as const;

export function workCodeUpsertWireCommand(code: string, name: string) {
  return `DATA UPDATE WORKCODE CODE=${numericCode(code)}\tName=${bounded(name, 120, "Work Code name")}`;
}

export function workCodeDeleteWireCommand(code: string) {
  return `DATA DELETE WORKCODE CODE=${numericCode(code)}`;
}

export function publicMessageUpsertWireCommand(input: {
  uid: number;
  message: string;
  startTime: string;
  durationMinutes: number;
}) {
  if (!Number.isSafeInteger(input.uid) || input.uid <= 0 || input.uid > 2_147_483_647) {
    throw new Error("ADMS message UID is invalid");
  }
  if (!Number.isSafeInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 525_600) {
    throw new Error("ADMS message duration is invalid");
  }
  const startTime = bounded(input.startTime, 32, "ADMS message start time");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(startTime)) {
    throw new Error("ADMS message start time is invalid");
  }
  return `DATA UPDATE SMS MSG=${bounded(input.message, 500, "ADMS message")}\tTAG=253\tUID=${input.uid}\tMIN=${input.durationMinutes}\tStartTime=${startTime}`;
}

export function privateMessageUpsertWireCommand(input: {
  uid: number;
  message: string;
  startTime: string;
  durationMinutes: number;
}) {
  if (!Number.isSafeInteger(input.uid) || input.uid <= 0 || input.uid > 2_147_483_647) {
    throw new Error("ADMS message UID is invalid");
  }
  if (!Number.isSafeInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 525_600) {
    throw new Error("ADMS message duration is invalid");
  }
  const startTime = bounded(input.startTime, 32, "ADMS message start time");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(startTime)) {
    throw new Error("ADMS message start time is invalid");
  }
  return `DATA UPDATE SMS MSG=${bounded(input.message, 500, "ADMS message")}\tTAG=254\tUID=${input.uid}\tMIN=${input.durationMinutes}\tStartTime=${startTime}`;
}

export function privateMessageAssignWireCommand(pinValue: string, uid: number) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || uid > 2_147_483_647) throw new Error("ADMS message UID is invalid");
  return `DATA UPDATE USER_SMS PIN=${pin(pinValue)}\tUID=${uid}`;
}

export function messageDeleteWireCommand(uid: number) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || uid > 2_147_483_647) throw new Error("ADMS message UID is invalid");
  return `DATA DELETE SMS UID=${uid}`;
}

export function setDuplicatePunchPeriodWireCommand(seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86_400) {
    throw new Error("Duplicate-punch period is invalid");
  }
  return `SET OPTION AlarmReRec=${seconds}`;
}

export function reloadOptionsWireCommand() {
  return "RELOAD OPTIONS";
}

export function rebootWireCommand() {
  return "REBOOT";
}

export function fingerprintQueryWireCommand(pinValue: string, slotIndex: number) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 9) throw new Error("Fingerprint slot is invalid");
  return `DATA QUERY FINGERTMP PIN=${pin(pinValue)}\tFID=${slotIndex}`;
}

export function unifiedBiometricQueryWireCommand(input: {
  type: 1 | 2 | 6 | 8 | 9 | 10;
  pin: string;
  slotIndex: number;
}) {
  if (!Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex > 255) {
    throw new Error("Biometric slot is invalid");
  }
  return `DATA QUERY tablename=biodata,fielddesc=*,filter=Type=${input.type}\tPin=${pin(input.pin)}\tNo=${input.slotIndex}`;
}

export function fingerprintEnrollWireCommand(input: {
  pin: string;
  slotIndex: number;
  retry?: number;
  overwrite?: boolean;
}) {
  if (!Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex > 9) throw new Error("Fingerprint slot is invalid");
  const retry = input.retry ?? 3;
  if (!Number.isInteger(retry) || retry < 1 || retry > 10) throw new Error("Enrollment retry is invalid");
  return `ENROLL_FP PIN=${pin(input.pin)}\tFID=${input.slotIndex}\tRETRY=${retry}\tOVERWRITE=${input.overwrite === false ? 0 : 1}`;
}

export function unifiedEnrollWireCommand(input: {
  type: 1 | 2 | 6 | 8 | 9 | 10;
  pin: string;
  slotIndex: number;
  retry?: number;
  overwrite?: boolean;
}) {
  if (!Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex > 255) {
    throw new Error("Biometric slot is invalid");
  }
  const retry = input.retry ?? 3;
  if (!Number.isInteger(retry) || retry < 1 || retry > 10) throw new Error("Enrollment retry is invalid");
  return `ENROLL_BIO TYPE=${input.type}\tNO=${input.slotIndex}\tPIN=${pin(input.pin)}\tRETRY=${retry}\tOVERWRITE=${input.overwrite === false ? 0 : 1}\tMODE=1`;
}

export function fingerprintRestoreWireCommand(input: {
  pin: string;
  slotIndex: number;
  encodedTemplate: string;
  valid?: 1 | 3;
}) {
  if (!Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex > 9) throw new Error("Fingerprint slot is invalid");
  const payload = bounded(input.encodedTemplate, 512 * 1024, "Fingerprint template");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) {
    throw new Error("Fingerprint template encoding is invalid");
  }
  return `DATA UPDATE FINGERTMP PIN=${pin(input.pin)}\tFID=${input.slotIndex}\tSize=${payload.length}\tValid=${input.valid ?? 1}\tTMP=${payload}`;
}

export function fingerprintDeleteWireCommand(pinValue: string, slotIndex: number) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 9) throw new Error("Fingerprint slot is invalid");
  return `DATA DELETE FINGERTMP PIN=${pin(pinValue)}\tFID=${slotIndex}`;
}

export function clearAttendanceWireCommand() {
  return "CLEAR LOG";
}

export function clearPhotoCacheWireCommand() {
  return "CLEAR PHOTO";
}

export function clearAllDataWireCommand() {
  return "CLEAR DATA";
}

export function firmwareUpgradeWireCommand(input: {
  checksumMd5: string;
  byteLength: number;
  urlPath: string;
}) {
  const checksum = input.checksumMd5.toLowerCase();
  if (!HASH_PATTERN.test(checksum)) throw new Error("Firmware MD5 is invalid");
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0 || input.byteLength > 128 * 1024 * 1024) {
    throw new Error("Firmware size is invalid");
  }
  const path = bounded(input.urlPath, 300, "Firmware URL path");
  if (!/^\/iclock\/file\?token=[A-Za-z0-9_-]{32,128}$/.test(path)) {
    throw new Error("Firmware URL path is invalid");
  }
  return `UPGRADE type=1,checksum=${checksum},size=${input.byteLength},url=${path}`;
}

export function isNonSensitivePhysicalWireCommand(value: string) {
  return (
    /^DATA UPDATE WORKCODE CODE=\d{1,10}\tName=[^\t\r\n]{1,120}$/.test(value) ||
    /^DATA DELETE WORKCODE CODE=\d{1,10}$/.test(value) ||
    /^DATA UPDATE SMS MSG=[^\t\r\n]{1,500}\tTAG=(253|254)\tUID=\d{1,10}\tMIN=\d{1,6}\tStartTime=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ||
    /^DATA UPDATE USER_SMS PIN=\d{1,128}\tUID=\d{1,10}$/.test(value) ||
    /^DATA DELETE SMS UID=\d{1,10}$/.test(value) ||
    /^SET OPTION AlarmReRec=\d{1,5}$/.test(value) ||
    value === "RELOAD OPTIONS" ||
    value === "REBOOT" ||
    /^DATA QUERY FINGERTMP PIN=\d{1,128}\tFID=\d{1,2}$/.test(value) ||
    /^DATA QUERY tablename=biodata,fielddesc=\*,filter=Type=(1|2|6|8|9|10)\tPin=\d{1,128}\tNo=\d{1,3}$/.test(value) ||
    /^ENROLL_FP PIN=\d{1,128}\tFID=\d{1,2}\tRETRY=\d{1,2}\tOVERWRITE=[01]$/.test(value) ||
    /^ENROLL_BIO TYPE=(1|2|6|8|9|10)\tNO=\d{1,3}\tPIN=\d{1,128}\tRETRY=\d{1,2}\tOVERWRITE=[01]\tMODE=1$/.test(value) ||
    /^DATA DELETE FINGERTMP PIN=\d{1,128}\tFID=\d{1,2}$/.test(value) ||
    value === "CLEAR LOG" ||
    value === "CLEAR PHOTO" ||
    value === "CLEAR DATA" ||
    /^UPGRADE type=1,checksum=[a-f0-9]{32},size=\d{1,9},url=\/iclock\/file\?token=[A-Za-z0-9_-]{32,128}$/.test(value)
  );
}
