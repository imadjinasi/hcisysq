export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface LeaveCalendarException {
  date: string;
  isWorkingDay: boolean;
}

export interface WorkingDayCalendar {
  workingWeekdays: IsoWeekday[];
  exceptions?: readonly LeaveCalendarException[];
}

export interface WorkingDayCalculation {
  workingDays: number;
  workingDates: string[];
  nonWorkingDates: string[];
}

export class WorkingCalendarError extends Error {
  constructor(
    readonly code:
      | "INVALID_DATE"
      | "END_BEFORE_START"
      | "WORKWEEK_NOT_CONFIGURED"
      | "RANGE_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "WorkingCalendarError";
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new WorkingCalendarError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new WorkingCalendarError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekday(date: Date): IsoWeekday {
  const day = date.getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

export function encodeWorkingWeekdays(weekdays: readonly IsoWeekday[]): number {
  if (weekdays.length === 0) {
    throw new WorkingCalendarError(
      "WORKWEEK_NOT_CONFIGURED",
      "Minimal satu hari kerja mingguan harus dikonfigurasi.",
    );
  }

  return [...new Set(weekdays)].reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

export function decodeWorkingWeekdays(mask: number | null | undefined): IsoWeekday[] | null {
  if (!mask || mask < 1 || mask > 127) return null;
  const result: IsoWeekday[] = [];
  for (let day = 1 as IsoWeekday; day <= 7; day = (day + 1) as IsoWeekday) {
    if ((mask & (1 << (day - 1))) !== 0) result.push(day);
  }
  return result;
}

export function calculateWorkingDays(
  startOn: string,
  endOn: string,
  calendar: WorkingDayCalendar,
): WorkingDayCalculation {
  if (calendar.workingWeekdays.length === 0) {
    throw new WorkingCalendarError(
      "WORKWEEK_NOT_CONFIGURED",
      "Kalender hari kerja belum dikonfigurasi.",
    );
  }

  const start = parseIsoDate(startOn);
  const end = parseIsoDate(endOn);
  if (end.getTime() < start.getTime()) {
    throw new WorkingCalendarError(
      "END_BEFORE_START",
      "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    );
  }

  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  if (inclusiveDays > 366) {
    throw new WorkingCalendarError(
      "RANGE_TOO_LARGE",
      "Rentang pengajuan maksimal 366 hari kalender.",
    );
  }

  const workingWeekdays = new Set<IsoWeekday>(calendar.workingWeekdays);
  const exceptionMap = new Map(
    (calendar.exceptions ?? []).map((item) => [item.date, item.isWorkingDay]),
  );
  const workingDates: string[] = [];
  const nonWorkingDates: string[] = [];

  for (let offset = 0; offset < inclusiveDays; offset += 1) {
    const date = new Date(start.getTime() + offset * MS_PER_DAY);
    const key = isoDate(date);
    const exception = exceptionMap.get(key);
    const isWorking =
      exception === undefined ? workingWeekdays.has(isoWeekday(date)) : exception;

    if (isWorking) workingDates.push(key);
    else nonWorkingDates.push(key);
  }

  return {
    workingDays: workingDates.length,
    workingDates,
    nonWorkingDates,
  };
}
