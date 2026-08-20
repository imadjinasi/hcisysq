export const ANNUAL_LEAVE_ENTITLEMENT_DAYS = 12;
export const ANNUAL_LEAVE_PERIOD_LIMIT_DAYS = 3;
export const ANNUAL_LEAVE_ELIGIBILITY_MONTHS = 12;
export const ANNUAL_LEAVE_MINIMUM_NOTICE_DAYS = 7;

export type LeaveEntitlementGroup = "education" | "non_education";

export type AnnualLeavePeriodKey =
  | "JAN_MAR"
  | "APR_JUN"
  | "JUL_SEP"
  | "OCT_DEC";

export type AnnualLeavePeriodStatus =
  | "not_eligible"
  | "upcoming"
  | "current"
  | "closed";

export interface AnnualLeavePeriodView {
  key: AnnualLeavePeriodKey;
  label: string;
  allocationDays: number;
  usedDays: number;
  remainingDays: number;
  usableFrom: string | null;
  status: AnnualLeavePeriodStatus;
}

export interface AnnualLeaveYearView {
  annualEntitlementDays: number;
  eligibilityMonths: number;
  eligibleFrom: string;
  eligible: boolean;
  referenceDate: string;
  year: number;
  availableNowDays: number;
  currentPeriodKey: AnnualLeavePeriodKey;
  currentPeriodLimitDays: number;
  eligiblePeriodAllocationDaysInYear: number;
  carryForwardEnabled: false;
  periods: AnnualLeavePeriodView[];
}

export interface AnnualLeaveYearInput {
  employmentStartedOn: string;
  referenceDate: string;
  usedDaysByPeriod?: Partial<Record<AnnualLeavePeriodKey, number>>;
}

interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

interface PeriodDefinition {
  key: AnnualLeavePeriodKey;
  label: string;
  startMonth: number;
  endMonth: number;
}

const PERIODS: PeriodDefinition[] = [
  { key: "JAN_MAR", label: "Januari-Maret", startMonth: 1, endMonth: 3 },
  { key: "APR_JUN", label: "April-Juni", startMonth: 4, endMonth: 6 },
  { key: "JUL_SEP", label: "Juli-September", startMonth: 7, endMonth: 9 },
  { key: "OCT_DEC", label: "Oktober-Desember", startMonth: 10, endMonth: 12 },
];

export class AnnualLeavePolicyError extends Error {
  constructor(
    readonly code:
      | "INVALID_DATE"
      | "INVALID_USAGE"
      | "UNSUPPORTED_ENTITLEMENT_GROUP",
    message: string,
  ) {
    super(message);
    this.name = "AnnualLeavePolicyError";
  }
}

function parseIsoDate(value: string): IsoDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new AnnualLeavePolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new AnnualLeavePolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }

  return { year, month, day };
}

function formatIsoDate(parts: IsoDateParts): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsClamped(parts: IsoDateParts, months: number): IsoDateParts {
  const zeroBasedTargetMonth = parts.year * 12 + (parts.month - 1) + months;
  const year = Math.floor(zeroBasedTargetMonth / 12);
  const month = (zeroBasedTargetMonth % 12) + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return { year, month, day };
}

function compareDates(a: IsoDateParts, b: IsoDateParts): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function maxDate(a: IsoDateParts, b: IsoDateParts): IsoDateParts {
  return compareDates(a, b) >= 0 ? a : b;
}

function periodStart(year: number, period: PeriodDefinition): IsoDateParts {
  return { year, month: period.startMonth, day: 1 };
}

function periodEnd(year: number, period: PeriodDefinition): IsoDateParts {
  return {
    year,
    month: period.endMonth,
    day: daysInMonth(year, period.endMonth),
  };
}

function currentPeriodForMonth(month: number): PeriodDefinition {
  const period = PERIODS.find(
    (candidate) => month >= candidate.startMonth && month <= candidate.endMonth,
  );
  if (!period) {
    throw new AnnualLeavePolicyError("INVALID_DATE", `Bulan tidak valid: ${month}`);
  }
  return period;
}

