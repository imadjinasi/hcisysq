const sensitiveProtocolTables = new Set([
  "OPERLOG",
  "USERINFO",
  "FINGERTMP",
  "BIODATA",
  "BIODATAINFO",
  "ATTPHOTO",
  "BIOMEDATA",
]);

export function extractProtocolTable(url: URL): string | null {
  for (const key of ["table", "Table", "TABLE"]) {
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

/**
 * Request-journal payloads are useful forensic evidence for attendance, but roster credentials,
 * passwords and biometric template data must never be retained there in plaintext. A POST to
 * /iclock/cdata is therefore considered routine-journal-safe only when it is explicitly ATTLOG
 * or structurally matches the eleven-field ATTLOG record contract. All other non-empty cdata
 * payloads are redacted from the journal while retaining their hash, length and safe metadata.
 */
export function shouldRedactDeviceDataBody(input: {
  method: string;
  path: string;
  table: string | null;
  text: string;
}) {
  if (input.method !== "POST" || input.path !== "/iclock/cdata" || input.text.length === 0) return false;
  if (input.table === "ATTLOG") return false;
  if (looksLikeAttlogPayload(input.text)) return false;
  return true;
}
