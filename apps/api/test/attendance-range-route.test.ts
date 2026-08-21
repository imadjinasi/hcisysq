import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerAttendanceRoutes } from "../src/modules/attendance/routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://attendance-range-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

function createPool() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM auth_sessions s")) {
      return {
        rows: [
          {
            sessionId: "00000000-0000-4000-8000-000000000100",
            accountId: "00000000-0000-4000-8000-000000000001",
            email: "employee@example.org",
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
    if (sql.includes("FROM accounts a") || sql.includes("FROM attendance_daily_records")) {
      throw new Error("Invalid range must be rejected before employee attendance data is queried");
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { pool: { query } as unknown as Pool, query };
}

describe("ATT-001 route-level range validation", () => {
  it.each([
    "/attendance/me?from=2026-08-22&to=2026-08-21",
    "/attendance/me?from=2026-06-01&to=2026-08-21",
    "/attendance/me?from=2026-02-29&to=2026-03-01",
  ])("rejects invalid self-service range %s before reading employee data", async (url) => {
    const { pool, query } = createPool();
    const app = Fastify({ logger: false });
    await registerAttendanceRoutes(app, pool, config);

    const response = await app.inject({
      method: "GET",
      url,
      headers: { cookie: "hcis_session=test-token" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toMatch(/ATTENDANCE_RANGE|INVALID_ATTENDANCE_RANGE/);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("FROM accounts a") || String(sql).includes("FROM attendance_daily_records"),
      ),
    ).toBe(false);

    await app.close();
  });
});
