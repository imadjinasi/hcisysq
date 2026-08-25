import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { registerOrganizationAdminRoutes } from "../src/modules/organization/admin-routes.js";

const config = {
  NODE_ENV: "test" as const,
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://organization-admin-test",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
};

function createPool(
  principalType: "SUPER_ADMIN" | "EMPLOYEE" | "FOUNDATION_BOARD",
  changeSets: Array<Record<string, unknown>> = [],
) {
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
    if (sql.includes("FROM organization_change_sets")) {
      return { rows: changeSets, rowCount: changeSets.length };
    }
    if (sql.includes("FROM organization_rollout_settings")) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unexpected organization admin SQL: ${sql}`);
  });
  return { pool: { query } as unknown as Pool, query };
}

async function request(
  principalType: "SUPER_ADMIN" | "EMPLOYEE" | "FOUNDATION_BOARD",
  method: "GET" | "PATCH" | "POST",
  url: string,
  changeSets: Array<Record<string, unknown>> = [],
) {
  const { pool, query } = createPool(principalType, changeSets);
  const app = Fastify({ logger: false });
  await registerOrganizationAdminRoutes(app, pool, config);
  const response = await app.inject({
    method,
    url,
    headers: { cookie: "hcis_session=synthetic" },
    payload: method === "PATCH" ? { mode: "STRUCTURE", workflowKey: "LEAVE" } : undefined,
  });
  await app.close();
  return { response, query };
}

describe("Organization Designer administration boundary", () => {
  it("lists stable human revision metadata without sensitive creator or validation data", async () => {
    const rows = ["DRAFT", "VALIDATED", "PUBLISHED"].map((status, index) => ({
      id: `00000000-0000-4000-8000-00000000001${index}`,
      name: `Synthetic revision ${index}`,
      effectiveOn: "2026-09-01",
      status,
      baseChangeSetId: null,
      validationReport: { internal: "must-not-leak" },
      createdByAccountId: "00000000-0000-4000-8000-000000000099",
      createdAt: new Date(`2026-08-2${index + 1}T00:00:00.000Z`),
      validatedAt: status === "DRAFT" ? null : new Date("2026-08-24T00:00:00.000Z"),
      publishedAt: status === "PUBLISHED" ? new Date("2026-08-25T00:00:00.000Z") : null,
    }));
    const { response, query } = await request("SUPER_ADMIN", "GET", "/admin/organization/designer/revisions", rows);
    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item: { status: string }) => item.status)).toEqual(["DRAFT", "VALIDATED", "PUBLISHED"]);
    expect(response.json().items[0]).not.toHaveProperty("createdByAccountId");
    expect(response.json().items[0]).not.toHaveProperty("validationReport");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("ORDER BY effective_on DESC, created_at DESC, id DESC"))).toBe(true);
  });

  it.each(["EMPLOYEE", "FOUNDATION_BOARD"] as const)("rejects %s from listing revisions", async (principalType) => {
    const { response } = await request(principalType, "GET", "/admin/organization/designer/revisions");
    expect(response.statusCode).toBe(403);
  });

  it("returns an honest empty structure to Super Admin", async () => {
    const { response } = await request(
      "SUPER_ADMIN",
      "GET",
      "/admin/organization/designer?effectiveDate=2026-08-22",
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      viewDate: "2026-08-22",
      draft: null,
      nodes: [],
      positions: [],
    });
  });

  it("keeps LEGACY as the safe rollout default when no setting exists", async () => {
    const { response } = await request("SUPER_ADMIN", "GET", "/admin/organization/rollout");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      mode: "LEGACY",
      workflowKey: "LEAVE",
      organizationalNodeKey: null,
    });
  });

  it.each(["EMPLOYEE", "FOUNDATION_BOARD"] as const)(
    "rejects %s from reading or mutating organization structure",
    async (principalType) => {
      const read = await request(principalType, "GET", "/admin/organization/designer");
      const mutation = await request(principalType, "PATCH", "/admin/organization/rollout");
      expect(read.response.statusCode).toBe(403);
      expect(mutation.response.statusCode).toBe(403);
      expect(mutation.response.json()).toMatchObject({ code: "FORBIDDEN" });
      expect(
        mutation.query.mock.calls.some(([sql]) =>
          String(sql).includes("INSERT INTO organization_rollout_settings"),
        ),
      ).toBe(false);
    },
  );

  it("rejects a non-admin from reopening a validated revision", async () => {
    const { response, query } = await request(
      "EMPLOYEE",
      "POST",
      "/admin/organization/designer/drafts/00000000-0000-4000-8000-000000000010/reopen",
    );
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE organization_change_sets"))).toBe(false);
  });

  async function discardRevision(status: "DRAFT" | "VALIDATED" | "PUBLISHED") {
    const { pool: authPool } = createPool("SUPER_ADMIN");
    const transactionQuery = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT id FROM organization_change_sets") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "00000000-0000-4000-8000-000000000010" }], rowCount: 1 };
      }
      if (sql.includes("FROM organization_change_sets WHERE id")) {
        return { rows: [{
          id: "00000000-0000-4000-8000-000000000010", name: "Synthetic revision", effectiveOn: "2026-09-01",
          status, baseChangeSetId: null, validationReport: {}, createdByAccountId: "00000000-0000-4000-8000-000000000002",
          createdAt: new Date("2026-08-25T00:00:00.000Z"), validatedAt: null, publishedAt: null,
        }], rowCount: 1 };
      }
      if (sql.includes("FROM organization_") && sql.includes("change_set_id")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO organization_audit_events")) return { rows: [], rowCount: 1 };
      if (sql.includes("DELETE FROM organization_change_sets")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected discard SQL: ${sql}`);
    });
    const pool = {
      query: authPool.query.bind(authPool),
      connect: vi.fn(async () => ({ query: transactionQuery, release: vi.fn() })),
    } as unknown as Pool;
    const app = Fastify({ logger: false });
    await registerOrganizationAdminRoutes(app, pool, config);
    const response = await app.inject({
      method: "DELETE",
      url: "/admin/organization/designer/drafts/00000000-0000-4000-8000-000000000010",
      headers: { cookie: "hcis_session=synthetic" },
    });
    await app.close();
    return { response, transactionQuery };
  }

  it("allows hard discard only for DRAFT", async () => {
    const draft = await discardRevision("DRAFT");
    expect(draft.response.statusCode).toBe(204);
    expect(draft.transactionQuery.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM organization_change_sets"))).toBe(true);
  });

  it.each(["VALIDATED", "PUBLISHED"] as const)("rejects direct hard discard for %s", async (status) => {
    const result = await discardRevision(status);
    expect(result.response.statusCode).toBe(409);
    expect(result.transactionQuery.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM organization_change_sets"))).toBe(false);
  });

  it("rolls back a privileged mutation when its audit event fails", async () => {
    let rolloutPersisted = false;
    const transactionQuery = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (sql === "ROLLBACK") {
        rolloutPersisted = false;
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO organization_rollout_settings")) {
        rolloutPersisted = true;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO organization_audit_events")) {
        throw new Error("forced audit failure");
      }
      throw new Error(`Unexpected transaction SQL: ${sql}`);
    });
    const release = vi.fn();
    const { pool: authPool } = createPool("SUPER_ADMIN");
    const pool = {
      query: authPool.query.bind(authPool),
      connect: vi.fn(async () => ({ query: transactionQuery, release })),
    } as unknown as Pool;
    const app = Fastify({ logger: false });
    await registerOrganizationAdminRoutes(app, pool, config);

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/organization/rollout",
      headers: { cookie: "hcis_session=synthetic" },
      payload: { mode: "STRUCTURE", workflowKey: "leave.annual" },
    });
    await app.close();

    expect(response.statusCode).toBe(500);
    expect(rolloutPersisted).toBe(false);
    expect(transactionQuery.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO organization_rollout_settings"),
      expect.stringContaining("INSERT INTO organization_audit_events"),
      "ROLLBACK",
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
