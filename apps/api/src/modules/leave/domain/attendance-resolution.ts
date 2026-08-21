import {
  ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
  annualLeaveEligibilityDate,
  type AnnualLeavePeriodKey,
  type LeaveEntitlementGroup,
} from "./annual-leave-policy.js";

export type AdministrationStatus =
  | "validated"
  | "partially_validated"
  | "not_validated";

export interface AdministrationDayResult {
  administrationStatus: AdministrationStatus;
  validatedDates: string[];
  unresolvedDates: string[];
}

export interface AnnualConversionOffer {
  available: boolean;
  periodKey: AnnualLeavePeriodKey | null;
  periodLimitDays: number;
  usedDays: number;
  remainingDays: number;
  requestedDays: number;
  reason: string | null;
}

export class AttendanceResolutionPolicyError extends Error {
  constructor(
    readonly code:
      | "INVALID_WORKING_DATES"
      | "INVALID_VALIDATED_DATE"
      | "PARTIAL_VALIDATION_REQUIRES_MIXED_DATES",
    message: string,
  ) {
    super(message);
    this.name = "AttendanceResolutionPolicyError";
  }
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort();
}

function assertIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AttendanceResolutionPolicyError(
      "INVALID_WORKING_DATES",
      `Tanggal tidak valid: ${value}`,
    );
  }
}

export function classifyAdministrationDays(input: {
  workingDates: readonly string[];
  action: "validate_all" | "validate_partial" | "not_validated";
  validatedDates?: readonly string[];
}): AdministrationDayResult {
  const workingDates = uniqueSorted(input.workingDates);
  if (workingDates.length === 0) {
    throw new AttendanceResolutionPolicyError(
      "INVALID_WORKING_DATES",
      "Pengajuan tidak memiliki hari kerja yang dapat divalidasi.",
    );
  }
  workingDates.forEach(assertIsoDate);
  const workingSet = new Set(workingDates);

  if (input.action === "validate_all") {
    return {
      administrationStatus: "validated",
      validatedDates: workingDates,
      unresolvedDates: [],
    };
  }

  if (input.action === "not_validated") {
    return {
      administrationStatus: "not_validated",
      validatedDates: [],
      unresolvedDates: workingDates,
    };
  }

  const validatedDates = uniqueSorted(input.validatedDates ?? []);
  for (const date of validatedDates) {
    assertIsoDate(date);
    if (!workingSet.has(date)) {
      throw new AttendanceResolutionPolicyError(
        "INVALID_VALIDATED_DATE",
        "Tanggal tervalidasi harus termasuk hari kerja pada pengajuan.",
      );
    }
  }

  if (validatedDates.length === 0 || validatedDates.length === workingDates.length) {
    throw new AttendanceResolutionPolicyError(
      "PARTIAL_VALIDATION_REQUIRES_MIXED_DATES",
      "Validasi sebagian harus menyisakan minimal satu tanggal tervalidasi dan satu tanggal belum terselesaikan.",
    );
  }

  const validatedSet = new Set(validatedDates);
  return {
    administrationStatus: "partially_validated",
    validatedDates,
    unresolvedDates: workingDates.filter((date) => !validatedSet.has(date)),
  };
}

export function annualPeriodKeyForDate(value: string): AnnualLeavePeriodKey {
  assertIsoDate(value);
  const month = Number(value.slice(5, 7));
  if (month <= 3) return "JAN_MAR";
  if (month <= 6) return "APR_JUN";
  if (month <= 9) return "JUL_SEP";
  return "OCT_DEC";
}

export function evaluateAnnualConversionOffer(input: {
  entitlementGroup: LeaveEntitlementGroup | null;
  employmentStartedOn: string | null;
  unresolvedDates: readonly string[];
  usedDaysInPeriod: number;
}): AnnualConversionOffer {
  const unresolvedDates = uniqueSorted(input.unresolvedDates);
  const requestedDays = unresolvedDates.length;

  if (input.entitlementGroup !== "non_education") {
    return {
      available: false,
      periodKey: null,
      periodLimitDays: ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
      usedDays: input.usedDaysInPeriod,
      remainingDays: 0,
      requestedDays,
      reason: "Konversi Cuti Tahunan hanya tersedia untuk tenaga non-pendidikan.",
    };
  }
  if (!input.employmentStartedOn || requestedDays === 0) {
    return {
      available: false,
      periodKey: null,
      periodLimitDays: ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
      usedDays: input.usedDaysInPeriod,
      remainingDays: 0,
      requestedDays,
      reason: "Data masa kerja atau tanggal penyelesaian belum lengkap.",
    };
  }

  const periodKeys = new Set(unresolvedDates.map(annualPeriodKeyForDate));
  const years = new Set(unresolvedDates.map((date) => date.slice(0, 4)));
  if (periodKeys.size !== 1 || years.size !== 1) {
    return {
      available: false,
      periodKey: null,
      periodLimitDays: ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
      usedDays: input.usedDaysInPeriod,
      remainingDays: 0,
      requestedDays,
      reason: "Tanggal yang perlu diselesaikan harus berada dalam satu periode Cuti Tahunan.",
    };
  }

  const periodKey = annualPeriodKeyForDate(unresolvedDates[0]!);
  const eligibleFrom = annualLeaveEligibilityDate(input.employmentStartedOn);
  if (unresolvedDates.some((date) => date < eligibleFrom)) {
    return {
      available: false,
      periodKey,
      periodLimitDays: ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
      usedDays: input.usedDaysInPeriod,
      remainingDays: Math.max(0, ANNUAL_LEAVE_PERIOD_LIMIT_DAYS - input.usedDaysInPeriod),
      requestedDays,
      reason: "Pada tanggal tersebut pegawai belum genap 12 bulan bekerja.",
    };
  }

  const remainingDays = Math.max(
    0,
    ANNUAL_LEAVE_PERIOD_LIMIT_DAYS - input.usedDaysInPeriod,
  );
  if (requestedDays > remainingDays) {
    return {
      available: false,
      periodKey,
      periodLimitDays: ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
      usedDays: input.usedDaysInPeriod,
      remainingDays,
      requestedDays,
      reason: "Kuota periode Cuti Tahunan tidak cukup untuk seluruh tanggal yang perlu diselesaikan.",
    };
  }

  return {
    available: true,
    periodKey,
    periodLimitDays: ANNUAL_LEAVE_PERIOD_LIMIT_DAYS,
    usedDays: input.usedDaysInPeriod,
    remainingDays,
    requestedDays,
    reason: null,
  };
}
