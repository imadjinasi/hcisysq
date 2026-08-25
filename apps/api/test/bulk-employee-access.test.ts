import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  BulkEmployeeAccessService,
  classifyBulkEmployeeAccess,
  type EmployeeAccessCandidate,
} from "../src/modules/employees/bulk-employee-access.js";

const employeeId = "10000000-0000-4000-8000-000000000001";
const accountId = "20000000-0000-4000-8000-000000000001";
const actorId = "30000000-0000-4000-8000-000000000001";

function candidate(overrides: Partial<EmployeeAccessCandidate> = {}): EmployeeAccessCandidate {
  return {
    employeeId,
    employeeNumber: "EMP-001",
    employeeName: "Pegawai Sintetis",
    employeeStatus: "active",
    employeeEmail: "pegawai@example.invalid",
    employeeEmailCount: 1,
    conflictingAccountEmailCount: 0,
    employeeAccountCount: 0,
    accountId: null,
    accountStatus: null,
    accountPasswordSet: false,
    ...overrides,
  };
}

describe("bulk employee access classification", () => {
  it("keeps an active account as a no-op", () => {
    expect(classifyBulkEmployeeAccess(candidate({
      employeeAccountCount: 1,
      accountId,
      accountStatus: "active",
      accountPasswordSet: true,
    })).category).toBe("ALREADY_ACTIVE");
  });

  it("reissues an invitation without marking invited as active", () => {
    const result = classifyBulkEmployeeAccess(candidate({
      employeeAccountCount: 1,
      accountId,
      accountStatus: "invited",
    }));
    expect(result.category).toBe("INVITATION_REQUIRED");
    expect(result.accountStatus).toBe("invited");
  });

  it("prepares a missing account only with a valid unique email", () => {
    expect(classifyBulkEmployeeAccess(candidate()).category).toBe("ACCOUNT_PREPARATION_REQUIRED");
    expect(classifyBulkEmployeeAccess(candidate({ employeeEmail: null }))).toMatchObject({
      category: "REQUIRES_REVIEW",
      reasonCode: "EMPLOYEE_EMAIL_REQUIRED",
    });
    expect(classifyBulkEmployeeAccess(candidate({ employeeEmailCount: 2 }))).toMatchObject({
      category: "REQUIRES_REVIEW",
      reasonCode: "EMPLOYEE_EMAIL_DUPLICATE",
    });
    expect(classifyBulkEmployeeAccess(candidate({ conflictingAccountEmailCount: 1 }))).toMatchObject({
      category: "REQUIRES_REVIEW",
      reasonCode: "ACCOUNT_EMAIL_CONFLICT",
    });
  });

  it.each(["inactive", "resigned"] as const)("skips an %s employee", (employeeStatus) => {
    expect(classifyBulkEmployeeAccess(candidate({ employeeStatus })).category)
      .toBe("SKIPPED_EMPLOYEE_NOT_ACTIVE");
  });

  it("never silently activates a suspended account", () => {
    expect(classifyBulkEmployeeAccess(candidate({
      employeeAccountCount: 1,
      accountId,
      accountStatus: "suspended",
      accountPasswordSet: true,
    })).category).toBe("SUSPENDED_UNCHANGED");
  });

  it("reactivates only a previously activated inactive account", () => {
    expect(classifyBulkEmployeeAccess(candidate({
      employeeAccountCount: 1,
      accountId,
      accountStatus: "inactive",
      accountPasswordSet: true,
    })).category).toBe("SAFE_REACTIVATION");
    expect(classifyBulkEmployeeAccess(candidate({
      employeeAccountCount: 1,
      accountId,
      accountStatus: "inactive",
      accountPasswordSet: false,
    })).category).toBe("REQUIRES_REVIEW");
  });
});

describe("BulkEmployeeAccessService", () => {
  it("rotates an invited account token transactionally, audits it, and leaves status invited", async () => {
    const transactionQuery = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("FROM employees WHERE id = $1 FOR UPDATE")) {
        return { rows: [candidate()], rowCount: 1 };
      }
      if (sql.includes("FROM accounts\n     WHERE employee_id")) {
        return { rows: [{ accountId, accountStatus: "invited", accountPasswordSet: false }], rowCount: 1 };
      }
      if (sql.includes("AS \"employeeEmailCount\"")) {
        return { rows: [{ employeeEmailCount: 1, conflictingAccountEmailCount: 0 }], rowCount: 1 };
      }
      if (sql.includes("FROM accounts account")) {
        return {
          rows: [{
            id: accountId,
            principalType: "EMPLOYEE",
            status: "invited",
            employeeStatus: "active",
            passwordHash: null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("UPDATE account_activation_tokens")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO account_activation_tokens")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO access_audit_events")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const client = { query: transactionQuery, release: vi.fn() };
    const poolQuery = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO access_audit_events")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected pool SQL: ${sql}`);
    });
    const pool = {
      connect: vi.fn(async () => client),
      query: poolQuery,
    } as unknown as Pool;
    const service = new BulkEmployeeAccessService(pool);

    const first = await service.prepare([employeeId], actorId);
    const second = await service.prepare([employeeId], actorId);

    expect(first.items[0]).toMatchObject({
      action: "INVITATION_ISSUED",
      resultingAccountStatus: "invited",
    });
    expect(second.items[0]?.action).toBe("INVITATION_ISSUED");
    expect(transactionQuery.mock.calls.filter(([sql]) =>
      String(sql).includes("UPDATE account_activation_tokens"))).toHaveLength(2);
    expect(transactionQuery.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO account_activation_tokens"))).toHaveLength(2);
    expect(transactionQuery.mock.calls.some(([sql]) =>
      String(sql).includes("SET status = 'active'"))).toBe(false);

    const auditPayloads = transactionQuery.mock.calls
      .filter(([sql]) => String(sql).includes("INSERT INTO access_audit_events"))
      .map(([, params]) => String((params as unknown[])?.[5] ?? ""));
    expect(auditPayloads.some((payload) => payload.includes("bulkOperationId"))).toBe(true);
    expect(auditPayloads.every((payload) => !payload.includes("token="))).toBe(true);
  });
});
