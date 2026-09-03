const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const PIN_PATTERN = /^\d{1,128}$/;
const HOST_PATTERN = /^[A-Za-z0-9._:-]{1,253}$/;

function pin(value: string) {
  if (!PIN_PATTERN.test(value)) throw new Error("ADMS PIN is invalid");
  return value;
}

function text(value: string, max: number, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || CONTROL_PATTERN.test(normalized)) {
    throw new Error(`${label} is invalid`);
  }
  return normalized;
}

function timestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new Error("ADMS expiration timestamp is invalid");
  }
  return value;
}

function group(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 99) throw new Error("ADMS user group is invalid");
  return value;
}

function door(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 99) throw new Error("ADMS door id is invalid");
  return value;
}

export function deviceUserUpsertWireCommand(input: {
  pin: string;
  name: string;
  group: number;
  expiredTime: string;
}) {
  return `DATA UPDATE user Pin=${pin(input.pin)}\tName=${text(input.name, 160, "ADMS user name")}\tPasswd=\tCard=\tGroup=${group(input.group)}\tPri=0\tExpiredTime=${timestamp(input.expiredTime)}`;
}

export function deviceUserExpirationWireCommand(pinValue: string, expiredTime: string) {
  return `DATA UPDATE user Pin=${pin(pinValue)}\tExpiredTime=${timestamp(expiredTime)}`;
}

export function deviceUserAuthorizationWireCommand(input: {
  pin: string;
  timezoneId: number;
  doorId: number;
}) {
  if (!Number.isInteger(input.timezoneId) || input.timezoneId < 0 || input.timezoneId > 99) {
    throw new Error("ADMS authorization timezone is invalid");
  }
  return `DATA UPDATE userauthorize Pin=${pin(input.pin)}\tAuthorizeTimezoneId=${input.timezoneId}\tAuthorizeDoorId=${door(input.doorId)}`;
}

export function ntpServerWireCommand(host: string) {
  const normalized = text(host, 253, "NTP server");
  if (!HOST_PATTERN.test(normalized)) throw new Error("NTP server is invalid");
  return `SET OPTIONS NTPServer=${normalized}`;
}

export function webServerWireCommand(input: { host: string; port: number }) {
  const host = text(input.host, 253, "ADMS server host");
  if (!HOST_PATTERN.test(host)) throw new Error("ADMS server host is invalid");
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new Error("ADMS server port is invalid");
  }
  return `SET OPTIONS WebServerIP=${host},WebServerPort=${input.port}`;
}

export function isUserConfigWireCommand(value: string) {
  return (
    /^DATA UPDATE user Pin=\d{1,128}\tName=[^\t\r\n]{1,160}\tPasswd=\tCard=\tGroup=\d{1,2}\tPri=0\tExpiredTime=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ||
    /^DATA UPDATE user Pin=\d{1,128}\tExpiredTime=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ||
    /^DATA UPDATE userauthorize Pin=\d{1,128}\tAuthorizeTimezoneId=\d{1,2}\tAuthorizeDoorId=\d{1,2}$/.test(value) ||
    /^SET OPTIONS NTPServer=[A-Za-z0-9._:-]{1,253}$/.test(value) ||
    /^SET OPTIONS WebServerIP=[A-Za-z0-9._:-]{1,253},WebServerPort=\d{1,5}$/.test(value)
  );
}
