import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerAdmsWave3AdminRoutes } from "../src/modules/attendance/adms/wave3-admin-routes.js";

const deviceId = "00000000-0000-4000-8000-000000000961";
const accountId = "00000000-0000-4000-8000-000000000962";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://wave3-operations-test",
  AUTH_MODE: "local" as const,
  AUTH_ENCRYPTION_KEY: "ab".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
  BIOMETRIC_COLLECTION_ENABLED: "0" as const,
};

function createPool(principalType: "SUPER_ADMIN" | "EMPLOYEE" = "SUPER_ADMIN") {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM auth_sessions s")) {
      return {
        rows: [{
          sessionId: "00000000-0000-4000-8000-000000000963",
          accountId,
          email: "admin@example.invalid",
          principalType,
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    if (sql.includes("FROM attendance_adms_devices") && sql.includes("serial_number AS \"serialNumber\"")) {
      return {
        rows: [{
          id: deviceId,
          serialNumber: "SYNTH-WAVE3-DEVICE",
          displayName: "Synthetic Wave 3 Device",
          lifecycle: "active",
          timezone: "Asia/Jakarta",
          model: "Synthetic",
          firmwareVersion: "test",
          lastSuccessfulRequestAt: new Date("2026-09-02T00:00:00.000Z"),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM attendance_adms_commands") && sql.includes("status = 'pending'")) {
      return { rows: [{ count: 0 }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL in Wave 3 operations route test: ${sql}`);
  });
  const connect = vi.fn();
  return { pool: { query, connect } as unknown as Pool, query, connect };
}

describe("ATT-005 Wave 3 operations routes", () => {
  it("returns an explicit fail-closed capability matrix to SUPER_ADMIN", async () => {
    const { pool } = createPool();
    const app = Fastify({ logger: false });
    await registerAdmsWave3AdminRoutes(app, pool, config);

    const response = await app.inject({
      method: "GET",
      url: `/admin/attendance/adms/devices/${deviceId}/operations`,
      headers: { cookie: "hcis_session=test-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.json();
    expect(body).toMatchObject({
      item: {
        rawPayloadExposed: false,
        arbitraryCommandEnabled: false,
        userInfoReadsRetired: true,
        destructiveExecutionEnabled: false,
        pendingCommandCount: 0,
        operationalRetention: { deletionEnabled: false, state: "policy_required" },
      },
    });
    const capabilities = body.item.capabilities as Array<{ key: string; state: string; execution: string }>;
    expect(capabilities.find((item) => item.key === "transaction_export")).toMatchObject({ state: "available", execution: "hcis_only" });
    expect(capabilities.find((item) => item.key === "offline_attlog_import")).toMatchObject({ state: "available", execution: "hcis_only" });
    expect(capabilities.find((item) => item.key === "reboot")).toMatchObject({ state: "not_verified", execution: "blocked" });
    expect(capabilities.find((item) => item.key === "firmware_upgrade")).toMatchObject({ state: "not_verified", execution: "blocked" });
    expect(capabilities.find((item) => item.key === "clear_all_data")).toMatchObject({ state: "blocked", execution: "blocked" });
    expect(response.body).not.toContain("DATA QUERY USERINFO");
    expect(response.body).not.toContain("ciphertext");
    await app.close();
  });

  it("rejects employee principals before reading device operations", async () => {
    const { pool, query } = createPool("EMPLOYEE");
    const app = Fastify({ logger: false });
    await registerAdmsWave3AdminRoutes(app, pool, config);

    const response = await app.inject({
      method: "GET",
      url: `/admin/attendance/adms/devices/${deviceId}/operations`,
      headers: { cookie: "hcis_session=test-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("FROM attendance_adms_devices"))).toBe(false);
    await app.close();
  });
});