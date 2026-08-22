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
});
