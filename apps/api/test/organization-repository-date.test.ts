import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  PostgresOrganizationRepository,
  type OrganizationQueryable,
} from "../src/modules/organization/repository.js";

function result<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

describe("PostgresOrganizationRepository calendar dates", () => {
  it("preserves Jakarta DATE columns instead of drifting to the previous UTC day", async () => {
    const jakartaMidnight = new Date("2026-08-22T17:00:00.000Z");
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM organization_change_sets")) {
        return result([{
          id: "00000000-0000-4000-8000-000000000001",
          name: "Synthetic date regression",
          effectiveOn: jakartaMidnight,
          status: "DRAFT",
          baseChangeSetId: null,
          validationReport: {},
          createdByAccountId: "00000000-0000-4000-8000-000000000002",
          createdAt: new Date("2026-08-22T17:00:00.000Z"),
          validatedAt: null,
          publishedAt: null,
        }]);
      }
      if (sql.includes("FROM organization_nodes")) {
        return result([{
          id: "00000000-0000-4000-8000-000000000003",
          stableKey: "00000000-0000-4000-8000-000000000004",
          name: "Synthetic node",
          nodeType: "UNIT",
          parentNodeKey: null,
          active: true,
          effectiveFrom: jakartaMidnight,
          effectiveTo: null,
          visualRankOffset: 0,
          integrationCode: null,
        }]);
      }
      return result([]);
    });
    const repository = new PostgresOrganizationRepository({ query } as OrganizationQueryable);

    const snapshot = await repository.loadChangeSetSnapshot(
      "00000000-0000-4000-8000-000000000001",
    );

    expect(snapshot?.changeSet.effectiveOn).toBe("2026-08-23");
    expect(snapshot?.nodes[0]?.effectiveFrom).toBe("2026-08-23");
  });

  it("locks the change-set row before loading any editable snapshot rows", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("SELECT id FROM organization_change_sets") && sql.includes("FOR UPDATE")) {
        return result([{ id: "00000000-0000-4000-8000-000000000001" }]);
      }
      if (sql.includes("FROM organization_change_sets")) {
        return result([{
          id: "00000000-0000-4000-8000-000000000001",
          name: "Locked draft",
          effectiveOn: "2026-08-23",
          status: "DRAFT",
          baseChangeSetId: null,
          validationReport: {},
          createdByAccountId: "00000000-0000-4000-8000-000000000002",
          createdAt: new Date("2026-08-23T00:00:00.000Z"),
          validatedAt: null,
          publishedAt: null,
        }]);
      }
      return result([]);
    });
    const repository = new PostgresOrganizationRepository({ query } as OrganizationQueryable);

    await repository.loadEditableSnapshotForUpdate("00000000-0000-4000-8000-000000000001");

    expect(calls[0]).toContain("FOR UPDATE");
    expect(calls[1]).toContain("FROM organization_change_sets");
    expect(calls.slice(2).some((sql) => sql.includes("organization_nodes"))).toBe(true);
  });

  it("uses deterministic same-day published revision ordering", async () => {
    let effectiveQuery = "";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("status = 'PUBLISHED'")) effectiveQuery = sql.replace(/\s+/g, " ");
      return result([]);
    });
    const repository = new PostgresOrganizationRepository({ query } as OrganizationQueryable);

    await repository.loadEffectiveSnapshot("2026-08-23");

    expect(effectiveQuery).toContain(
      "ORDER BY effective_on DESC, published_at DESC, created_at DESC, id DESC",
    );
  });
});
