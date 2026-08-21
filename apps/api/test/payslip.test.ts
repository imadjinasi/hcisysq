import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { ApiConfig } from "../src/config/env.js";
import {
  hasPayslipCapability,
  parsePayslipCsv,
  registerPayslipRoutes,
} from "../src/modules/payslips/routes.js";
import type { AuthPrincipal, AuthSessionResult } from "../src/modules/auth/service.js";

const config: ApiConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://synthetic.invalid/hcis",
  AUTH_ENCRYPTION_KEY: "a".repeat(64),
  AUTH_SESSION_TTL_HOURS: 8,
};

function session(principal: AuthPrincipal): AuthSessionResult {
  return { principal, expiresAt: new Date(Date.now() + 60_000).toISOString() };
}

function auth(principal: AuthPrincipal) {
  return { getSession: vi.fn(async () => session(principal)) };
}

function result(rows: unknown[] = [], rowCount = rows.length) {
  return { rows, rowCount };
}

describe("payslip import contract", () => {
  it("parses opaque imported lines without deriving payroll values", () => {
    const csv = Buffer.from(
      'employee_number,period,lines_json\nSYN-001,2026-08,"[{""label"":""Imported A"",""value"":""synthetic-value""}]"\n',
    );
    const rows = parsePayslipCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[0]?.period).toBe("2026-08-01");
    expect(rows[0]?.lines).toEqual([{ label: "Imported A", value: "synthetic-value" }]);
  });

  it("rejects business-shape assumptions outside the generic line contract", () => {
    const csv = Buffer.from("employee_number,period,net_salary\nSYN-001,2026-08,100\n");
    expect(() => parsePayslipCsv(csv)).toThrow(/header CSV wajib/i);
  });
});

describe("payslip capability", () => {
  it("never grants Foundation Board operational payslip capability", async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    await expect(
      hasPayslipCapability(
        pool,
        { id: "board-account", email: "board@example.invalid", principalType: "FOUNDATION_BOARD" },
        "payslips.publish",
      ),
    ).resolves.toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("grants Super Admin explicit system-admin capability without making it employee self", async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    await expect(
      hasPayslipCapability(
        pool,
        { id: "admin-account", email: "admin@example.invalid", principalType: "SUPER_ADMIN" },
        "payslips.import",
      ),
    ).resolves.toBe(true);
  });
});

describe("payslip endpoint authorization", () => {
  it("rejects Foundation Board from import endpoints server-side", async () => {
    const app = Fastify();
    const pool = { query: vi.fn() } as unknown as Pool;
    await registerPayslipRoutes(
      app,
      pool,
      config,
      auth({ id: "board-account", email: "board@example.invalid", principalType: "FOUNDATION_BOARD" }),
    );
    const response = await app.inject({ method: "GET", url: "/admin/payslip-imports", headers: { cookie: "hcis_session=synthetic" } });
    expect(response.statusCode).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not treat Super Admin as an employee self principal", async () => {
    const app = Fastify();
    const pool = { query: vi.fn() } as unknown as Pool;
    await registerPayslipRoutes(
      app,
      pool,
      config,
      auth({ id: "admin-account", email: "admin@example.invalid", principalType: "SUPER_ADMIN" }),
    );
    const response = await app.inject({ method: "GET", url: "/payslips", headers: { cookie: "hcis_session=synthetic" } });
    expect(response.statusCode).toBe(403);
    expect(pool.query).not.toHaveBeenCalled();
    await app.close();
  });

  it("employee A cannot read employee B payslip even with its UUID", async () => {
    const foreignPayslipId = "20000000-0000-4000-8000-000000000002";
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM accounts")) return result([{ employeeId: "10000000-0000-4000-8000-000000000001" }]);
      if (sql.includes("FROM payslips WHERE id")) {
        expect(values).toEqual([foreignPayslipId, "10000000-0000-4000-8000-000000000001"]);
        return result([]);
      }
      throw new Error(`Unexpected query in synthetic test: ${sql}`);
    });
    const app = Fastify();
    await registerPayslipRoutes(
      app,
      { query } as unknown as Pool,
      config,
      auth({ id: "employee-a-account", email: "employee-a@example.invalid", principalType: "EMPLOYEE" }),
    );
    const response = await app.inject({ method: "GET", url: `/payslips/${foreignPayslipId}`, headers: { cookie: "hcis_session=synthetic" } });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("has no employee mutation route", async () => {
    const app = Fastify();
    const pool = { query: vi.fn() } as unknown as Pool;
    await registerPayslipRoutes(
      app,
      pool,
      config,
      auth({ id: "employee-account", email: "employee@example.invalid", principalType: "EMPLOYEE" }),
    );
    const response = await app.inject({
      method: "PATCH",
      url: "/payslips/20000000-0000-4000-8000-000000000001",
      headers: { cookie: "hcis_session=synthetic" },
      payload: { value: "must-not-exist" },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
