import Fastify from "fastify";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerAdmsWave2UserInfoRoutes } from "../src/modules/attendance/adms/wave2-userinfo-routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://wave2-userinfo-test",
  AUTH_MODE: "local" as const,
  AUTH_ENCRYPTION_KEY: "55".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

const deviceId = "00000000-0000-4000-8000-000000000901";

function createPool(input: {
  principalType?: "EMPLOYEE" | "SUPER_ADMIN";
  lifecycle?: "active" | "disabled" | "quarantined";
  activeCommand?: boolean;
  observedPin?: boolean;
} = {}) {
  const principalType = input.principalType ?? "SUPER_ADMIN";
  const lifecycle = input.lifecycle ?? "active";
  const observedPin = input.observedPin ?? true;
  const rootQuery = vi.fn(async (sql: string) => {
    if (sql.includes("FROM auth_sessions s")) {
      return {
        rows: [
          {
            sessionId: "00000000-0000-4000-8000-000000000100",
            accountId: "00000000-0000-4000-8000-000000000001",
            email: principalType === "SUPER_ADMIN" ? "admin@example.org" : "employee@example.org",
            principalType,
            expiresAt: new Date("2099-08-28T12:00:00.000Z"),
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected root SQL in USERINFO route test: ${sql}`);
  });

  const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes("FROM attendance_adms_devices") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: deviceId, lifecycle }], rowCount: 1 };
    }
    if (sql.includes("SELECT EXISTS") && sql.includes("attendance_adms_events")) {
      expect(params).toEqual([deviceId, "0042"]);
      return { rows: [{ observed: observedPin }], rowCount: 1 };
    }
    if (sql.includes("FROM attendance_adms_commands") && sql.includes("status IN")) {
      return input.activeCommand
        ? { rows: [{ id: "00000000-0000-4000-8000-000000000902", commandNumber: "8", status: "delivered" }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes("INSERT INTO attendance_adms_commands")) {
      expect(params?.[1]).toBe(deviceId);
      expect(params?.[2]).toBe("DATA QUERY USERINFO PIN=0042");
      return {
        rows: [
          {
            id: params?.[0],
            commandNumber: "9",
            commandType: "query_user_info",
            reason: "admin_query_user_info",
            status: "pending",
            createdAt: new Date("2026-08-29T03:00:00.000Z"),
            expiresAt: new Date("2026-08-29T03:15:00.000Z"),
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("INSERT INTO attendance_adms_command_events")) {
      const metadata = JSON.parse(String(params?.[3]));
      expect(metadata).toMatchObject({
        pin: "0042",
        capability: "single_pin_userinfo",
        fullRoster: false,
        pinPreviouslyObserved: true,
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO attendance_adms_admin_audit_events")) {
      const afterState = JSON.parse(String(params?.[3]));
      expect(afterState).toMatchObject({
        commandType: "query_user_info",
        reason: "admin_query_user_info",
        pin: "0042",
        fullRoster: false,
        pinPreviouslyObserved: true,
      });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected transaction SQL in USERINFO route test: ${sql}`);
  });
  const release = vi.fn();
  const client = { query: clientQuery, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client);
  return {
    pool: { query: rootQuery, connect } as unknown as Pool,
    rootQuery,
    clientQuery,
    connect,
    release,
  };
}

describe("ATT-005 Wave 2 single-PIN USERINFO Admin route", () => {
  it("queues one audited leading-zero PIN query for an active device after the PIN was observed", async () => {
    const { pool, clientQuery } = createPool();
    const app = Fastify({ logger: false });
    await registerAdmsWave2UserInfoRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/admin/attendance/adms/devices/${deviceId}/commands/query-user-info`,
      headers: { cookie: "hcis_session=test-token", "content-type": "application/json" },
      payload: { pin: "0042" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      item: {
        commandNumber: "9",
        commandType: "query_user_info",
        reason: "admin_query_user_info",
        status: "pending",
        pin: "0042",
        fullRoster: false,
        verificationRequired: "command_success_and_new_safe_roster_observation",
      },
    });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("'query_user_info'"))).toBe(true);
    await app.close();
  });

  it("rejects arbitrary command injection in PIN before opening a transaction", async () => {
    const { pool, connect } = createPool();
    const app = Fastify({ logger: false });
    await registerAdmsWave2UserInfoRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/admin/attendance/adms/devices/${deviceId}/commands/query-user-info`,
      headers: { cookie: "hcis_session=test-token", "content-type": "application/json" },
      payload: { pin: "0042\tName=Injected" },
    });

    expect(response.statusCode).toBe(400);
    expect(connect).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects employee principals before device command state is queried", async () => {
    const { pool, connect } = createPool({ principalType: "EMPLOYEE" });
    const app = Fastify({ logger: false });
    await registerAdmsWave2UserInfoRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/admin/attendance/adms/devices/${deviceId}/commands/query-user-info`,
      headers: { cookie: "hcis_session=test-token", "content-type": "application/json" },
      payload: { pin: "0042" },
    });

    expect(response.statusCode).toBe(403);
    expect(connect).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a PIN that HCIS has never observed on the target device", async () => {
    const { pool, clientQuery } = createPool({ observedPin: false });
    const app = Fastify({ logger: false });
    await registerAdmsWave2UserInfoRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/admin/attendance/adms/devices/${deviceId}/commands/query-user-info`,
      headers: { cookie: "hcis_session=test-token", "content-type": "application/json" },
      payload: { pin: "0042" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "ADMS_PIN_NOT_OBSERVED" });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO attendance_adms_commands"))).toBe(false);
    await app.close();
  });

  it("does not queue while another command is active", async () => {
    const { pool, clientQuery } = createPool({ activeCommand: true });
    const app = Fastify({ logger: false });
    await registerAdmsWave2UserInfoRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/admin/attendance/adms/devices/${deviceId}/commands/query-user-info`,
      headers: { cookie: "hcis_session=test-token", "content-type": "application/json" },
      payload: { pin: "0042" },
    });

    expect(response.statusCode).toBe(409);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO attendance_adms_commands"))).toBe(false);
    await app.close();
  });
});
