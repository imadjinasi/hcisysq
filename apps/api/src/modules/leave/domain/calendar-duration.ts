export class CalendarDurationError extends Error {
  constructor(
    readonly code: "INVALID_DATE" | "END_BEFORE_START",
    message: string,
  ) {
    super(message);
    this.name = "CalendarDurationError";
  }
}

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CalendarDurationError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new CalendarDurationError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }
  return timestamp;
}

export function calendarDaysBetween(from: string, to: string): number {
  return Math.floor((dateValue(to) - dateValue(from)) / 86_400_000);
}

export function inclusiveCalendarDurationDays(startOn: string, endOn: string): number {
  const difference = calendarDaysBetween(startOn, endOn);
  if (difference < 0) {
    throw new CalendarDurationError(
      "END_BEFORE_START",
      "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    );
  }
  return difference + 1;
}
