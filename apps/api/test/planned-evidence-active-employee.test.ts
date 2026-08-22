import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerPlannedEvidenceRoutes } from "../src/modules/leave/planned-evidence-routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://planned-evidence-active-employee-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

const ACCOUNT = "00000000-0000-4000-8000-000000000002";
const REQUEST = "00000000-0000-4000-8000-000000000100";

function sessionRows() {
  return {
    rows: [
      {
        sessionId: "00000000-0000-4000-8000-000000000001",
        accountId: ACCOUNT,
        email: "employee@example.org",
        principalType: "EMPLOYEE",
        expiresAt: new Date("2027-01-01T12:00:00.000Z"),
      },
    ],
    rowCount: 1,
  };
}

describe("planned evidence active employee boundary", () => {
  it("rejects an active account whose linked employee is inactive before evidence is stored", async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: null };
      if (sql.includes("FROM leave_requests request")) {
        expect(sql).toContain("JOIN employees employee ON employee.id = request.employee_id");
        expect(sql).toContain("account.id = $2");
        expect(sql).toContain("account.principal_type = 'EMPLOYEE'");
        expect(sql).toContain("account.status = 'active'");
        expect(sql).toContain("employee.status = 'active'");
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected connected-client SQL: ${sql}`);
    });
    const client = { query: clientQuery, release: vi.fn() };
    const poolQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM auth_sessions s")) return sessionRows();
      if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected pool SQL: ${sql}`);
    });
    const pool = {
      query: poolQuery,
      connect: vi.fn(async () => client),
    } as unknown as Pool;

    const app = Fastify({ logger: false });
    await registerPlannedEvidenceRoutes(app, pool, config);
    const response = await app.inject({
      method: "POST",
      url: `/leave/planned/me/requests/${REQUEST}/evidence`,
      headers: { cookie: "hcis_session=test-token" },
      payload: {
        fileName: "bukti.pdf",
        contentType: "application/pdf",
        contentBase64: Buffer.from("%PDF-synthetic", "utf8").toString("base64"),
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "PLANNED_LEAVE_NOT_FOUND" });
    expect(
      clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO leave_request_evidence")),
    ).toBe(false);
    await app.close();
  });
});
