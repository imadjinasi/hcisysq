import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerEmployeeLeaveRoutes } from "../src/modules/leave/employee-routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://leave-auth-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

const E = "00000000-0000-4000-8000-000000000010";
const M = "00000000-0000-4000-8000-000000000020";
const U = "00000000-0000-4000-8000-000000000030";
const X = "00000000-0000-4000-8000-000000000040";
const REQUEST = "00000000-0000-4000-8000-000000000100";
const DM_STEP = "00000000-0000-4000-8000-000000000110";
const UNIT_STEP = "00000000-0000-4000-8000-000000000120";

function createDecisionPool(input: {
  actorEmployeeId: string;
  requestedStepId: string;
  stepApproverEmployeeId: string;
  stepStatus: "waiting" | "pending" | "approved" | "rejected";
  steps?: Array<{
    id: string;
    order: number;
    status: "waiting" | "pending" | "approved" | "rejected";
  }>;
}) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      return { rows: [], rowCount: null };
    }
    if (sql.includes("FROM auth_sessions s")) {
      return {
        rows: [
          {
            sessionId: "00000000-0000-4000-8000-000000000001",
            accountId: "00000000-0000-4000-8000-000000000002",
            email: "actor@example.org",
            principalType: "EMPLOYEE",
            expiresAt: new Date("2026-08-22T12:00:00.000Z"),
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM accounts a") && sql.includes("JOIN employees e")) {
      return {
        rows: [
          {
            id: input.actorEmployeeId,
            employeeNumber: `EMP-${input.actorEmployeeId.slice(-2)}`,
            fullName: "Actor Test",
            status: "active",
            startedOn: "2024-01-01",
            leaveEntitlementGroup: "non_education",
            unitId: "00000000-0000-4000-8000-000000000200",
            unitName: "Unit Test",
            positionName: "Posisi Test",
            directManagerEmployeeId: M,
            unitApproverEmployeeId: U,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM leave_request_approval_steps s") && sql.includes("FOR UPDATE OF s, r")) {
      expect(values?.[0]).toBe(input.requestedStepId);
      return {
        rows: [
          {
            id: input.requestedStepId,
            requestId: REQUEST,
            requesterEmployeeId: E,
            approverEmployeeId: input.stepApproverEmployeeId,
            status: input.stepStatus,
            requestStatus: "in_review",
            hcHandling: "notify",
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM leave_request_approval_steps") && sql.includes("ORDER BY step_order ASC")) {
      return {
        rows:
          input.steps ?? [
            { id: DM_STEP, order: 1, status: "pending" },
            { id: UNIT_STEP, order: 2, status: "waiting" },
          ],
        rowCount: input.steps?.length ?? 2,
      };
    }
    throw new Error(`Unexpected SQL in leave authorization test: ${sql}`);
  });

  const client = { query, release: vi.fn() };
  const pool = {
    query,
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  return { pool, query };
}

async function decide(pool: Pool, stepId: string) {
  const app = Fastify({ logger: false });
  await registerEmployeeLeaveRoutes(app, pool, config);
  const response = await app.inject({
    method: "POST",
    url: `/leave/approvals/${stepId}/decision`,
    headers: { cookie: "hcis_session=test-token" },
    payload: { decision: "approve" },
  });
  await app.close();
  return response;
}

describe("leave approval multi-account authorization", () => {
  it("rejects unrelated employee X even when X knows the active step id", async () => {
    const { pool } = createDecisionPool({
      actorEmployeeId: X,
      requestedStepId: DM_STEP,
      stepApproverEmployeeId: M,
      stepStatus: "pending",
    });
    const response = await decide(pool, DM_STEP);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "APPROVAL_FORBIDDEN" });
  });

  it("rejects requester E from approving the requester's own active step", async () => {
    const { pool } = createDecisionPool({
      actorEmployeeId: E,
      requestedStepId: DM_STEP,
      stepApproverEmployeeId: M,
      stepStatus: "pending",
    });
    const response = await decide(pool, DM_STEP);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "APPROVAL_FORBIDDEN" });
  });

  it("does not let direct manager M run the unit approver U step", async () => {
    const { pool } = createDecisionPool({
      actorEmployeeId: M,
      requestedStepId: UNIT_STEP,
      stepApproverEmployeeId: U,
      stepStatus: "waiting",
    });
    const response = await decide(pool, UNIT_STEP);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "APPROVAL_FORBIDDEN" });
  });

  it("does not let U decide the snapshotted unit step before it becomes active", async () => {
    const { pool } = createDecisionPool({
      actorEmployeeId: U,
      requestedStepId: UNIT_STEP,
      stepApproverEmployeeId: U,
      stepStatus: "waiting",
    });
    const response = await decide(pool, UNIT_STEP);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "STEP_NOT_PENDING" });
  });

  it("rejects a second decision after M's step has already been acted", async () => {
    const { pool } = createDecisionPool({
      actorEmployeeId: M,
      requestedStepId: DM_STEP,
      stepApproverEmployeeId: M,
      stepStatus: "approved",
      steps: [
        { id: DM_STEP, order: 1, status: "approved" },
        { id: UNIT_STEP, order: 2, status: "pending" },
      ],
    });
    const response = await decide(pool, DM_STEP);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "STEP_NOT_PENDING" });
  });
});
