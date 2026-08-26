import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerOrgAccessAdminRoutes } from "../src/modules/employees/admin-org-access-routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://role-compatibility-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

const ADMIN = "10000000-0000-4000-8000-000000000001";
const ACCOUNT = "10000000-0000-4000-8000-000000000002";
const ROLE = "10000000-0000-4000-8000-000000000006";
const UNIT = "10000000-0000-4000-8000-000000000010";

function createPool(
  principalType: "EMPLOYEE" | "FOUNDATION_BOARD" | "SUPER_ADMIN",
  roleKey: string,
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM auth_sessions s")) {
      return {
        rows: [{
          sessionId: "10000000-0000-4000-8000-000000000020",
          accountId: ADMIN,
          email: "admin@example.invalid",
          principalType: "SUPER_ADMIN",
          expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    if (sql.includes('SELECT id, principal_type AS "principalType" FROM accounts')) {
      return { rows: [{ id: ACCOUNT, principalType }], rowCount: 1 };
    }
    if (sql.includes('SELECT id, role_key AS "roleKey" FROM roles')) {
      return { rows: [{ id: ROLE, roleKey }], rowCount: 1 };
    }
    if (sql.includes("SELECT id FROM organizational_units")) {
      return { rows: [{ id: UNIT }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO account_role_assignments")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO access_audit_events")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { pool: { query } as unknown as Pool, query };
}

async function assign(input: {
  principalType: "EMPLOYEE" | "FOUNDATION_BOARD" | "SUPER_ADMIN";
  roleKey: string;
  scopeType: "own" | "unit" | "organization";
}) {
  const { pool, query } = createPool(input.principalType, input.roleKey);
  const app = Fastify({ logger: false });
  await registerOrgAccessAdminRoutes(app, pool, config);
  const response = await app.inject({
    method: "POST",
    url: `/admin/access/accounts/${ACCOUNT}/role-assignments`,
    headers: { cookie: "hcis_session=synthetic" },
    payload: {
      roleId: ROLE,
      scopeType: input.scopeType,
      organizationalUnitId: input.scopeType === "unit" ? UNIT : null,
    },
  });
  await app.close();
  return { response, query };
}

describe("admin principal-role compatibility", () => {
  it("lets Super Admin grant the governance role to Foundation Board organization-wide", async () => {
    const { response, query } = await assign({
      principalType: "FOUNDATION_BOARD",
      roleKey: "governance_leave_approver",
      scopeType: "organization",
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO account_role_assignments"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO access_audit_events"))).toBe(true);
  });

  it.each([
    ["FOUNDATION_BOARD", "human_capital", "organization", "FOUNDATION_BOARD_ROLE_FORBIDDEN"],
    ["FOUNDATION_BOARD", "governance_leave_approver", "unit", "GOVERNANCE_ROLE_REQUIRES_ORGANIZATION_SCOPE"],
    ["EMPLOYEE", "governance_leave_approver", "organization", "GOVERNANCE_ROLE_FOUNDATION_BOARD_ONLY"],
    ["SUPER_ADMIN", "human_capital", "organization", "SUPER_ADMIN_ROLE_ASSIGNMENT_PROTECTED"],
  ] as const)("rejects %s / %s / %s", async (principalType, roleKey, scopeType, code) => {
    const { response, query } = await assign({ principalType, roleKey, scopeType });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO account_role_assignments"))).toBe(false);
  });
});
