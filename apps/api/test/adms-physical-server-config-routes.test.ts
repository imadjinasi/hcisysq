import Fastify from "fastify";
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerAdmsPhysicalParityRegistryUserRoutes } from "../src/modules/attendance/adms/physical-parity-registry-user-routes.js";

const deviceId = "00000000-0000-4000-8000-000000001201";
const accountId = "00000000-0000-4000-8000-000000001202";
const serial = "SYNTH-ATT005-SERVER";
const approvedHost = "attendance.example.test";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://physical-server-route-test",
  ADMS_INGRESS_HOST: approvedHost,
  AUTH_MODE: "local" as const,
  AUTH_ENCRYPTION_KEY: "71".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

function createPool(capabilityState: "documented" | "canary_pending" | "verified") {
  const rootQuery = vi.fn(async (sql: string) => {
    if (sql.includes("FROM auth_sessions s")) {
      return {
        rows: [{
          sessionId: "00000000-0000-4000-8000-000000001203",
          accountId,
          email: "admin@example.invalid",
          principalType: "SUPER_ADMIN",
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("UPDATE auth_sessions SET last_seen_at")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected root SQL in server config route test: ${sql}`);
  });

  const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes("SELECT id, serial_number AS \"serialNumber\"") && sql.includes("FOR UPDATE")) {
      return {
        rows: [{
          id: deviceId,
          serialNumber: serial,
          lifecycle: "active",
          timezone: "Asia/Jakarta",
          organizationalUnitId: null,
          areaContext: null,
          worksiteLabel: null,
          deviceRole: "attendance_only",
          transferMode: "push",
          heartbeatIntervalSeconds: 30,
          desiredPushProtocolVersion: null,
        }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM attendance_adms_physical_capabilities") && sql.includes("SELECT state")) {
      return { rows: capabilityState === "documented" ? [] : [{ state: capabilityState }], rowCount: capabilityState === "documented" ? 0 : 1 };
    }
    if (sql.includes("SELECT lifecycle FROM attendance_adms_devices") && sql.includes("FOR UPDATE")) {
      return { rows: [{ lifecycle: "active" }], rowCount: 1 };
    }
    if (sql.includes("FROM attendance_adms_commands") && sql.includes("status IN ('pending', 'delivered', 'acknowledged')")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("INSERT INTO attendance_adms_physical_operations")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO attendance_adms_commands")) {
      expect(String(params?.[3])).toContain(`WebServerIP=${approvedHost}`);
      expect(String(params?.[3])).toContain("WebServerPort=80");
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO attendance_adms_command_events")) return { rows: [], rowCount: 1 };
    if (sql.includes("INSERT INTO attendance_adms_admin_audit_events")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected client SQL in server config route test: ${sql}`);
  });

  const client = { query: clientQuery, release: vi.fn() } as unknown as PoolClient;
  return {
    pool: { query: rootQuery, connect: vi.fn(async () => client) } as unknown as Pool,
    clientQuery,
  };
}

async function injectServerConfig(
  pool: Pool,
  input: { host: string; port: number; mode: "canary" | "execute" },
) {
  const app = Fastify({ logger: false });
  await registerAdmsPhysicalParityRegistryUserRoutes(app, pool, config);
  const response = await app.inject({
    method: "POST",
    url: `/admin/attendance/adms/devices/${deviceId}/physical/server-config`,
    headers: { cookie: "hcis_session=test-token" },
    payload: {
      ...input,
      confirmation: `SET SERVER ${serial} ${input.host}:${input.port}`,
    },
  });
  await app.close();
  return response;
}

describe("ATT-005 physical server-config runtime safety", () => {
  it("rejects execute until the exact device capability is verified", async () => {
    const { pool, clientQuery } = createPool("documented");
    const response = await injectServerConfig(pool, { host: approvedHost, port: 80, mode: "execute" });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("PHYSICAL_CAPABILITY_NOT_VERIFIED");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO attendance_adms_commands"))).toBe(false);
  });

  it("rejects another canary while the capability is pending", async () => {
    const { pool, clientQuery } = createPool("canary_pending");
    const response = await injectServerConfig(pool, { host: approvedHost, port: 80, mode: "canary" });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("PHYSICAL_CANARY_PENDING");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO attendance_adms_physical_operations"))).toBe(false);
  });

  it("rejects an arbitrary redirect even after server_config is verified", async () => {
    const { pool, clientQuery } = createPool("verified");
    const response = await injectServerConfig(pool, { host: "evil.example.test", port: 80, mode: "execute" });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SERVER_TARGET_NOT_APPROVED");
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO attendance_adms_commands"))).toBe(false);
  });

  it("accepts only the approved verified target and preserves verified evidence on execute", async () => {
    const { pool, clientQuery } = createPool("verified");
    const response = await injectServerConfig(pool, { host: approvedHost, port: 80, mode: "execute" });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ commandCount: 1 });
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO attendance_adms_commands"))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO attendance_adms_physical_capabilities"))).toBe(false);
  });
});
