import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerEmployeeLeaveRoutes } from "../src/modules/leave/employee-routes.js";
import { registerPlannedLeaveRoutes } from "../src/modules/leave/planned-leave-routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://governance-history-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

const ACCOUNT = "30000000-0000-4000-8000-000000000001";
const EMPLOYEE = "30000000-0000-4000-8000-000000000002";
const REQUEST = "30000000-0000-4000-8000-000000000003";

function authRows() {
  return {
    rows: [{
      sessionId: "30000000-0000-4000-8000-000000000010",
      accountId: ACCOUNT,
      email: "director@example.invalid",
      principalType: "EMPLOYEE",
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    }],
    rowCount: 1,
  };
}

const employee = {
  id: EMPLOYEE,
  employeeNumber: "SYN-001",
  fullName: "Direktur Sintetis",
  status: "active",
  startedOn: "2024-01-01",
  leaveEntitlementGroup: "non_education",
  unitId: null,
  unitName: null,
  positionName: "Direktur",
};

function annualPool() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM auth_sessions s")) return authRows();
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    if (sql.includes("FROM accounts a") && sql.includes("JOIN employees e")) {
      return { rows: [employee], rowCount: 1 };
    }
    if (sql.includes("FROM leave_requests r") && sql.includes('AS "currentApproverLabel"')) {
      expect(sql).toContain("Penyetuju Pengurus Yayasan");
      expect(sql).toContain("current_step.approver_account_id IS NOT NULL");
      return { rows: [{
        id: REQUEST,
        policyKey: "annual",
        status: "in_review",
        startOn: "2026-09-01",
        endOn: "2026-09-02",
        workingDays: 2,
        reason: null,
        annualPeriodKey: "JUL_SEP",
        submittedAt: new Date("2026-08-26T02:00:00.000Z"),
        finalDecidedAt: null,
        currentApproverLabel: "Penyetuju Pengurus Yayasan",
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected annual history SQL: ${sql}`);
  });
  return { query } as unknown as Pool;
}

function plannedPool() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM auth_sessions s")) return authRows();
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    if (sql.includes("FROM accounts account") && sql.includes("JOIN employees employee")) {
      return { rows: [employee], rowCount: 1 };
    }
    if (sql.includes("FROM leave_requests request") && sql.includes('AS "currentApproverLabel"')) {
      expect(sql).toContain("Penyetuju Pengurus Yayasan");
      expect(sql).toContain("active_step.approver_account_id IS NOT NULL");
      return { rows: [{
        id: REQUEST,
        policyKey: "hajj",
        status: "in_review",
        startOn: "2026-09-01",
        endOn: "2026-09-10",
        workingDays: 8,
        reason: null,
        validationSummary: {},
        submittedAt: new Date("2026-08-26T02:00:00.000Z"),
        finalDecidedAt: null,
        currentApproverLabel: "Penyetuju Pengurus Yayasan",
        hcTaskKind: "validate",
        hcTaskStatus: "waiting",
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected planned history SQL: ${sql}`);
  });
  return { query } as unknown as Pool;
}

describe("governance current approver history", () => {
  it("returns a safe annual Leave current-approver label without an account UUID", async () => {
    const app = Fastify({ logger: false });
    await registerEmployeeLeaveRoutes(app, annualPool(), config);
    const response = await app.inject({
      method: "GET",
      url: "/leave/me/requests",
      headers: { cookie: "hcis_session=synthetic" },
    });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.json().requests[0]).toMatchObject({
      currentApproverLabel: "Penyetuju Pengurus Yayasan",
    });
    expect(JSON.stringify(response.json())).not.toContain("approverAccountId");
  });

  it("uses the same safe label in planned Leave history and next action", async () => {
    const app = Fastify({ logger: false });
    await registerPlannedLeaveRoutes(app, plannedPool(), config);
    const response = await app.inject({
      method: "GET",
      url: "/leave/planned/me/summary",
      headers: { cookie: "hcis_session=synthetic" },
    });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.json().requests[0]).toMatchObject({
      currentApproverLabel: "Penyetuju Pengurus Yayasan",
      nextAction: "Menunggu Penyetuju Pengurus Yayasan",
    });
  });
});
