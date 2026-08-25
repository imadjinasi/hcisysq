import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerOrgAccessAdminRoutes } from "../src/modules/employees/admin-org-access-routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://bulk-access-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

describe("bulk employee access authorization", () => {
  it.each(["EMPLOYEE", "FOUNDATION_BOARD"] as const)(
    "rejects %s before preview or mutation queries run",
    async (principalType) => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes("FROM auth_sessions s")) {
          return {
            rows: [{
              sessionId: "00000000-0000-4000-8000-000000000001",
              accountId: "00000000-0000-4000-8000-000000000002",
              email: "synthetic@example.invalid",
              principalType,
              expiresAt: new Date("2027-01-01T00:00:00.000Z"),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes("UPDATE auth_sessions SET last_seen_at")) {
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      });
      const connect = vi.fn();
      const pool = { query, connect } as unknown as Pool;
      const app = Fastify({ logger: false });
      await registerOrgAccessAdminRoutes(app, pool, config);

      const response = await app.inject({
        method: "POST",
        url: "/admin/access/employee-accounts/bulk-prepare",
        headers: { cookie: "hcis_session=synthetic" },
        payload: { employeeIds: ["10000000-0000-4000-8000-000000000001"] },
      });
      await app.close();

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
      expect(connect).not.toHaveBeenCalled();
      expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO accounts"))).toBe(false);
    },
  );
});
