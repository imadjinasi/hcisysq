const sensitiveProtocolTables = new Set([
  "OPERLOG",
  "USERINFO",
  "FINGERTMP",
  "FACE",
  "BIODATA",
  "BIODATAINFO",
  "TEMPLATEV10",
  "ATTPHOTO",
  "BIOPHOTO",
  "BIOMEDATA",
]);

export type SafeDeviceRosterRecord = {
  pin: string;
  displayName: string | null;
  cardNumber: string | null;
  privilege: string | null;
  verifyMode: string | null;
  safeMetadata: Record<string, string>;
};

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function safeValue(value: string | undefined, max: number) {
  if (value === undefined) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > max || hasControlCharacter(normalized)) return null;
  return normalized;
}

export function extractProtocolTable(url: URL): string | null {
  for (const key of ["table", "Table", "TABLE", "tablename", "TableName", "TABLENAME"]) {
    const raw = url.searchParams.get(key);
    if (!raw) continue;
    const normalized = raw.trim().toUpperCase();
    if (!normalized || normalized.length > 80 || !/^[A-Z0-9_]+$/.test(normalized)) return null;
    return normalized;
  }
  return null;
}

export function isSensitiveProtocolTable(table: string | null) {
  return Boolean(table && sensitiveProtocolTables.has(table));
}

export function looksLikeAttlogPayload(text: string) {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line !== "");
  if (lines.length === 0) return false;
  return lines.every((line) => {
    const fields = line.split("\t");
    return fields.length === 11 && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(fields[1] ?? "");
  });
}

export function deviceDataAcknowledgementBody(text: string) {
  const records = text.split(/\r\n|\n|\r/).filter((line) => line !== "").length;
  return records > 0 ? `OK: ${records}` : "OK";
}

function parseKeyValueSegments(line: string) {
  const segments = line.split("\t").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) return new Map<string, string>();
  if (/^USER\s+/i.test(segments[0]!)) {
    segments[0] = segments[0]!.replace(/^USER\s+/i, "");
  }
  const values = new Map<string, string>();
  for (const segment of segments) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const key = segment.slice(0, separator).trim().toUpperCase();
    const value = segment.slice(separator + 1);
    if (!key || values.has(key)) continue;
    values.set(key, value);
  }
  return values;
}

/**
 * Parses only roster fields that are safe for reconciliation. Passwords, biometric templates and
 * unknown vendor fields are intentionally discarded and are never copied to safe metadata.
 */
export function parseSafeDeviceRosterRecords(text: string): SafeDeviceRosterRecord[] {
  const records: SafeDeviceRosterRecord[] = [];
  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    const line = rawLine.trim();
    if (!line || (/^[A-Z]+\s+/i.test(line) && !/^USER\s+/i.test(line))) continue;
    const values = parseKeyValueSegments(line);
    const pin = safeValue(values.get("PIN"), 128);
    if (!pin) continue;

    const displayName = safeValue(values.get("NAME"), 160);
    const cardNumber = safeValue(values.get("CARD"), 160);
    const privilege = safeValue(values.get("PRI") ?? values.get("PRIVILEGE"), 80);
    const verifyMode = safeValue(values.get("VERIFY") ?? values.get("VERIFYMODE"), 80);
    const group = safeValue(values.get("GRP") ?? values.get("GROUP"), 80);
    const timezone = safeValue(values.get("TZ") ?? values.get("TIMEZONE"), 80);
    const safeMetadata: Record<string, string> = {};
    if (group) safeMetadata.group = group;
    if (timezone) safeMetadata.timezone = timezone;

    records.push({ pin, displayName, cardNumber, privilege, verifyMode, safeMetadata });
  }
  return records;
}

export function isAttlogDeviceData(input: { table: string | null; text: string }) {
  if (input.table !== null) return input.table === "ATTLOG";
  return looksLikeAttlogPayload(input.text);
}

/**
 * Request-journal payloads are useful forensic evidence for attendance, but roster credentials,
 * passwords and biometric template data must never be retained there in plaintext. POST payloads
 * outside the exact ATTLOG contract are therefore redacted for both /iclock/cdata and /iclock/querydata.
 */
export function shouldRedactDeviceDataBody(input: {
  method: string;
  path: string;
  table: string | null;
  text: string;
}) {
  if (input.method !== "POST" || input.text.length === 0) return false;
  if (input.path === "/iclock/querydata") return true;
  if (input.path !== "/iclock/cdata") return false;
  return !isAttlogDeviceData({ table: input.table, text: input.text });
}
