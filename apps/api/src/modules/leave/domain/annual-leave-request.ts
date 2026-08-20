import {
  ANNUAL_LEAVE_ENTITLEMENT_DAYS,
  ANNUAL_LEAVE_MINIMUM_NOTICE_DAYS,
  assertAnnualLeaveEntitlementGroup,
  calculateAnnualLeaveYearView,
  type AnnualLeavePeriodKey,
  type LeaveEntitlementGroup,
} from "./annual-leave-policy.js";

export interface AnnualLeaveRequestValidationInput {
  entitlementGroup: LeaveEntitlementGroup | null | undefined;
  employmentStartedOn: string;
  submittedOn: string;
  leaveStartOn: string;
  leaveEndOn: string;
  requestedWorkingDays: number;
  usedDaysByPeriod?: Partial<Record<AnnualLeavePeriodKey, number>>;
}

export interface AnnualLeaveRequestValidationResult {
  annualEntitlementDays: number;
  eligibleFrom: string;
  periodKey: AnnualLeavePeriodKey;
  periodLimitDays: number;
  usedDaysBeforeRequest: number;
  availableDaysBeforeRequest: number;
  requestedWorkingDays: number;
  availableDaysAfterRequest: number;
  noticeDays: number;
  minimumNoticeDays: number;
}

export class AnnualLeaveRequestPolicyError extends Error {
  constructor(
    readonly code:
      | "INVALID_DATE"
      | "INVALID_WORKING_DAYS"
      | "END_BEFORE_START"
      | "MINIMUM_NOTICE_NOT_MET"
      | "NOT_YET_ELIGIBLE"
      | "CROSS_PERIOD_REQUEST_UNSUPPORTED"
      | "PERIOD_LIMIT_EXCEEDED",
    message: string,
  ) {
    super(message);
    this.name = "AnnualLeaveRequestPolicyError";
  }
}

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AnnualLeaveRequestPolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    throw new AnnualLeaveRequestPolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }

  const roundTrip = new Date(timestamp).toISOString().slice(0, 10);
  if (roundTrip !== value) {
    throw new AnnualLeaveRequestPolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }

  return timestamp;
}

function calendarDaysBetween(from: string, to: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((dateValue(to) - dateValue(from)) / millisecondsPerDay);
}

export function validateAnnualLeaveRequest(
  input: AnnualLeaveRequestValidationInput,
): AnnualLeaveRequestValidationResult {
  assertAnnualLeaveEntitlementGroup(input.entitlementGroup);

  if (!Number.isFinite(input.requestedWorkingDays) || input.requestedWorkingDays <= 0) {
    throw new AnnualLeaveRequestPolicyError(
      "INVALID_WORKING_DAYS",
      "Jumlah hari kerja yang diajukan harus lebih dari 0.",
    );
  }

  const rangeDays = calendarDaysBetween(input.leaveStartOn, input.leaveEndOn);
  if (rangeDays < 0) {
    throw new AnnualLeaveRequestPolicyError(
      "END_BEFORE_START",
      "Tanggal selesai cuti tidak boleh sebelum tanggal mulai.",
    );
  }

  const noticeDays = calendarDaysBetween(input.submittedOn, input.leaveStartOn);
  if (noticeDays < ANNUAL_LEAVE_MINIMUM_NOTICE_DAYS) {
    throw new AnnualLeaveRequestPolicyError(
      "MINIMUM_NOTICE_NOT_MET",
      `Cuti Tahunan harus diajukan minimal ${ANNUAL_LEAVE_MINIMUM_NOTICE_DAYS} hari sebelumnya.`,
    );
  }

  const startView = calculateAnnualLeaveYearView({
    employmentStartedOn: input.employmentStartedOn,
    referenceDate: input.leaveStartOn,
    usedDaysByPeriod: input.usedDaysByPeriod,
  });
  if (!startView.eligible) {
    throw new AnnualLeaveRequestPolicyError(
      "NOT_YET_ELIGIBLE",
      `Hak Cuti Tahunan dapat digunakan mulai ${startView.eligibleFrom}.`,
    );
  }

  const endView = calculateAnnualLeaveYearView({
    employmentStartedOn: input.employmentStartedOn,
    referenceDate: input.leaveEndOn,
    usedDaysByPeriod: input.usedDaysByPeriod,
  });
  if (
    startView.year !== endView.year ||
    startView.currentPeriodKey !== endView.currentPeriodKey
  ) {
    throw new AnnualLeaveRequestPolicyError(
      "CROSS_PERIOD_REQUEST_UNSUPPORTED",
      "Pengajuan Cuti Tahunan tidak boleh melintasi dua periode kuota dalam satu request.",
    );
  }

  const period = startView.periods.find(
    (candidate) => candidate.key === startView.currentPeriodKey,
  );
  if (!period) {
    throw new AnnualLeaveRequestPolicyError(
      "INVALID_DATE",
      "Periode Cuti Tahunan tidak ditemukan.",
    );
  }

  if (input.requestedWorkingDays > startView.availableNowDays) {
    throw new AnnualLeaveRequestPolicyError(
      "PERIOD_LIMIT_EXCEEDED",
      `Sisa kuota periode ${period.label} adalah ${startView.availableNowDays} hari kerja.`,
    );
  }

  return {
    annualEntitlementDays: ANNUAL_LEAVE_ENTITLEMENT_DAYS,
    eligibleFrom: startView.eligibleFrom,
    periodKey: startView.currentPeriodKey,
    periodLimitDays: startView.currentPeriodLimitDays,
    usedDaysBeforeRequest: period.usedDays,
    availableDaysBeforeRequest: startView.availableNowDays,
    requestedWorkingDays: input.requestedWorkingDays,
    availableDaysAfterRequest:
      startView.availableNowDays - input.requestedWorkingDays,
    noticeDays,
    minimumNoticeDays: ANNUAL_LEAVE_MINIMUM_NOTICE_DAYS,
  };
}
