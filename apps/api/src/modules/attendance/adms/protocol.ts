import { createHash } from "node:crypto";

export const ADMS_MAX_BODY_BYTES = 512 * 1024;
export const ADMS_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export type ParsedAttlogEvent = {
  rawLine: string;
  rawFields: string[];
  pin: string;
  occurredAtRaw: string;
  occurredAt: Date;
  rawLineSha256: string;
};

export type AttlogQuarantine = {
  reason: "INVALID_FIELD_COUNT" | "INVALID_TIMESTAMP" | "FUTURE_TIMESTAMP" | "UNSUPPORTED_ENCODING";
  rawLine: string;
  details: Record<string, string | number | boolean>;
};

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function containsControlCharacter(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

export function normalizeDeviceSerial(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || containsControlCharacter(normalized)) {
    throw new Error("Invalid ADMS serial");
  }
  return normalized;
}

export function parseAttlogText(
  text: string,
  timezone: string,
  receivedAt: Date,
): { events: ParsedAttlogEvent[]; quarantines: AttlogQuarantine[] } {
  const events: ParsedAttlogEvent[] = [];
  const quarantines: AttlogQuarantine[] = [];
  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    if (rawLine === "") continue;
    const rawFields = rawLine.split("\t");
    if (rawFields.length !== 11) {
      quarantines.push({
        reason: "INVALID_FIELD_COUNT",
        rawLine,
        details: { expected: 11, actual: rawFields.length },
      });
      continue;
    }
    const occurredAtRaw = rawFields[1] ?? "";
    const occurredAt = parseLocalDeviceTime(occurredAtRaw, timezone);
    if (!occurredAt) {
      quarantines.push({ reason: "INVALID_TIMESTAMP", rawLine, details: { timezone } });
      continue;
    }
    if (occurredAt.getTime() > receivedAt.getTime() + ADMS_FUTURE_TOLERANCE_MS) {
      quarantines.push({
        reason: "FUTURE_TIMESTAMP",
        rawLine,
        details: { toleranceMs: ADMS_FUTURE_TOLERANCE_MS },
      });
      continue;
    }
    events.push({
      rawLine,
      rawFields,
      pin: rawFields[0] ?? "",
      occurredAtRaw,
      occurredAt,
      rawLineSha256: sha256(rawLine),
    });
  }
  return { events, quarantines };
}

export function extractSerialCandidate(url: URL): string | null {
  for (const key of ["SN", "sn", "serial", "Serial"]) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    try {
      return normalizeDeviceSerial(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function optionsAllHandshakeBody(url: URL, serial: string | null, attlogStamp = "None") {
  if (!serial || url.pathname !== "/iclock/cdata" || url.searchParams.get("options") !== "all") {
    return null;
  }
  return [
    `GET OPTION FROM: ${serial}`,
    `ATTLOGStamp=${attlogStamp}`,
    "OPERLOGStamp=None",
    "ATTPHOTOStamp=None",
    "ErrorDelay=30",
    "Delay=10",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=TransData\tAttLog",
    "TimeZone=7",
    "Realtime=1",
    "Encrypt=None",
    "ServerVer=2.4.1",
    "PushProtVer=2.4.1",
    "PushOptionsFlag=0",
  ].join("\n");
}

/**
 * PUSH SDK devices poll this endpoint even when the server has no command to send.
 * The vendor protocol requires a literal two-byte "OK" response in that idle case;
 * an empty 200 response is not protocol-equivalent for all firmware generations.
 */
export function getRequestIdleAcknowledgementBody(url: URL): string | null {
  return url.pathname === "/iclock/getrequest" ? "OK" : null;
}

export function extractAttlogStamp(url: URL): string | null {
  const value = url.searchParams.get("Stamp") ?? url.searchParams.get("stamp");
  if (!value || value.length > 256 || containsControlCharacter(value)) return null;
  return value;
}

export function attlogAcknowledgementBody(text: string): string | null {
  const records = text.split(/\r\n|\n|\r/).filter((line) => line !== "").length;
  return records > 0 ? `OK: ${records}` : null;
}

export function bodySha256(body: Uint8Array) {
  return sha256(body);
}

export function attlogEventIdentity(serialNumber: string, event: ParsedAttlogEvent): string {
  const [status = "", verify = "", workcode = ""] = event.rawFields.slice(2, 5);
  return sha256(
    [
      serialNumber,
      event.pin,
      event.occurredAtRaw,
      status,
      verify,
      workcode,
      event.rawLineSha256,
    ].join("\0"),
  );
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseLocalParts(value: string): LocalParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if ([year, month, day, hour, minute, second].some((part) => !Number.isInteger(part))) return null;
  if (month! < 1 || month! > 12 || day! < 1 || day! > 31 || hour! > 23 || minute! > 59 || second! > 59) return null;
  const date = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, second!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) return null;
  return { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: second! };
}

function localPartsAt(date: Date, timezone: string): LocalParts {
  const values = new Intl.DateTimeFormat("en-CA", {
    calendar: "iso8601",
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(values.find((part) => part.type === type)?.value);
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour"), minute: get("minute"), second: get("second"),
  };
}

function sameParts(left: LocalParts, right: LocalParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day &&
    left.hour === right.hour && left.minute === right.minute && left.second === right.second;
}

function parseLocalDeviceTime(value: string, timezone: string): Date | null {
  const target = parseLocalParts(value);
  if (!target) return null;
  const assumedUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  const observed = localPartsAt(new Date(assumedUtc), timezone);
  const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
  const candidate = new Date(assumedUtc - (observedAsUtc - assumedUtc));
  if (!sameParts(localPartsAt(candidate, timezone), target)) return null;
  for (const delta of [-60, 60]) {
    if (sameParts(localPartsAt(new Date(candidate.getTime() + delta * 60_000), timezone), target)) return null;
  }
  return candidate;
}
