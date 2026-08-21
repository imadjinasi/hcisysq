import { getLeavePolicy, type LeavePolicyKey } from "./policy-catalog.js";

export const SUPPORTED_PLANNED_LEAVE_KEYS = [
  "employee_marriage",
  "child_marriage",
  "child_circumcision",
  "hajj",
  "unpaid",
] as const;

export type SupportedPlannedLeaveKey = (typeof SUPPORTED_PLANNED_LEAVE_KEYS)[number];

export interface PlannedLeaveRequestInput {
  policyKey: SupportedPlannedLeaveKey;
  submittedOn: string;
  startOn: string;
  endOn: string;
  workingDays: number;
  hasEvidence: boolean;
  priorApprovedHajjCount?: number;
}

export interface PlannedLeaveRequestValidation {
  policyKey: SupportedPlannedLeaveKey;
  policyName: string;
  workingDays: number;
  noticeDays: number;
  minimumNoticeDays: number;
  evidenceRequirement: "none" | "required";
  hcHandling: "validate" | "approve";
  unpaid: boolean;
}

export class PlannedLeavePolicyError extends Error {
  constructor(
    readonly code:
      | "INVALID_DATE"
      | "END_BEFORE_START"
      | "INVALID_WORKING_DAYS"
      | "MINIMUM_NOTICE_NOT_MET"
      | "EVIDENCE_REQUIRED"
      | "DURATION_LIMIT_EXCEEDED"
      | "HAJJ_ALREADY_USED"
      | "UNSUPPORTED_POLICY_CONFIGURATION",
    message: string,
  ) {
    super(message);
    this.name = "PlannedLeavePolicyError";
  }
}

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PlannedLeavePolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new PlannedLeavePolicyError("INVALID_DATE", `Tanggal tidak valid: ${value}`);
  }
  return timestamp;
}

function daysBetween(from: string, to: string): number {
  return Math.floor((dateValue(to) - dateValue(from)) / 86_400_000);
}

function durationLimit(policyKey: SupportedPlannedLeaveKey): number | null {
  switch (policyKey) {
    case "employee_marriage":
      return 3;
    case "child_marriage":
    case "child_circumcision":
      return 2;
    default:
      return null;
  }
}

function minimumNoticeDays(policyKey: SupportedPlannedLeaveKey, workingDays: number): number {
  if (policyKey === "unpaid") return workingDays > 3 ? 30 : 7;
  return 7;
}

export function validatePlannedLeaveRequest(
  input: PlannedLeaveRequestInput,
): PlannedLeaveRequestValidation {
  if (!Number.isFinite(input.workingDays) || input.workingDays <= 0) {
    throw new PlannedLeavePolicyError(
      "INVALID_WORKING_DAYS",
      "Rentang cuti harus memiliki sedikitnya satu hari kerja.",
    );
  }
  if (daysBetween(input.startOn, input.endOn) < 0) {
    throw new PlannedLeavePolicyError(
      "END_BEFORE_START",
      "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    );
  }

  const policy = getLeavePolicy(input.policyKey as LeavePolicyKey);
  if (
    policy.requestMode !== "individual" ||
    policy.lineHandling !== "approval" ||
    !["validate", "approve"].includes(policy.hcHandling)
  ) {
    throw new PlannedLeavePolicyError(
      "UNSUPPORTED_POLICY_CONFIGURATION",
      "Konfigurasi jenis cuti ini tidak sesuai dengan alur planned line approval.",
    );
  }

  const noticeDays = daysBetween(input.submittedOn, input.startOn);
  const requiredNoticeDays = minimumNoticeDays(input.policyKey, input.workingDays);
  if (noticeDays < requiredNoticeDays) {
    throw new PlannedLeavePolicyError(
      "MINIMUM_NOTICE_NOT_MET",
      `${policy.name} harus diajukan minimal H-${requiredNoticeDays}.`,
    );
  }

  if (policy.evidenceRequirement === "required" && !input.hasEvidence) {
    throw new PlannedLeavePolicyError(
      "EVIDENCE_REQUIRED",
      `Dokumen pendukung wajib dilampirkan untuk ${policy.name}.`,
    );
  }

  const maxWorkingDays = durationLimit(input.policyKey);
  if (maxWorkingDays !== null && input.workingDays > maxWorkingDays) {
    throw new PlannedLeavePolicyError(
      "DURATION_LIMIT_EXCEEDED",
      `${policy.name} maksimal ${maxWorkingDays} hari kerja untuk satu hak dasar.`,
    );
  }

  if (input.policyKey === "hajj" && (input.priorApprovedHajjCount ?? 0) > 0) {
    throw new PlannedLeavePolicyError(
      "HAJJ_ALREADY_USED",
      "Hak Cuti Ibadah Haji Wajib hanya dapat digunakan satu kali selama bekerja di Yayasan.",
    );
  }

  return {
    policyKey: input.policyKey,
    policyName: policy.name,
    workingDays: input.workingDays,
    noticeDays,
    minimumNoticeDays: requiredNoticeDays,
    evidenceRequirement: policy.evidenceRequirement as "none" | "required",
    hcHandling: policy.hcHandling as "validate" | "approve",
    unpaid: input.policyKey === "unpaid",
  };
}
