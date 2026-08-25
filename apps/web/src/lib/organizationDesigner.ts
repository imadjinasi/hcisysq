import { AdminApiError } from "@/lib/adminEmployees";

export type OrganizationViewMode = "HISTORICAL" | "CURRENT" | "FUTURE" | "DRAFT";
export type OrganizationDraftStatus = "DRAFT" | "VALIDATED" | "PUBLISHED";
export type OrganizationVacancyPolicy =
  | "CLIMB_TO_PARENT"
  | "REQUIRE_ACTING_OR_BLOCK"
  | "BLOCK";

export interface OrganizationDraft {
  id: string;
  name: string;
  effectiveOn: string;
  status: OrganizationDraftStatus;
  validationReport: OrganizationValidationReport | null;
  createdAt: string;
  validatedAt: string | null;
  publishedAt: string | null;
  baseChangeSetId?: string | null;
}

export type OrganizationRevision = Omit<OrganizationDraft, "validationReport">;

export interface OrganizationIncumbent {
  assignmentId?: string;
  positionKey?: string;
  employeeId: string | null;
  accountId?: string | null;
  accountEmail?: string | null;
  accountStatus?: string | null;
  employeeNumber?: string;
  employeeName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignmentType?: "PRIMARY" | "ACTING";
  isPrimaryStructural?: boolean;
}

export interface OrganizationNode {
  id: string;
  stableKey: string;
  name: string;
  nodeType: string;
  parentNodeKey: string | null;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  visualRankOffset: number;
  integrationCode: string | null;
  memberCount: number;
  leaderPositionKey: string | null;
}

export interface OrganizationPosition {
  id: string;
  stableKey: string;
  nodeKey: string;
  title: string;
  parentPositionKey: string | null;
  singleIncumbent: boolean;
  vacancyPolicy: OrganizationVacancyPolicy;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  visualRankOffset: number;
  holderSource?: "EMPLOYEE" | "ACCOUNT";
  primaryIncumbent: OrganizationIncumbent | null;
  actingIncumbent: OrganizationIncumbent | null;
}

export interface OrganizationMembership {
  id?: string;
  nodeKey: string;
  employeeId: string;
  employeeName?: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isPrimary?: boolean;
}

