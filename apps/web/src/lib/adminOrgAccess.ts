import { AdminApiError } from "@/lib/adminEmployees";

export interface OrganizationUnitSummary {
  id: string;
  name: string;
  employeeCount: number;
  activeCount: number;
}

export interface PositionSummary {
  id: string;
  name: string;
  employeeCount: number;
  activeCount: number;
}

export interface OrganizationAdminResponse {
  units: OrganizationUnitSummary[];
  positions: PositionSummary[];
}

export interface RoleAssignment {
  id: string;
  accountId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  scopeType: "own" | "unit" | "organization";
  organizationalUnitId: string | null;
  organizationalUnitName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  reason: string | null;
  createdAt: string;
}

export interface EmployeeDetailResponse {
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    status: "active" | "inactive" | "resigned";
    employmentStatus: string | null;
    unitId: string | null;
    unitName: string | null;
    positionId: string | null;
    positionName: string | null;
    email: string | null;
    phone: string | null;
    education: string | null;
    startedOn: string | null;
    endedOn: string | null;
    employmentType: string | null;
    functionalPosition: string | null;
    structuralPosition: string | null;
    removedAt: string | null;
    removalReason: string | null;
    accountId: string | null;
    accountEmail: string | null;
    accountStatus: "invited" | "active" | "suspended" | "inactive" | null;
  };
  assignments: RoleAssignment[];
}

export interface AccessRole {
  id: string;
  roleKey: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export interface AccessAccount {
  id: string;
  employeeId: string | null;
  email: string;
  principalType: "EMPLOYEE" | "FOUNDATION_BOARD" | "SUPER_ADMIN";
  status: "invited" | "active" | "suspended" | "inactive";
  employeeNumber: string | null;
  employeeName: string | null;
  employeeStatus: "active" | "inactive" | "resigned" | null;
  unitName: string | null;
  createdAt: string;
  assignments: RoleAssignment[];
}

export interface EmployeeSourceSnapshot { id: string; sourceFilename: string; sourceSheet: string; importedAt: string; unmodeledSourceData: Record<string, unknown>; }

export async function getEmployeeSourceSnapshots(employeeId: string): Promise<{ items: EmployeeSourceSnapshot[] }> {
  const response = await fetch(`/api/admin/employees/${employeeId}/source-snapshots`, { credentials: "include", headers: { Accept: "application/json" } });
  return readJson(response);
}

export async function previewEmployeeRemoval(employeeId: string): Promise<{ fullName: string; removedAt: string | null; accountId: string | null; accountStatus: string | null; dependencyCategories: Array<{ category: string; count: number }>; blocked: boolean }> {
  const response = await fetch(`/api/admin/employees/${employeeId}/remove-preview`, { method: "POST", credentials: "include", headers: { Accept: "application/json" } });
  return readJson(response);
}

export async function removeEmployeeFromMaster(employeeId: string, confirmationName: string, reason: string): Promise<{ removed: boolean }> {
  const response = await fetch(`/api/admin/employees/${employeeId}/remove`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ confirmationName, reason }) });
  return readJson(response);
}

export interface EmployeeAccessRow {
  id: string;
  employeeNumber: string;
  fullName: string;
  status: "active" | "inactive" | "resigned";
  email: string | null;
  unitName: string | null;
  positionName: string | null;
  accountId: string | null;
  accountStatus: "invited" | "active" | "suspended" | "inactive" | null;
}

export type BulkEmployeeAccessCategory =
  | "ALREADY_ACTIVE"
  | "INVITATION_REQUIRED"
  | "ACCOUNT_PREPARATION_REQUIRED"
  | "SAFE_REACTIVATION"
  | "SKIPPED_EMPLOYEE_NOT_ACTIVE"
  | "SUSPENDED_UNCHANGED"
  | "REQUIRES_REVIEW";

export interface BulkEmployeeAccessPreviewItem {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeStatus: EmployeeAccessRow["status"];
  accountId: string | null;
  accountStatus: EmployeeAccessRow["accountStatus"];
  category: BulkEmployeeAccessCategory;
  reasonCode: string | null;
  message: string;
}

export interface BulkEmployeeAccessPreview {
  items: BulkEmployeeAccessPreviewItem[];
  summary: {
    selected: number;
    alreadyActive: number;
    invitationRequired: number;
    accountPreparationRequired: number;
    safeReactivation: number;
    skippedInactiveOrResigned: number;
    suspendedUnchanged: number;
    requiresReview: number;
  };
}

