import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerEmployeeLeaveRoutes } from "../src/modules/leave/employee-routes.js";
import { jakartaBusinessDate } from "../src/modules/organization/jakarta-date.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://governance-leave-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

const SECRETARY = "20000000-0000-4000-8000-000000000001";
const OTHER_BOARD = "20000000-0000-4000-8000-000000000002";
const REQUEST = "20000000-0000-4000-8000-000000000003";
const STEP = "20000000-0000-4000-8000-000000000004";
const DIRECTOR = "20000000-0000-4000-8000-000000000005";

function authRows(accountId: string) {
  return {
    rows: [{
      sessionId: "20000000-0000-4000-8000-000000000010",
      accountId,
      email: "board@example.invalid",
      principalType: "FOUNDATION_BOARD",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    }],
    rowCount: 1,
  };
}

function createInboxPool(accountId: string) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM auth_sessions s")) return authRows(accountId);
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    if (sql.includes("FROM leave_request_approval_steps s") && sql.includes("r.status = 'in_review'")) {
      expect(values).toEqual([null, accountId]);
      return {
        rows: accountId === SECRETARY ? [{
          stepId: STEP,
          requestId: REQUEST,
          requesterEmployeeId: DIRECTOR,
          requesterName: "Direktur Sintetis",
          policyKey: "annual",
          startOn: "2026-09-01",
          endOn: "2026-09-02",
          workingDays: 2,
          reason: "Keperluan keluarga",
          submittedAt: new Date("2026-08-26T02:00:00.000Z"),
          sources: ["GOVERNANCE_APPROVER"],
        }] : [],
        rowCount: accountId === SECRETARY ? 1 : 0,
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { pool: { query } as unknown as Pool, query };
}

function createDecisionPool(accountId: string) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT leave_oversight_notification", "RELEASE SAVEPOINT leave_oversight_notification"].includes(sql)) {
      return { rows: [], rowCount: null };
    }
    if (sql.includes("FROM auth_sessions s")) return authRows(accountId);
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    if (sql.includes("FROM leave_request_approval_steps s") && sql.includes("FOR UPDATE OF s, r")) {
      return { rows: [{
        id: STEP,
        requestId: REQUEST,
        requesterEmployeeId: DIRECTOR,
        approverEmployeeId: null,
        approverAccountId: SECRETARY,
        status: "pending",
        requestStatus: "in_review",
        hcHandling: "notify",
        policyKey: "annual",
      }], rowCount: 1 };
    }
    if (sql.includes("rp.permission_key = 'leave.governance.approve'")) {
      expect(values).toEqual([SECRETARY, jakartaBusinessDate()]);
      expect(sql).toContain("ara.scope_type = 'organization'");
      expect(sql).not.toContain("CURRENT_DATE");
      return { rows: [{ allowed: true }], rowCount: 1 };
    }
    if (sql.includes("FROM leave_request_approval_steps") && sql.includes("ORDER BY step_order ASC")) {
      return { rows: [{ id: STEP, order: 1, status: "pending" }], rowCount: 1 };
    }
    if (sql.includes("UPDATE leave_request_approval_steps") || sql.includes("UPDATE leave_requests")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO leave_request_events") || sql.includes("INSERT INTO leave_notification_outbox")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("validation_summary #>>")) {
      return { rows: [{ source: null, mode: null }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  return {
    pool: { query, connect: vi.fn(async () => client) } as unknown as Pool,
    query,
  };
}

async function request(pool: Pool, method: "GET" | "POST", url: string, payload?: object) {
  const app = Fastify({ logger: false });
  await registerEmployeeLeaveRoutes(app, pool, config);
  const response = await app.inject({
    method,
    url,
    headers: { cookie: "hcis_session=synthetic" },
    ...(payload ? { payload } : {}),
  });
  await app.close();
  return response;
}

describe("Foundation Board governance Leave authorization", () => {
  it("shows the Secretary only the exact account-snapshotted inbox", async () => {
    const secretary = createInboxPool(SECRETARY);
    const response = await request(secretary.pool, "GET", "/leave/approvals");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ stepId: STEP, requesterName: "Direktur Sintetis", sources: ["GOVERNANCE_APPROVER"] }],
    });

    const other = createInboxPool(OTHER_BOARD);
    const otherResponse = await request(other.pool, "GET", "/leave/approvals");
    expect(otherResponse.statusCode).toBe(200);
    expect(otherResponse.json()).toEqual({ items: [] });
  });

  it("lets the exact Secretary account decide and checks effective dates using the WIB business date", async () => {
    expect(jakartaBusinessDate(new Date("2026-08-21T17:30:00.000Z"))).toBe("2026-08-22");
    const { pool } = createDecisionPool(SECRETARY);
    const response = await request(pool, "POST", `/leave/approvals/${STEP}/decision`, { decision: "approve" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ requestStatus: "approved", stepStatus: "approved" });
  });

  it("never lets another Foundation Board account act on the Secretary step", async () => {
    const { pool, query } = createDecisionPool(OTHER_BOARD);
    const response = await request(pool, "POST", `/leave/approvals/${STEP}/decision`, { decision: "approve" });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "APPROVAL_FORBIDDEN" });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("leave.governance.approve"))).toBe(false);
  });
});
