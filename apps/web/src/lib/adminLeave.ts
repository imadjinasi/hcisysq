import { AdminApiError } from "@/lib/adminEmployees";

export type LeaveEntitlementGroup = "education" | "non_education";

export interface LeavePolicySummary {
  key: string;
  name: string;
  requestMode: "individual" | "organization_event" | "dispensation";
  lineHandling: "approval" | "notify" | "none";
  hcHandling: "notify" | "validate" | "approve" | "none";
  entitlementGroup: LeaveEntitlementGroup | "all";
  minimumNoticeDays: number | null;
  evidenceRequirement: "none" | "required" | "required_deferred_allowed" | "conditional";
  emergencyNoticeAllowed: boolean;
  annualEntitlementDays?: number;
  eligibilityMonths?: number;
  periodLimitDays?: number;
  carryForwardEnabled?: boolean;
  notes: string[];
}

export interface LeaveEmployeeConfiguration {
  id: string;
  fullName: string;
  employeeNumber: string;
  status: "active" | "inactive" | "resigned";
  unitId: string | null;
  unitName: string | null;
  positionName: string | null;
  leaveEntitlementGroup: LeaveEntitlementGroup | null;
}

export interface LeaveConfigurationResponse {
  policies: LeavePolicySummary[];
  employees: LeaveEmployeeConfiguration[];
  summary: {
    activeEmployees: number;
    entitlementGroupConfigured: number;
  };
  approvalSource: "organization_structure";
}

export type LeaveApprovalSource =
  | "DIRECT_MANAGER"
  | "UNIT_APPROVER"
  | "GOVERNANCE_APPROVER";

export interface LeaveApprovalPreviewResponse {
  employee: LeaveEmployeeConfiguration & {
    startedOn: string | null;
  };
  referenceDate: string;
  approvalChain: Array<{
    employeeId: string;
    sources: LeaveApprovalSource[];
  }>;
  approvalSource: "organization_structure";
  annualLeave: null | {
    annualEntitlementDays: number;
    eligibilityMonths: number;
    eligibleFrom: string;
    eligible: boolean;
    referenceDate: string;
    year: number;
    availableNowDays: number;
    currentPeriodKey: "JAN_MAR" | "APR_JUN" | "JUL_SEP" | "OCT_DEC";
    currentPeriodLimitDays: number;
    eligiblePeriodAllocationDaysInYear: number;
    carryForwardEnabled: false;
    periods: Array<{
      key: "JAN_MAR" | "APR_JUN" | "JUL_SEP" | "OCT_DEC";
      label: string;
      allocationDays: number;
      usedDays: number;
      remainingDays: number;
      usableFrom: string | null;
      status: "not_eligible" | "upcoming" | "current" | "closed";
    }>;
  };
  warnings: Array<{ code: string; message: string }>;
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  const body = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;
  throw new AdminApiError(
    response.status,
    body?.code ?? "REQUEST_FAILED",
    body?.message ?? "Permintaan tidak dapat diproses.",
  );
}

export async function getLeaveConfiguration(): Promise<LeaveConfigurationResponse> {
  const response = await fetch("/api/admin/leave/configuration", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson(response);
}

export async function updateLeaveEntitlementGroup(
  employeeId: string,
  group: LeaveEntitlementGroup | null,
): Promise<{ employeeId: string; leaveEntitlementGroup: LeaveEntitlementGroup | null }> {
  const response = await fetch(
    `/api/admin/leave/employees/${employeeId}/entitlement-group`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ group }),
    },
  );
  return readJson(response);
}

export async function getLeaveApprovalPreview(
  employeeId: string,
  date?: string,
): Promise<LeaveApprovalPreviewResponse> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  const suffix = params.size ? `?${params.toString()}` : "";
  const response = await fetch(`/api/admin/leave/employees/${employeeId}/preview${suffix}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson(response);
}
