import { describe, expect, it } from "vitest";

import {
  applyGuidedApprovalReporting,
  GuidedApprovalReportingError,
} from "../src/modules/organization/approval-reporting.js";
import type { OrganizationSnapshot } from "../src/modules/organization/domain.js";

const nodeKey = "00000000-0000-4000-8000-000000000010";
const leaderKey = "00000000-0000-4000-8000-000000000020";
const parentKey = "00000000-0000-4000-8000-000000000021";
const approverKey = "00000000-0000-4000-8000-000000000022";

function snapshot(): OrganizationSnapshot {
  return {
    changeSet: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Synthetic ORG-005 draft",
      effectiveOn: "2027-01-01",
      status: "DRAFT",
      baseChangeSetId: null,
      validationReport: {},
      createdByAccountId: "00000000-0000-4000-8000-000000000002",
      createdAt: "2026-08-25T00:00:00.000Z",
      validatedAt: null,
      publishedAt: null,
    },
    nodes: [{
      id: "00000000-0000-4000-8000-000000000011",
      stableKey: nodeKey,
      name: "Unit Sintetis",
      nodeType: "UNIT",
      parentNodeKey: null,
      active: true,
      effectiveFrom: "2027-01-01",
      effectiveTo: null,
      visualRankOffset: 0,
      integrationCode: null,
    }],
    positions: [leaderKey, parentKey, approverKey].map((stableKey, index) => ({
      id: `00000000-0000-4000-8000-00000000003${index}`,
      stableKey,
      nodeKey,
      title: index === 0 ? "Kepala" : `Posisi ${index}`,
      parentPositionKey: null,
      singleIncumbent: true,
      vacancyPolicy: index === 2 ? "BLOCK" as const : "CLIMB_TO_PARENT" as const,
      active: true,
      effectiveFrom: "2027-01-01",
      effectiveTo: null,
      visualRankOffset: 0,
      holderSource: "EMPLOYEE" as const,
    })),
    jobProfiles: [], memberships: [], incumbencies: [], authorityBindings: [], reportingOverrides: [],
  };
}

describe("guided Approval & Reporting mutation", () => {
  it("atomically writes only explicit node relationships and uses target vacancy configuration", () => {
    const draft = snapshot();
    const result = applyGuidedApprovalReporting(draft, {
      sourceType: "NODE",
      sourceKey: nodeKey,
      leaderPositionKey: leaderKey,
      reportsToPositionKey: parentKey,
      unitApproverPositionKey: approverKey,
      effectiveFrom: "2027-01-01",
    });

    expect(result.changedRelationships).toEqual([
      "LEADER", "UNIT_APPROVER", "SUPERVISORY_PARENT",
    ]);
    expect(draft.positions.find((item) => item.stableKey === leaderKey)?.parentPositionKey).toBe(parentKey);
    expect(draft.authorityBindings.find((item) => item.bindingType === "UNIT_APPROVER")).toMatchObject({
      targetPositionKey: approverKey,
      vacancyPolicy: "BLOCK",
    });
    expect(draft.authorityBindings.some((item) => item.bindingType === "GOVERNANCE_APPROVER")).toBe(false);
  });

  it("supports explicit governance and oversight relationships without title inference", () => {
    const draft = snapshot();
    applyGuidedApprovalReporting(draft, {
      sourceType: "POSITION",
      sourceKey: leaderKey,
      governanceApproverPositionKey: approverKey,
      oversightParentPositionKey: parentKey,
      effectiveFrom: "2027-01-01",
    });

    expect(draft.authorityBindings.map((item) => item.bindingType).sort()).toEqual([
      "GOVERNANCE_APPROVER", "OVERSIGHT_PARENT",
    ]);
  });

  it("rejects self-reference and a leader position from another structure", () => {
    const draft = snapshot();
    draft.positions[0]!.nodeKey = "00000000-0000-4000-8000-000000000099";
    expect(() => applyGuidedApprovalReporting(draft, {
      sourceType: "NODE",
      sourceKey: nodeKey,
      leaderPositionKey: leaderKey,
      effectiveFrom: "2027-01-01",
    })).toThrowError(GuidedApprovalReportingError);

    const validDraft = snapshot();
    expect(() => applyGuidedApprovalReporting(validDraft, {
      sourceType: "POSITION",
      sourceKey: leaderKey,
      reportsToPositionKey: leaderKey,
      effectiveFrom: "2027-01-01",
    })).toThrowError(/cannot report or approve to itself/i);
  });
});
