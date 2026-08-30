import Fastify from "fastify";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerAdmsWave2UserCorrectionRoutes } from "../src/modules/attendance/adms/wave2-user-correction-routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://wave2-user-correction-test",
  AUTH_MODE: "local" as const,
  AUTH_ENCRYPTION_KEY: "66".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

const deviceId = "00000000-0000-4000-8000-000000001001";
const mappingId = "00000000-0000-4000-8000-000000001002";
const employeeId = "00000000-0000-4000-8000-000000001003";

function authRootQuery(principalType: "SUPER_ADMIN" | "EMPLOYEE" = "SUPER_ADMIN") {
  return vi.fn(async (sql: string) => {
    if (sql.includes("FROM auth_sessions s")) {
      return {
        rows: [{
          sessionId: "00000000-0000-4000-8000-000000000100",
          accountId: "00000000-0000-4000-8000-000000000001",
          email: "admin@example.org",
          principalType,
          expiresAt: new Date("2099-08-30T00:00:00.000Z"),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    if (sql.includes("FROM attendance_adms_device_user_corrections c")) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected root SQL in user correction test: ${sql}`);
  });
}

function syncNamePool() {
  const rootQuery = authRootQuery();
  const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes("FROM attendance_adms_devices") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: deviceId, lifecycle: "active" }], rowCount: 1 };
    }
    if (sql.includes("FROM attendance_adms_employee_mappings m") && sql.includes("JOIN employees e")) {
      expect(params).toEqual([deviceId, "205291319"]);
      return {
        rows: [{
          mappingId,
          employeeId,
          employeeName: "Muhammad Kamal Faza",
          employeeStatus: "active",
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM attendance_adms_device_roster_entries") && sql.includes("last_seen_at")) {
      return {
        rows: [{ displayName: "Muhammad Kamal Faza", lastSeenAt: new Date("2026-08-30T01:36:08.000Z") }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM attendance_adms_commands") && sql.includes("status IN")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("INSERT INTO attendance_adms_commands")) {
      expect(params?.[2]).toBe("DATA UPDATE USERINFO PIN=205291319\tName=Muhammad Kamal Faza");
      return {
        rows: [{
          id: params?.[0],
          commandNumber: "21",
          status: "pending",
          createdAt: new Date("2026-08-30T06:00:00.000Z"),
          expiresAt: new Date("2026-08-30T06:15:00.000Z"),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("INSERT INTO attendance_adms_command_events")) {
      const metadata = JSON.parse(String(params?.[3]));
      expect(metadata).toMatchObject({
        capability: "name_only_userinfo_update",
        pin: "205291319",
        employeeId,
        currentName: "Muhammad Kamal Faza",
        targetName: "Muhammad Kamal Faza",
        sameValue: true,
        pinMutation: false,
        biometricMutation: false,
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO attendance_adms_admin_audit_events")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected sync-name SQL: ${sql}`);
  });
  const client = { query: clientQuery, release: vi.fn() } as unknown as PoolClient;
  return { pool: { query: rootQuery, connect: vi.fn(async () => client) } as unknown as Pool, clientQuery };
}

function correctionPool(intendedConflict: boolean) {
  const rootQuery = authRootQuery();
  const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes("FROM attendance_adms_devices") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: deviceId, lifecycle: "active" }], rowCount: 1 };
    }
    if (sql.includes("FROM attendance_adms_employee_mappings m") && sql.includes("employee_number")) {
      return {
        rows: [{
          mappingId,
          employeeId,
          employeeName: "Muhammad Kamal Faza",
          employeeNumber: "202607200205291318",
          employeeStatus: "active",
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM attendance_adms_device_roster_entries") && sql.includes("card_number")) {
      return { rows: [{ displayName: "Muhammad Kamal Faza", cardNumber: "3576446775" }], rowCount: 1 };
    }
    if (sql.includes("SELECT EXISTS") && sql.includes("attendance_adms_events ev")) {
      expect(params).toEqual([deviceId, "205291318"]);
      return { rows: [{ conflict: intendedConflict }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO attendance_adms_device_user_corrections")) {
      return {
        rows: [{
          id: params?.[0],
          deviceId,
          employeeId,
          legacyPin: "205291319",
          intendedPin: "205291318",
          reason: "pin_typo",
          status: "planned",
          safeMetadata: JSON.parse(String(params?.[6])),
          createdAt: new Date("2026-08-30T06:00:00.000Z"),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("INSERT INTO attendance_adms_admin_audit_events")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected correction-plan SQL: ${sql}`);
  });
  const client = { query: clientQuery, release: vi.fn() } as unknown as PoolClient;
  return { pool: { query: rootQuery, connect: vi.fn(async () => client) } as unknown as Pool, clientQuery };
}

describe("ATT-005 Wave 2 device user correction routes", () => {
  it("queues a same-value name-only update from the explicit mapped HCIS employee", async () => {
    const { pool } = syncNamePool();
    const app = Fastify({ logger: false });
    await registerAdmsWave2UserCorrectionRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/admin/attendance/adms/devices/${deviceId}/users/205291319/commands/sync-name`,
      headers: { cookie: "hcis_session=test-token" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      item: {
        commandNumber: "21",
        commandType: "update_user_info",
        pin: "205291319",
        currentName: "Muhammad Kamal Faza",
        targetName: "Muhammad Kamal Faza",
        sameValue: true,
        fields: ["Name"],
        expectedResultCommand: "DATA",
        verificationRequired: "command_success_then_single_pin_userinfo_readback",
      },
    });
    await app.close();
  });

  it("creates a planning-only legacy-to-intended PIN correction after explicit mapping", async () => {
    const { pool } = correctionPool(false);
    const app = Fastify({ logger: false });
    await registerAdmsWave2UserCorrectionRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/admin/attendance/adms/devices/${deviceId}/user-corrections`,
      headers: { cookie: "hcis_session=test-token", "content-type": "application/json" },
      payload: { legacyPin: "205291319", intendedPin: "205291318" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      item: {
        employeeId,
        employeeName: "Muhammad Kamal Faza",
        legacyPin: "205291319",
        intendedPin: "205291318",
        status: "planned",
      },
      executionPolicy: "planning_only",
      destructivePinMutationEnabled: false,
      biometricTransferValidated: false,
    });
    await app.close();
  });

  it("blocks a correction plan when intended PIN already has any machine fact", async () => {
    const { pool, clientQuery } = correctionPool(true);
    const app = Fastify({ logger: false });
    await registerAdmsWave2UserCorrectionRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/admin/attendance/adms/devices/${deviceId}/user-corrections`,
      headers: { cookie: "hcis_session=test-token", "content-type": "application/json" },
      payload: { legacyPin: "205291319", intendedPin: "205291318" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "ADMS_INTENDED_PIN_ALREADY_OBSERVED" });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO attendance_adms_device_user_corrections"))).toBe(false);
    await app.close();
  });
});
