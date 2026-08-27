import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  OidcIdentityMappingService,
} from "../src/modules/auth/oidc-identity-mapping.js";

const account = {
  id: "00000000-0000-4000-8000-000000000010",
  email: "synthetic.employee@example.org",
  principalType: "EMPLOYEE" as const,
  status: "active" as const,
  identityIssuer: null as string | null,
  identitySubject: null as string | null,
};

const identity = {
  issuer: "https://login-staging.sabilulquran.or.id/realms/sq-staff-staging",
  subject: "synthetic-keycloak-subject-001",
};

function clientFrom(query: ReturnType<typeof vi.fn>) {
  return { query } as unknown as Pick<PoolClient, "query">;
}

describe("OidcIdentityMappingService", () => {
  it("previews a new mapping without writing", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounts") && sql.includes("WHERE id = $1")) {
        return { rows: [account], rowCount: 1 };
      }
      if (sql.includes("identity_issuer = $1")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const service = new OidcIdentityMappingService(clientFrom(query));

    const result = await service.map({
      accountId: account.id,
      ...identity,
      apply: false,
    });

    expect(result.status).toBe("would_map");
    expect(result.nextIdentity).toEqual(identity);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE accounts"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("auth_audit_events"))).toBe(false);
  });

  it("applies a new mapping and writes an audit event", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounts") && sql.includes("WHERE id = $1")) {
        return { rows: [account], rowCount: 1 };
      }
      if (sql.includes("identity_issuer = $1")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
    const service = new OidcIdentityMappingService(clientFrom(query));

    const result = await service.map({
      accountId: account.id,
      ...identity,
      apply: true,
    });

    expect(result.status).toBe("mapped");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("pg_advisory_xact_lock"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE accounts"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("auth_audit_events"))).toBe(true);
  });

  it("requires explicit replacement when the account already has another identity", async () => {
    const mappedAccount = {
      ...account,
      identityIssuer: identity.issuer,
      identitySubject: "old-subject",
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounts") && sql.includes("WHERE id = $1")) {
        return { rows: [mappedAccount], rowCount: 1 };
      }
      if (sql.includes("identity_issuer = $1")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const service = new OidcIdentityMappingService(clientFrom(query));

    await expect(
      service.map({
        accountId: account.id,
        ...identity,
        apply: true,
      }),
    ).rejects.toMatchObject({ code: "REPLACE_REQUIRED" });

    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE accounts"))).toBe(false);
  });

  it("refuses an identity already assigned to a different account", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounts") && sql.includes("WHERE id = $1")) {
        return { rows: [account], rowCount: 1 };
      }
      if (sql.includes("identity_issuer = $1")) {
        return {
          rows: [{ id: "00000000-0000-4000-8000-000000000099" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const service = new OidcIdentityMappingService(clientFrom(query));

    await expect(
      service.map({ accountId: account.id, ...identity, apply: false }),
    ).rejects.toMatchObject({ code: "IDENTITY_ALREADY_ASSIGNED" });
  });

  it("previews and applies clearing an existing mapping", async () => {
    const mappedAccount = {
      ...account,
      identityIssuer: identity.issuer,
      identitySubject: identity.subject,
    };
    const previewQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounts")) return { rows: [mappedAccount], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const preview = new OidcIdentityMappingService(clientFrom(previewQuery));

    await expect(preview.clear({ accountId: account.id, apply: false })).resolves.toMatchObject({
      status: "would_clear",
      previousIdentity: identity,
      nextIdentity: null,
    });
    expect(previewQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE accounts"))).toBe(false);

    const applyQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounts")) return { rows: [mappedAccount], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const apply = new OidcIdentityMappingService(clientFrom(applyQuery));
    await expect(apply.clear({ accountId: account.id, apply: true })).resolves.toMatchObject({
      status: "cleared",
      nextIdentity: null,
    });
    expect(applyQuery.mock.calls.some(([sql]) => String(sql).includes("UPDATE accounts"))).toBe(true);
  });
});
