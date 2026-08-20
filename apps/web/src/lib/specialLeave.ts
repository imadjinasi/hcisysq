export type SupportedSpecialLeaveKey =
  | "maternity"
  | "miscarriage"
  | "menstruation_rest"
  | "sick"
  | "spouse_childbirth"
  | "spouse_miscarriage"
  | "family_bereavement";

export interface SpecialLeavePolicy {
  key: SupportedSpecialLeaveKey;
  name: string;
  requestMode: "individual";
  lineHandling: "notify";
  hcHandling: "validate" | "notify";
  minimumNoticeDays: number | null;
  evidenceRequirement: "none" | "required" | "required_deferred_allowed" | "conditional";
  emergencyNoticeAllowed: boolean;
  notes: string[];
}

export interface SpecialLeaveEvidenceInput {
  fileName: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
  contentBase64: string;
}

export interface SpecialLeaveSummary {
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    unitName: string | null;
    positionName: string | null;
  };
  hasHumanCapitalRole: boolean;
  policies: SpecialLeavePolicy[];
  requests: Array<{
    id: string;
    policyKey: SupportedSpecialLeaveKey;
    policyName: string;
    status: "in_review" | "approved" | "rejected" | "cancelled";
    startOn: string;
    endOn: string;
    workingDays: number;
    reason: string | null;
    submittedAt: string;
    finalDecidedAt: string | null;
    hcTaskStatus:
      | "waiting"
      | "pending"
      | "needs_correction"
      | "validated"
      | "approved"
      | "rejected"
      | null;
    hcTaskNote: string | null;
    evidenceCount: number;
  }>;
}

export interface SpecialLeavePreview {
  policy: SpecialLeavePolicy;
  workingDays: number;
  workingDates: string[];
  nonWorkingDates: string[];
  evidencePending: boolean;
  managerNotification: { employeeId: string; name: string | null } | null;
  warnings: Array<{ code: string; message: string }>;
  flow: string[];
}

export interface HcLeaveQueue {
  actor: {
    id: string;
    fullName: string;
    employeeNumber: string;
    unitName: string | null;
    positionName: string | null;
  };
  items: Array<{
    taskId: string;
    taskStatus: "pending" | "needs_correction";
    requestId: string;
    requesterEmployeeId: string;
    requesterName: string;
    employeeNumber: string;
    unitName: string | null;
    positionName: string | null;
    policyKey: SupportedSpecialLeaveKey;
    policyName: string;
    startOn: string;
    endOn: string;
    workingDays: number;
    reason: string | null;
    evidenceRequirement: "none" | "required" | "required_deferred_allowed" | "conditional";
    submittedAt: string;
    taskNote: string | null;
    evidence: Array<{
      id: string;
      fileName: string;
      contentType: string;
      byteSize: number;
      createdAt: string;
    }>;
  }>;
}

export class SpecialLeaveApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SpecialLeaveApiError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;
  throw new SpecialLeaveApiError(
    response.status,
    body?.code ?? "REQUEST_FAILED",
    body?.message ?? "Permintaan tidak dapat diproses.",
  );
}

export async function getSpecialLeaveSummary(): Promise<SpecialLeaveSummary> {
  const response = await fetch("/api/leave/special/me/summary", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson(response);
}

export async function previewSpecialLeave(input: {
  policyKey: SupportedSpecialLeaveKey;
  startOn: string;
  endOn: string;
  hasEvidence: boolean;
}): Promise<SpecialLeavePreview> {
  const response = await fetch("/api/leave/special/me/preview", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export async function submitSpecialLeave(input: {
  policyKey: SupportedSpecialLeaveKey;
  startOn: string;
  endOn: string;
  reason: string | null;
  idempotencyKey: string;
  evidence: SpecialLeaveEvidenceInput | null;
}): Promise<{
  id: string;
  status: string;
  policyKey: SupportedSpecialLeaveKey;
  workingDays: number;
  evidencePending: boolean;
  hcHandling: "validate" | "notify";
}> {
  const response = await fetch("/api/leave/special/me/submit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export async function uploadSpecialLeaveEvidence(
  requestId: string,
  evidence: SpecialLeaveEvidenceInput,
): Promise<{ id: string; fileName: string; contentType: string; byteSize: number }> {
  const response = await fetch(`/api/leave/special/me/requests/${requestId}/evidence`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(evidence),
  });
  return readJson(response);
}

export async function getHcLeaveValidationQueue(): Promise<HcLeaveQueue> {
  const response = await fetch("/api/leave/hc/validation-queue", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson(response);
}

export async function decideHcLeaveValidation(
  taskId: string,
  input: { action: "validate" | "request_correction"; note: string | null },
): Promise<{ requestId: string; requestStatus: string; taskStatus: string }> {
  const response = await fetch(`/api/leave/hc/tasks/${taskId}/decision`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export function hcEvidenceDownloadHref(requestId: string, evidenceId: string) {
  return `/api/leave/hc/requests/${requestId}/evidence/${evidenceId}`;
}