function validateUsedDays(value: number, key: AnnualLeavePeriodKey): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new AnnualLeavePolicyError(
      "INVALID_USAGE",
      `Pemakaian cuti periode ${key} tidak valid.`,
    );
  }
  return value;
}

export function annualLeaveEligibilityDate(employmentStartedOn: string): string {
  const startedOn = parseIsoDate(employmentStartedOn);
  return formatIsoDate(addMonthsClamped(startedOn, ANNUAL_LEAVE_ELIGIBILITY_MONTHS));
}

export function calculateAnnualLeaveYearView(
  input: AnnualLeaveYearInput,
): AnnualLeaveYearView {
  const startedOn = parseIsoDate(input.employmentStartedOn);
  const referenceDate = parseIsoDate(input.referenceDate);
  const eligibleFrom = addMonthsClamped(startedOn, ANNUAL_LEAVE_ELIGIBILITY_MONTHS);
  const currentPeriod = currentPeriodForMonth(referenceDate.month);

  const periods = PERIODS.map<AnnualLeavePeriodView>((period) => {
    const start = periodStart(referenceDate.year, period);
    const end = periodEnd(referenceDate.year, period);
    const canEverUsePeriod = compareDates(eligibleFrom, end) <= 0;
    const usableFrom = canEverUsePeriod ? maxDate(start, eligibleFrom) : null;
    const usedDays = validateUsedDays(input.usedDaysByPeriod?.[period.key] ?? 0, period.key);
    const remainingDays = Math.max(0, ANNUAL_LEAVE_PERIOD_LIMIT_DAYS - usedDays);

    let status: AnnualLeavePeriodStatus;
    if (!usableFrom) {
      status = "not_eligible";
    } else if (compareDates(referenceDate, usableFrom) < 0) {
      status = "upcoming";
    } else if (compareDates(referenceDate, end) > 0) {
      status = "closed";
    } else {
      status = "current";
    }

    return {
      key: period.key,
      label: period.label,
      allocationDays: ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
      usedDays,
      remainingDays,
      usableFrom: usableFrom ? formatIsoDate(usableFrom) : null,
      status,
    };
  });

  const currentPeriodView = periods.find((period) => period.key === currentPeriod.key);
  if (!currentPeriodView) {
    throw new AnnualLeavePolicyError("INVALID_DATE", "Periode cuti tidak ditemukan.");
  }

  const eligible = compareDates(referenceDate, eligibleFrom) >= 0;
  const availableNowDays =
    currentPeriodView.status === "current" ? currentPeriodView.remainingDays : 0;
  const eligiblePeriodAllocationDaysInYear = periods.reduce(
    (total, period) => total + (period.usableFrom ? period.allocationDays : 0),
    0,
  );

  return {
    annualEntitlementDays: ANNUAL_LEAVE_ENTITLEMENT_DAYS,
    eligibilityMonths: ANNUAL_LEAVE_ELIGIBILITY_MONTHS,
    eligibleFrom: formatIsoDate(eligibleFrom),
    eligible,
    referenceDate: formatIsoDate(referenceDate),
    year: referenceDate.year,
    availableNowDays,
    currentPeriodKey: currentPeriod.key,
    currentPeriodLimitDays: ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
    eligiblePeriodAllocationDaysInYear,
    carryForwardEnabled: false,
    periods,
  };
}

export function assertAnnualLeaveEntitlementGroup(
  group: LeaveEntitlementGroup | null | undefined,
): asserts group is "non_education" {
  if (group !== "non_education") {
    throw new AnnualLeavePolicyError(
      "UNSUPPORTED_ENTITLEMENT_GROUP",
      "Cuti Tahunan individual hanya berlaku untuk kelompok tenaga non-pendidikan.",
    );
  }
}
