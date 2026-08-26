import { describe, expect, it, vi } from "vitest";

import {
  OrganizationAuthorityReadinessPreviewService,
  type AuthorityEligibilityResult,
  type OrganizationSnapshot,
} from "../src/modules/organization/index.js";

const date = "2026-08-25";

function snapshot(memberships = true): OrganizationSnapshot {
  return {
    changeSet: {
      id: "selected-draft-x",
      name: "Selected synthetic successor",
      effectiveOn: date,
      status: "VALIDATED",
      baseChangeSetId: "published-base",
      validationReport: { valid: true, issues: [] },
      createdByAccountId: "admin",
      createdAt: "2026-08-25T00:00:00.000Z",
      validatedAt: "2026-08-25T01:00:00.000Z",
      publishedAt: null,
    },
    nodes: [
      { id: "root-row", stableKey: "root", name: "Direksi", nodeType: "ROOT", parentNodeKey: null, active: true, effectiveFrom: date, effectiveTo: null, visualRankOffset: 0, integrationCode: null },
      { id: "team-row", stableKey: "team", name: "HCM", nodeType: "TEAM", parentNodeKey: "root", active: true, effectiveFrom: date, effectiveTo: null, visualRankOffset: 0, integrationCode: null },
    ],
    jobProfiles: [],
    positions: [
      { id: "director-row", stableKey: "director", nodeKey: "root", title: "Direktur", parentPositionKey: null, singleIncumbent: true, vacancyPolicy: "CLIMB_TO_PARENT", active: true, visualRankOffset: 0, effectiveFrom: date, effectiveTo: null },
      { id: "ops-row", stableKey: "ops", nodeKey: "root", title: "Kepala Bidang Operasional", parentPositionKey: "director", singleIncumbent: true, vacancyPolicy: "CLIMB_TO_PARENT", active: true, visualRankOffset: 0, effectiveFrom: date, effectiveTo: null },
      { id: "hcm-row", stableKey: "hcm", nodeKey: "team", title: "Kepala HCM", parentPositionKey: "ops", singleIncumbent: true, vacancyPolicy: "CLIMB_TO_PARENT", active: true, visualRankOffset: 0, effectiveFrom: date, effectiveTo: null },
    ],
    memberships: memberships ? [{ id: "requester-membership", employeeId: "requester", nodeKey: "team", jobProfileKey: null, isPrimary: true, effectiveFrom: date, effectiveTo: null }] : [],
    incumbencies: [
      { id: "requester-incumbency", positionKey: "hcm", employeeId: "requester", kind: "PRIMARY", isPrimaryStructural: true, reason: null, effectiveFrom: date, effectiveTo: null },
      { id: "director-incumbency", positionKey: "director", employeeId: "director-employee", kind: "PRIMARY", isPrimaryStructural: true, reason: null, effectiveFrom: date, effectiveTo: null },
    ],
    authorityBindings: [
      { id: "leader", subjectKind: "NODE", subjectKey: "team", bindingType: "LEADER", targetPositionKey: "hcm", vacancyPolicy: "CLIMB_TO_PARENT", effectiveFrom: date, effectiveTo: null },
      { id: "unit", subjectKind: "NODE", subjectKey: "team", bindingType: "UNIT_APPROVER", targetPositionKey: "ops", vacancyPolicy: "CLIMB_TO_PARENT", effectiveFrom: date, effectiveTo: null },
    ],
    reportingOverrides: [],
  };
}

describe("admin-only authority readiness preview", () => {
  it("uses the explicitly selected validated snapshot and separates invited readiness", async () => {
    const validateActionability = vi.fn(async (employeeId: string): Promise<AuthorityEligibilityResult> =>
      employeeId === "director-employee"
        ? { eligible: false, reason: "ACCOUNT_NOT_ACTIVE" }
        : { eligible: true, reason: null });
    const describeAuthorityReadiness = vi.fn(async () => [
      { employeeId: "requester", employeeName: "Requester", employeeActive: true, accountStatus: "ACTIVE" as const, capabilityStatus: "NOT_REQUIRED" as const },
      { employeeId: "director-employee", employeeName: "Synthetic Director", employeeActive: true, accountStatus: "INVITED" as const, capabilityStatus: "NOT_REQUIRED" as const },
    ]);
    const service = new OrganizationAuthorityReadinessPreviewService(
      { validate: async () => ({ eligible: true, reason: null }) },
      { describeAuthorityReadiness },
      {
        validateEmployeeAuthority: validateActionability,
        validateAccountAuthority: async () => ({ eligible: true, reason: null }),
      },
    );

    const result = await service.preview(snapshot(), {
      requesterEmployeeId: "requester",
      effectiveDate: date,
      workflowKey: "leave.annual",
    });

    expect(result.snapshot).toEqual({ id: "selected-draft-x", status: "VALIDATED" });
    expect(result.requiredCapability).toBeNull();
    expect(describeAuthorityReadiness).toHaveBeenCalledWith(
      expect.any(Array), date,
    );
    expect(result.structuralIntents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        authorityType: "DIRECT_MANAGER",
        targetPositionKey: "ops",
        vacancyFallback: true,
        intendedIncumbentEmployeeName: "Synthetic Director",
        readiness: expect.objectContaining({
          accountStatus: "INVITED",
          capabilityStatus: "NOT_REQUIRED",
          runtimeVerdict: "PENDING_USER_ACTIVATION",
          runtimeEligible: false,
        }),
      }),
      expect.objectContaining({ authorityType: "UNIT_APPROVER" }),
    ]));
    expect(result.runtime.authorities).toEqual([]);
    expect(result.runtime.error).toMatchObject({
      code: "AUTHORITY_ACCOUNT_NOT_ACTIVE",
      details: { reason: "ACCOUNT_NOT_ACTIVE", employeeId: "director-employee" },
    });
  });

  it("keeps a missing primary membership visible as configuration, not account, failure", async () => {
    const service = new OrganizationAuthorityReadinessPreviewService(
      { validate: async () => ({ eligible: true, reason: null }) },
      { describeAuthorityReadiness: async () => [
        { employeeId: "director-employee", employeeName: "Synthetic Director", employeeActive: true, accountStatus: "ACTIVE", capabilityStatus: "NOT_REQUIRED" },
      ] },
    );

    const result = await service.preview(snapshot(false), {
      requesterEmployeeId: "requester",
      effectiveDate: date,
      workflowKey: "leave.annual",
    });

    expect(result.structuralIntents).toEqual([
      expect.objectContaining({ authorityType: "DIRECT_MANAGER" }),
    ]);
    expect(result.structuralErrors).toContainEqual(expect.objectContaining({
      authorityType: "UNIT_APPROVER",
      code: "MEMBERSHIP_NOT_CONFIGURED",
    }));
  });
});
