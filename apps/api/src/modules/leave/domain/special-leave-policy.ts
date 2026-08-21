import { getLeavePolicy } from "./policy-catalog.js";

export const SUPPORTED_SPECIAL_LEAVE_KEYS = [
  "maternity",
  "miscarriage",
  "menstruation_rest",
  "sick",
  "spouse_childbirth",
  "spouse_miscarriage",
  "family_bereavement",
] as const;

export type SupportedSpecialLeaveKey = (typeof SUPPORTED_SPECIAL_LEAVE_KEYS)[number];

export interface SpecialLeaveRequestInput {
  policyKey: SupportedSpecialLeaveKey;
  submittedOn: string;
  startOn: string;
  endOn: string;
  workingDays: number;
  hasEvidence: boolean;
}

export interface SpecialLeaveRequestValidation {
  policyKey: SupportedSpecialLeaveKey;
  policyName: string;
  workingDays: number;
  minimumNoticeDays: number | null;
  noticeDays: number;
  lineHandling: "notify";
  hcHandling: "validate" | "notify";
  evidenceRequirement:
    | "none"
    | "required"
    | "required_deferred_allowed"
    | "conditional";
  emergencyNoticeAllowed: boolean;
  evidencePending: boolean;
  warnings: Array<{ code: string; message: string }>;
}

interface RuleSupplement {
  maxWorkingDays?: number;
  maxCalendarMonths?: number;
}

const RULE_SUPPLEMENTS: Partial<Record<SupportedSpecialLeaveKey, RuleSupplement>> = {
  // The normal maternity request covers the three-month base right. The policy's
  // additional period (up to three more months) is conditional on a special
  // medical circumstance and therefore must not be granted by this generic flow.
  maternity: { maxCalendarMonths: 3 },
  menstruation_rest: { maxWorkingDays: 2 },
  spouse_childbirth: { maxWorkingDays: 2 },
  spouse_miscarriage: { maxWorkingDays: 2 },
  family_bereavement: { maxWorkingDays: 2 },
};

export class SpecialLeavePolicyError extends Error {
  constructor(
    readonly code:
      | "INVALID_DATE"
      | "END_BEFORE_START"
      | "INVALID_WORKING_DAYS"
      | "MINIMUM_NOTICE_NOT_MET"
      | "EVIDENCE_REQUIRED"
      | "DURATION_LIMIT_EXCEEDED"
      | "UNSUPPORTED_POLICY_CONFIGURATION",
    message: string,
  ) {
    super(message);
    this.name = "SpecialLeavePolicyError";
  }
}

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new SpecialLeavePolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) {
    throw new SpecialLeavePolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }
  if (new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new SpecialLeavePolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }
  return timestamp;
}

function calendarDaysBetween(from: string, to: string): number {
  return Math.floor((dateValue(to) - dateValue(from)) / 86_400_000);
}

function addMonthsClamped(value: string, months: number): string {
  const timestamp = dateValue(value);
  const source = new Date(timestamp);
  const sourceDay = source.getUTCDate();
  const targetMonthIndex = source.getUTCFullYear() * 12 + source.getUTCMonth() + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(targetYear, targetMonth, Math.min(sourceDay, lastDay)));
  return target.toISOString().slice(0, 10);
}

export function validateSpecialLeaveRequest(
  input: SpecialLeaveRequestInput,
): SpecialLeaveRequestValidation {
  if (!Number.isFinite(input.workingDays) || input.workingDays <= 0) {
    throw new SpecialLeavePolicyError(
      "INVALID_WORKING_DAYS",
      "Rentang cuti harus memiliki sedikitnya satu hari kerja.",
    );
  }

  if (calendarDaysBetween(input.startOn, input.endOn) < 0) {
    throw new SpecialLeavePolicyError(
      "END_BEFORE_START",
      "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    );
  }

  const policy = getLeavePolicy(input.policyKey);
  if (
    policy.requestMode !== "individual" ||
    policy.lineHandling !== "notify" ||
    !["validate", "notify"].includes(policy.hcHandling)
  ) {
    throw new SpecialLeavePolicyError(
      "UNSUPPORTED_POLICY_CONFIGURATION",
      "Konfigurasi jenis cuti ini belum didukung oleh alur Cuti Khusus saat ini.",
    );
  }

  const noticeDays = calendarDaysBetween(input.submittedOn, input.startOn);
  if (
    policy.minimumNoticeDays !== null &&
    noticeDays < policy.minimumNoticeDays &&
    !policy.emergencyNoticeAllowed
  ) {
    throw new SpecialLeavePolicyError(
      "MINIMUM_NOTICE_NOT_MET",
      `${policy.name} harus disampaikan minimal ${policy.minimumNoticeDays} hari sebelumnya.`,
    );
  }

  if (policy.evidenceRequirement === "required" && !input.hasEvidence) {
    throw new SpecialLeavePolicyError(
      "EVIDENCE_REQUIRED",
      `Dokumen pendukung wajib dilampirkan untuk ${policy.name}.`,
    );
  }

  const supplement = RULE_SUPPLEMENTS[input.policyKey];
  if (
    supplement?.maxWorkingDays !== undefined &&
    input.workingDays > supplement.maxWorkingDays
  ) {
    throw new SpecialLeavePolicyError(
      "DURATION_LIMIT_EXCEEDED",
      `${policy.name} pada baseline saat ini maksimal ${supplement.maxWorkingDays} hari kerja untuk satu pengajuan.`,
    );
  }

  if (supplement?.maxCalendarMonths !== undefined) {
    const exclusiveLimit = addMonthsClamped(input.startOn, supplement.maxCalendarMonths);
    if (dateValue(input.endOn) >= dateValue(exclusiveLimit)) {
      throw new SpecialLeavePolicyError(
        "DURATION_LIMIT_EXCEEDED",
        input.policyKey === "maternity"
          ? "Cuti Hamil dan Melahirkan pada alur normal mencakup hak dasar 3 bulan. Tambahan karena kondisi khusus memerlukan surat medis dan alur keputusan terpisah."
          : `${policy.name} pada baseline saat ini tidak boleh melampaui total ${supplement.maxCalendarMonths} bulan tanpa kebijakan lanjutan yang terpisah.`,
      );
    }
  }

  const warnings: Array<{ code: string; message: string }> = [];
  const evidencePending =
    policy.evidenceRequirement === "required_deferred_allowed" && !input.hasEvidence;
  if (evidencePending) {
    warnings.push({
      code: "EVIDENCE_DEFERRED",
      message:
        "Pengajuan dapat dicatat sekarang karena kondisi darurat, tetapi dokumen pendukung harus dilengkapi sebelum validasi HC selesai.",
    });
  }

  return {
    policyKey: input.policyKey,
    policyName: policy.name,
    workingDays: input.workingDays,
    minimumNoticeDays: policy.minimumNoticeDays,
    noticeDays,
    lineHandling: "notify",
    hcHandling: policy.hcHandling as "validate" | "notify",
    evidenceRequirement: policy.evidenceRequirement,
    emergencyNoticeAllowed: policy.emergencyNoticeAllowed,
    evidencePending,
    warnings,
  };
}