export type BulkEmployeeAccessAction =
  | "ALREADY_ACTIVE"
  | "INVITATION_ISSUED"
  | "ACCOUNT_PREPARED_AND_INVITATION_ISSUED"
  | "ACCOUNT_REACTIVATED"
  | "SKIPPED_EMPLOYEE_NOT_ACTIVE"
  | "SUSPENDED_UNCHANGED"
  | "REQUIRES_REVIEW"
  | "FAILED";

export interface BulkEmployeeAccessResult {
  bulkOperationId: string;
  items: Array<BulkEmployeeAccessPreviewItem & {
    action: BulkEmployeeAccessAction;
    resultingAccountStatus: EmployeeAccessRow["accountStatus"];
    activationPath?: string;
    activationExpiresAt?: string;
  }>;
  summary: {
    selected: number;
    alreadyActive: number;
    accountsPrepared: number;
    activationInvitationsIssuedOrReissued: number;
    accountsSafelyReactivated: number;
    skippedInactiveOrResigned: number;
    suspendedUnchanged: number;
    requiresReview: number;
    failed: number;
  };
}

export interface AccessAdminResponse {
  accounts: AccessAccount[];
  employees: EmployeeAccessRow[];
  roles: AccessRole[];
  units: Array<{ id: string; name: string }>;
  summary: {
    accounts: number;
    active: number;
    invited: number;
    unaccountedActiveEmployees: number;
  };
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const body = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;
  throw new AdminApiError(
    response.status,
    body?.code ?? "REQUEST_FAILED",
    body?.message ?? "Permintaan tidak dapat diproses.",
  );
}

export async function getOrganizationAdmin(): Promise<OrganizationAdminResponse> {
  const response = await fetch("/api/admin/organization", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson<OrganizationAdminResponse>(response);
}

export async function getEmployeeDetail(employeeId: string): Promise<EmployeeDetailResponse> {
  const response = await fetch(`/api/admin/employees/${employeeId}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson<EmployeeDetailResponse>(response);
}


export async function getAccessAdmin(): Promise<AccessAdminResponse> {
  const response = await fetch("/api/admin/access", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson<AccessAdminResponse>(response);
}

export async function prepareEmployeeAccount(input: {
  employeeId: string;
  email?: string;
}): Promise<{
  id: string;
  employeeId: string;
  email: string;
  principalType: "EMPLOYEE";
  status: "invited";
}> {
  const response = await fetch("/api/admin/access/employee-accounts", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export async function updateEmployeeMaster(employeeId: string, input: Record<string, unknown>): Promise<{ employeeId: string }> {
  const response = await fetch(`/api/admin/employees/${employeeId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(input) });
  return readJson(response);
}

export async function previewBulkEmployeeAccess(
  employeeIds: string[],
): Promise<BulkEmployeeAccessPreview> {
  const response = await fetch("/api/admin/access/employee-accounts/bulk-preview", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ employeeIds }),
  });
  return readJson(response);
}

export async function prepareBulkEmployeeAccess(
  employeeIds: string[],
): Promise<BulkEmployeeAccessResult> {
  const response = await fetch("/api/admin/access/employee-accounts/bulk-prepare", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ employeeIds }),
  });
  return readJson(response);
}

export async function updateAccountStatus(
  accountId: string,
  status: "invited" | "active" | "suspended" | "inactive",
): Promise<{ id: string; status: string }> {
  const response = await fetch(`/api/admin/access/accounts/${accountId}/status`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ status }),
  });
  return readJson(response);
}

export async function createRoleAssignment(
  accountId: string,
  input: {
    roleId: string;
    scopeType: "own" | "unit" | "organization";
    organizationalUnitId?: string | null;
    startsOn?: string | null;
    endsOn?: string | null;
    reason?: string | null;
  },
): Promise<{ id: string }> {
  const response = await fetch(`/api/admin/access/accounts/${accountId}/role-assignments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  return readJson(response);
}

export async function removeRoleAssignment(assignmentId: string): Promise<void> {
  const response = await fetch(`/api/admin/access/role-assignments/${assignmentId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  await readJson<void>(response);
}
