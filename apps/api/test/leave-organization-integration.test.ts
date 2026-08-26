import { readFileSync } from "node:fs";
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
  it("keeps the admin preview on the same rollout-aware service as submission", () => {
    const source = readFileSync(
      new URL("../src/modules/leave/admin-routes.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("resolveLeaveAuthorities(pool");
    expect(source).toContain('workflowKey: "leave.annual"');
    expect(source).not.toContain("resolveLeaveLineApprovalChain");
  });

  it("uses a data-driven Organization authority as the complete approval chain", () => {
    const result: RolloutAuthorityResult = {
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

  it("snapshots concrete Organization authorities without a legacy fallback", () => {
    const result: RolloutAuthorityResult = {
      authoritativeSource: "STRUCTURE",
      authorities: [authority("structural-manager", "DIRECT_MANAGER"), authority("structural-unit", "UNIT_APPROVER")],
    };

    const snapshot = snapshotLeaveRolloutAuthorities(result, {
      requesterEmployeeId: "employee",
      policyChain: "LINE_AND_UNIT",
    });

    expect(snapshot.approvalChain).toEqual([
      { employeeId: "structural-manager", sources: ["DIRECT_MANAGER"] },
      { employeeId: "structural-unit", sources: ["UNIT_APPROVER"] },
    ]);
  });

  it("fails closed when the published structure has no required authority", () => {
    const result: RolloutAuthorityResult = {
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

  it("does not create structural oversight for a historic request without Organization authority snapshot", async () => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes("FROM leave_requests")) {
          return { rows: [{ source: null, mode: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });
      const resolveOversightAbove = vi.fn();

      await enqueueFinalApprovalOversight(
        { query } as unknown as PoolClient,
        {
          requestId: "leave-request",
          workflowKey: "leave.annual",
          effectiveDate: "2026-08-22",
          finalApproverEmployeeId: "legacy-approver",
        },
        { resolver: { resolveOversightAbove } },
      );

      expect(resolveOversightAbove).not.toHaveBeenCalled();
      expect(query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO leave_notification_outbox"),
      )).toBe(false);
  });

  it("bases planned/unpaid final oversight on the snapshotted line approver, not HC", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void values;
      if (sql.includes("FROM leave_requests")) {
        return { rows: [{ source: "STRUCTURE", mode: null }], rowCount: 1 };
      }
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

  it("keeps snapshotted Organization authority authoritative for an in-flight request", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM leave_requests")) {
        return { rows: [{ source: "STRUCTURE", mode: null }], rowCount: 1 };
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
        requestId: "in-flight-structure-request",
        workflowKey: "leave.annual",
        effectiveDate: "2026-08-22",
        finalApproverEmployeeId: "secretary-incumbent",
      },
      { resolver: { resolveOversightAbove } },
    );

    expect(resolveOversightAbove).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) =>
      String(sql).includes("organization_rollout_settings"),
    )).toBe(false);
    expect(query.mock.calls.some(([sql]) =>
      String(sql).includes("INSERT INTO leave_notification_outbox"),
    )).toBe(true);
  });

  it("isolates oversight resolution failure from the final approval transaction", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("FROM leave_requests")
      ? { rows: [{ source: "STRUCTURE", mode: null }], rowCount: 1 }
      : { rows: [], rowCount: 1 });
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
