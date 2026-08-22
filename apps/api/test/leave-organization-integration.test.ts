import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { RolloutAuthorityResult } from "../src/modules/organization/index.js";
import {
  enqueueFinalApprovalOversight,
  snapshotLeaveRolloutAuthorities,
} from "../src/modules/leave/organization-authority.js";

function authority(
  employeeId: string,
  source: "DIRECT_MANAGER" | "UNIT_APPROVER" | "GOVERNANCE_APPROVER",
) {
  return {
    employeeId,
    source,
    path: [`position:${source.toLowerCase()}`],
    incumbentKind: "PRIMARY" as const,
    positionKey: `${source.toLowerCase()}-position`,
  };
}

describe("ORG-004 Leave rollout consumer", () => {
  it("keeps LEGACY authorities authoritative by safe default", () => {
    const result: RolloutAuthorityResult = {
      mode: "LEGACY",
      authoritativeSource: "LEGACY",
      authorities: [authority("manager", "DIRECT_MANAGER"), authority("unit", "UNIT_APPROVER")],
    };

    const snapshot = snapshotLeaveRolloutAuthorities(result, {
      requesterEmployeeId: "employee",
      policyChain: "LINE_AND_UNIT",
    });

    expect(snapshot.context).toMatchObject({
      mode: "LEGACY",
      authoritativeSource: "LEGACY",
    });
    expect(snapshot.approvalChain.map((step) => step.employeeId)).toEqual(["manager", "unit"]);
  });

  it("records SHADOW mismatch diagnostics while preserving the legacy chain", () => {
    const result: RolloutAuthorityResult = {
      mode: "SHADOW",
      authoritativeSource: "LEGACY",
      authorities: [authority("legacy-manager", "DIRECT_MANAGER"), authority("legacy-unit", "UNIT_APPROVER")],
      shadow: {
        matches: false,
        mismatchReasons: ["DIRECT_MANAGER_MISMATCH"],
        structural: {
          effectiveDate: "2026-08-22",
          changeSetId: "published-structure",
          governanceApplied: false,
          authorities: [
            authority("structural-manager", "DIRECT_MANAGER"),
            authority("legacy-unit", "UNIT_APPROVER"),
          ],
        },
      },
    };

    const snapshot = snapshotLeaveRolloutAuthorities(result, {
      requesterEmployeeId: "employee",
      policyChain: "LINE_AND_UNIT",
    });

    expect(snapshot.approvalChain.map((step) => step.employeeId)).toEqual([
      "legacy-manager",
      "legacy-unit",
    ]);
    expect(snapshot.context.shadow).toMatchObject({
      matches: false,
      mismatchReasons: ["DIRECT_MANAGER_MISMATCH"],
    });
  });

  it("uses a data-driven governance authority as the complete STRUCTURE chain", () => {
    const result: RolloutAuthorityResult = {
      mode: "STRUCTURE",
      authoritativeSource: "STRUCTURE",
      authorities: [authority("secretary-incumbent", "GOVERNANCE_APPROVER")],
    };

    const snapshot = snapshotLeaveRolloutAuthorities(result, {
      requesterEmployeeId: "director-incumbent",
      policyChain: "LINE_AND_UNIT",
    });

    expect(snapshot.approvalChain).toEqual([
      {
        employeeId: "secretary-incumbent",
        sources: ["GOVERNANCE_APPROVER"],
      },
    ]);
  });

  it("fails closed when STRUCTURE mode has no required authority", () => {
    const result: RolloutAuthorityResult = {
      mode: "STRUCTURE",
      authoritativeSource: "STRUCTURE",
      authorities: [],
    };

    expect(() =>
      snapshotLeaveRolloutAuthorities(result, {
        requesterEmployeeId: "employee",
        policyChain: "LINE_AND_UNIT",
      }),
    ).toThrowError(expect.objectContaining({ code: "DIRECT_MANAGER_MISSING" }));
  });

  it("keeps Unpaid Leave on Unit Approver before HC actual approval", () => {
    const result: RolloutAuthorityResult = {
      mode: "STRUCTURE",
      authoritativeSource: "STRUCTURE",
      authorities: [authority("manager", "DIRECT_MANAGER"), authority("unit", "UNIT_APPROVER")],
    };

    const snapshot = snapshotLeaveRolloutAuthorities(result, {
      requesterEmployeeId: "employee",
      policyChain: "UNIT_ONLY",
    });

    expect(snapshot.approvalChain).toEqual([
      { employeeId: "unit", sources: ["UNIT_APPROVER"] },
    ]);
  });

  it("bases planned/unpaid final oversight on the snapshotted line approver, not HC", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void values;
      if (sql.includes("FROM leave_request_approval_steps")) {
        return { rows: [{ employeeId: "final-line-approver" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const resolveOversightAbove = vi.fn(async () => ({
      ...authority("chair-incumbent", "GOVERNANCE_APPROVER"),
      source: "OVERSIGHT_PARENT" as const,
    }));

    await enqueueFinalApprovalOversight(
      { query } as unknown as PoolClient,
      {
        requestId: "leave-request",
        workflowKey: "leave.unpaid",
        effectiveDate: "2026-08-22",
      },
      { resolver: { resolveOversightAbove } },
    );

    expect(resolveOversightAbove).toHaveBeenCalledWith(
      expect.objectContaining({ approverEmployeeId: "final-line-approver" }),
    );
    const outboxInsert = query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO leave_notification_outbox"),
    );
    expect(outboxInsert?.[1]?.[2]).toBe("chair-incumbent");
    expect(String(outboxInsert?.[0])).toContain("WHERE NOT EXISTS");
  });

  it("isolates oversight resolution failure from the final approval transaction", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const resolveOversightAbove = vi.fn(async () => {
      throw new Error("notification resolver unavailable");
    });

    await expect(
      enqueueFinalApprovalOversight(
        { query } as unknown as PoolClient,
        {
          requestId: "leave-request",
          workflowKey: "leave.annual",
          effectiveDate: "2026-08-22",
          finalApproverEmployeeId: "unit-approver",
        },
        { resolver: { resolveOversightAbove } },
      ),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith("ROLLBACK TO SAVEPOINT leave_oversight_notification");
  });
});