export interface OrganizationAuthorityBinding {
  id: string;
  sourceType: "NODE" | "POSITION";
  sourceKey: string;
  authorityType:
    | "SUPERVISORY_PARENT"
    | "LEADER"
    | "UNIT_APPROVER"
    | "GOVERNANCE_APPROVER"
    | "OVERSIGHT_PARENT";
  targetPositionKey: string;
  vacancyPolicy: OrganizationVacancyPolicy;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface OrganizationReportingOverride {
  id: string;
  employeeId: string;
  managerPositionKey: string;
  reason: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface OrganizationDesignerView {
  viewDate: string;
  mode: OrganizationViewMode;
  draft: OrganizationDraft | null;
  isSameDayRevision?: boolean;
  nodes: OrganizationNode[];
  positions: OrganizationPosition[];
  memberships: OrganizationMembership[];
  assignments: OrganizationIncumbent[];
  bindings: OrganizationAuthorityBinding[];
  reportingOverrides: OrganizationReportingOverride[];
}

export interface OrganizationEmployeeOption {
  id: string;
  employeeNumber: string;
  fullName: string;
  unitName: string | null;
  positionName: string | null;
  status?: "active" | "inactive" | "resigned";
}

export interface OrganizationValidationIssue {
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
  itemKey?: string | null;
}

export interface OrganizationValidationReport {
  valid: boolean;
  issues: OrganizationValidationIssue[];
}

export interface OrganizationImpactPreview {
  structureChanges: {
    nodes: number;
    positions: number;
    memberships: number;
    incumbencies: number;
    authorityRelationships: number;
    reportingRelationships: number;
  };
  directManagerChanges: Array<Record<string, unknown>>;
  unitApproverChanges: Array<Record<string, unknown>>;
  authorityPathsAffected: Array<Record<string, unknown>>;
  vacantAuthorities: Array<Record<string, unknown>>;
  unresolvedEmployees: Array<Record<string, unknown>>;
  visualOnlyChanges: Array<Record<string, unknown>>;
  noApprovalRoutingImpact: boolean;
}

export interface OrganizationResolutionPreview {
  employee: {
    id: string;
    employeeNumber?: string;
    fullName: string;
  };
  effectiveDate: string;
  workflowKey: string;
  snapshot?: { id: string; status: "DRAFT" | "VALIDATED" | "PUBLISHED" };
  requiredCapability?: string | null;
  mode?: string;
  steps: Array<{
    authorityType?: string;
    employeeId: string;
    employeeName: string;
    positionTitle?: string | null;
    source?: string;
  }>;
  runtime?: {
    authorities: Array<Record<string, unknown>>;
    error: { code: string; message: string; details: Record<string, unknown> } | null;
  };
  structuralIntents?: Array<{
    authorityType: string;
    targetPositionKey: string | null;
    targetPositionTitle: string | null;
    targetNodeName: string | null;
    intendedIncumbentEmployeeId: string;
    intendedIncumbentEmployeeName: string;
    vacancyFallback: boolean;
    path: Array<{
      positionKey: string;
      positionTitle: string;
      nodeName: string;
      state: "OCCUPIED" | "VACANT";
      incumbentEmployeeId: string | null;
      incumbentEmployeeName: string | null;
      accountStatus: "ACTIVE" | "INVITED" | "MISSING" | "SUSPENDED" | "INACTIVE" | null;
    }>;
    readiness: {
      employeeId: string;
      employeeName: string;
      employeeActive: boolean;
      accountStatus: "ACTIVE" | "INVITED" | "MISSING" | "SUSPENDED" | "INACTIVE";
      capabilityStatus: "READY" | "MISSING" | "NOT_REQUIRED";
      runtimeVerdict: "READY" | "PENDING_USER_ACTIVATION" | "CONFIGURATION_BLOCKED" | "VACANT_FALLBACK" | "BUSINESS_DECISION_REQUIRED";
      runtimeEligible: boolean;
    };
  }>;
  structuralErrors?: Array<{
    authorityType: string;
    code: string;
    message: string;
    details: Record<string, unknown>;
  }>;
  oversight?: {
    employeeId: string;
    employeeName: string;
    positionTitle?: string | null;
  } | null;
  warnings: Array<{ code: string; message: string }>;
}

export interface OrganizationRolloutConfiguration {
  mode: "LEGACY" | "SHADOW" | "STRUCTURE";
  workflowKey?: string | null;
  organizationalNodeKey?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  reason?: string;
  updatedAt?: string;
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
    body?.message ?? "Permintaan Organization Designer tidak dapat diproses.",
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/organization/designer${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  return readJson<T>(response);
}

export function getOrganizationDesignerView(input: {
  effectiveDate: string;
  revisionId?: string | null;
}): Promise<OrganizationDesignerView> {
  const params = new URLSearchParams({ effectiveDate: input.effectiveDate });
  if (input.revisionId) params.set("draftId", input.revisionId);
  return request<OrganizationDesignerView>(`?${params.toString()}`);
}

export async function listOrganizationRevisions(): Promise<OrganizationRevision[]> {
  const result = await request<{ items: OrganizationRevision[] }>("/revisions");
  return result.items;
}

export async function listOrganizationEmployees(): Promise<OrganizationEmployeeOption[]> {
  const result = await request<
    OrganizationEmployeeOption[] | { items: OrganizationEmployeeOption[] }
  >("/employees");
  return Array.isArray(result) ? result : result.items;
}

export function createOrganizationDraft(input: {
  name: string;
  effectiveOn: string;
}): Promise<OrganizationDraft> {
  return request<OrganizationDraft>("/drafts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getOrganizationDraft(draftId: string): Promise<OrganizationDraft> {
  return request<OrganizationDraft>(`/drafts/${draftId}`);
}

export function createOrganizationNode(
  draftId: string,
  input: {
    name: string;
    nodeType: string;
    parentNodeKey: string | null;
    visualRankOffset?: number;
    integrationCode?: string | null;
  },
): Promise<OrganizationNode> {
  return request<OrganizationNode>(`/drafts/${draftId}/nodes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateOrganizationNode(
  draftId: string,
  nodeId: string,
  input: Partial<
    Pick<
      OrganizationNode,
      | "name"
      | "nodeType"
      | "parentNodeKey"
      | "active"
      | "visualRankOffset"
      | "integrationCode"
      | "leaderPositionKey"
    >
  >,
): Promise<OrganizationNode> {
  return request<OrganizationNode>(`/drafts/${draftId}/nodes/${nodeId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function organizationStatusCopy(
  mode: OrganizationDesignerView["mode"],
  changeSetStatus?: "DRAFT" | "VALIDATED" | "PUBLISHED",
) {
  if (changeSetStatus === "DRAFT")
    return { label: "Draft", className: "bg-amber-100 text-amber-900" };
  if (changeSetStatus === "VALIDATED")
    return { label: "Tervalidasi", className: "bg-blue-50 text-blue-800" };
  if (changeSetStatus === "PUBLISHED")
    return { label: "Diterbitkan · hanya baca", className: "bg-emerald-50 text-emerald-800" };
  if (mode === "HISTORICAL")
    return { label: "Historis", className: "bg-slate-100 text-slate-700" };
  if (mode === "FUTURE")
    return { label: "Terjadwal", className: "bg-blue-50 text-blue-800" };
  if (mode === "DRAFT")
    return { label: "Draft", className: "bg-amber-100 text-amber-900" };
  return { label: "Saat ini", className: "bg-emerald-50 text-emerald-800" };
}

export async function listFoundationBoardAccounts(): Promise<OrganizationAccountOption[]> {
  const result = await request<
    OrganizationAccountOption[] | { items: OrganizationAccountOption[] }
  >("/foundation-board-accounts");
  return Array.isArray(result) ? result : result.items;
}

export interface OrganizationAccountOption {
  id: string;
  email: string;
  principalType: "FOUNDATION_BOARD";
  status: "invited" | "active" | "suspended" | "inactive";
}

export function deleteOrganizationNode(draftId: string, nodeId: string): Promise<Record<string, number>> {
  return request<Record<string, number>>(`/drafts/${draftId}/nodes/${nodeId}`, { method: "DELETE" });
}

export function deleteOrganizationGroup(draftId: string, nodeId: string): Promise<void> {
  return request<void>(`/drafts/${draftId}/nodes/${nodeId}/group`, { method: "DELETE" });
}

export function deleteOrganizationPosition(draftId: string, positionId: string): Promise<void> {
  return request<void>(`/drafts/${draftId}/positions/${positionId}`, { method: "DELETE" });
}

export function createOrganizationPosition(
  draftId: string,
  input: {
    nodeKey: string;
    title: string;
    parentPositionKey: string | null;
    vacancyPolicy: OrganizationVacancyPolicy;
    singleIncumbent?: boolean;
    visualRankOffset?: number;
    holderSource?: "EMPLOYEE" | "ACCOUNT";
  },
): Promise<OrganizationPosition> {
  return request<OrganizationPosition>(`/drafts/${draftId}/positions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateOrganizationPosition(
  draftId: string,
  positionId: string,
  input: Partial<
    Pick<
      OrganizationPosition,
      | "nodeKey"
      | "title"
      | "parentPositionKey"
      | "vacancyPolicy"
      | "singleIncumbent"
      | "active"
      | "visualRankOffset"
      | "holderSource"
    >
  >,
): Promise<OrganizationPosition> {
  return request<OrganizationPosition>(`/drafts/${draftId}/positions/${positionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function replaceOrganizationMemberships(
  draftId: string,
  input: {
    nodeKey: string;
    memberships: Array<{ employeeId: string; isPrimary: boolean }>;
    confirmPrimarySwitchEmployeeIds?: string[];
    effectiveFrom: string;
    effectiveTo?: string | null;
  },
): Promise<void> {
  return request<void>(`/drafts/${draftId}/memberships`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function replaceOrganizationIncumbencies(
  draftId: string,
  input: {
    positionKey: string;
    holderSource?: "EMPLOYEE" | "ACCOUNT";
    primaryEmployeeId?: string | null;
    primaryAccountId?: string | null;
    actingEmployeeId?: string | null;
    actingFrom?: string | null;
    actingTo?: string | null;
    effectiveFrom: string;
    assignmentType?: "PRIMARY_STRUCTURAL" | "SECONDARY";
  },
): Promise<void> {
  return request<void>(`/drafts/${draftId}/incumbencies`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function createOrganizationAuthorityBinding(
  draftId: string,
  input: Omit<OrganizationAuthorityBinding, "id">,
): Promise<OrganizationAuthorityBinding> {
  return request<OrganizationAuthorityBinding>(`/drafts/${draftId}/authority-bindings`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createOrganizationReportingOverride(
  draftId: string,
  input: Omit<OrganizationReportingOverride, "id">,
): Promise<OrganizationReportingOverride> {
  return request<OrganizationReportingOverride>(`/drafts/${draftId}/reporting-overrides`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function validateOrganizationDraft(
  draftId: string,
): Promise<OrganizationValidationReport> {
  return request<OrganizationValidationReport>(`/drafts/${draftId}/validate`, {
    method: "POST",
  });
}

export function reopenOrganizationDraft(draftId: string): Promise<OrganizationDraft> {
  return request<OrganizationDraft>(`/drafts/${draftId}/reopen`, { method: "POST" });
}

export function getOrganizationImpact(
  draftId: string,
): Promise<OrganizationImpactPreview> {
  return request<OrganizationImpactPreview>(`/drafts/${draftId}/impact`);
}

export function previewOrganizationResolution(
  draftId: string,
  input: { employeeId: string; workflowKey: string; effectiveDate: string },
): Promise<OrganizationResolutionPreview> {
  return request<OrganizationResolutionPreview>(
    `/drafts/${draftId}/resolution-preview`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function publishOrganizationDraft(draftId: string): Promise<OrganizationDraft> {
  return request<OrganizationDraft>(`/drafts/${draftId}/publish`, { method: "POST" });
}

export function configureOrganizationLeader(
  draftId: string,
  input: {
    nodeKey: string;
    positionKey?: string | null;
    title?: string;
    holderSource: "EMPLOYEE" | "ACCOUNT";
    primaryEmployeeId?: string | null;
    primaryAccountId?: string | null;
    assignmentType: "PRIMARY_STRUCTURAL" | "SECONDARY";
    parentPositionKey?: string | null;
    effectiveFrom: string;
  },
): Promise<OrganizationPosition> {
  return request<OrganizationPosition>(`/drafts/${draftId}/leader`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function configureOrganizationApprovalReporting(
  draftId: string,
  input: {
    sourceType: "NODE" | "POSITION";
    sourceKey: string;
    leaderPositionKey?: string | null;
    reportsToPositionKey?: string | null;
    unitApproverPositionKey?: string | null;
    governanceApproverPositionKey?: string | null;
    oversightParentPositionKey?: string | null;
    effectiveFrom: string;
  },
): Promise<{ changedRelationships: string[] }> {
  return request<{ changedRelationships: string[] }>(
    `/drafts/${draftId}/approval-reporting`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function discardOrganizationDraft(draftId: string): Promise<void> {
  return request<void>(`/drafts/${draftId}`, { method: "DELETE" });
}

export async function getOrganizationRollout(): Promise<OrganizationRolloutConfiguration> {
  const response = await fetch("/api/admin/organization/rollout", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return readJson<OrganizationRolloutConfiguration>(response);
}

export async function updateOrganizationRollout(
  input: OrganizationRolloutConfiguration,
): Promise<OrganizationRolloutConfiguration> {
  const response = await fetch("/api/admin/organization/rollout", {
    method: "PATCH",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJson<OrganizationRolloutConfiguration>(response);
}
