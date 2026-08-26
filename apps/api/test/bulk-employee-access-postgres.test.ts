import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountActivationService } from "../src/modules/auth/account-activation.js";
import { BulkEmployeeAccessService } from "../src/modules/employees/bulk-employee-access.js";

const databaseUrl = process.env.HCIS_TEST_DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));
const schema = `bulk_access_${randomUUID().replaceAll("-", "")}`;
let setupPool: Pool;
let pool: Pool;
let schemaCreated = false;

const actorId = "90000000-0000-4000-8000-000000000001";
const validEmployeeId = "10000000-0000-4000-8000-000000000001";
const invitedEmployeeId = "10000000-0000-4000-8000-000000000002";
const missingEmailEmployeeId = "10000000-0000-4000-8000-000000000003";
const inactiveEmployeeId = "10000000-0000-4000-8000-000000000004";
const suspendedEmployeeId = "10000000-0000-4000-8000-000000000005";
const activeEmployeeId = "10000000-0000-4000-8000-000000000006";

integration("Bulk employee access PostgreSQL write path", () => {
  beforeAll(async () => {
    setupPool = new Pool({ connectionString: databaseUrl });
    await setupPool.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await pool.query(`
      CREATE TABLE employees (
        id uuid PRIMARY KEY,
        employee_number text NOT NULL UNIQUE,
        full_name text NOT NULL,
        status text NOT NULL,
        email text NULL,
        removed_at timestamptz NULL
      );
      CREATE TABLE accounts (
        id uuid PRIMARY KEY,
        employee_id uuid NULL REFERENCES employees(id),
        email text NOT NULL,
        principal_type text NOT NULL,
        status text NOT NULL,
        password_hash text NULL,
        password_changed_at timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX accounts_email_lower_unique ON accounts(lower(email));
      CREATE UNIQUE INDEX accounts_employee_unique ON accounts(employee_id) WHERE employee_id IS NOT NULL;
      CREATE TABLE account_activation_tokens (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES accounts(id),
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz NULL,
        revoked_at timestamptz NULL,
        issued_by_account_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX account_activation_tokens_one_active_idx
        ON account_activation_tokens(account_id)
        WHERE consumed_at IS NULL AND revoked_at IS NULL;
      CREATE TABLE access_audit_events (
        id uuid PRIMARY KEY,
        actor_account_id uuid NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        occurred_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE auth_sessions (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL,
        revoked_at timestamptz NULL
      );
      CREATE TABLE auth_audit_events (
        id uuid PRIMARY KEY,
        account_id uuid NULL,
        event_type text NOT NULL,
        email text NULL,
        ip_address text NULL,
        user_agent text NULL,
        occurred_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await pool.query(
      `INSERT INTO employees (id, employee_number, full_name, status, email) VALUES
       ($1,'EMP-001','Valid No Account','active','valid@example.invalid'),
       ($2,'EMP-002','Existing Invitation','active','invited@example.invalid'),
       ($3,'EMP-003','Missing Email','active',NULL),
       ($4,'EMP-004','Inactive Employee','inactive','inactive@example.invalid'),
       ($5,'EMP-005','Suspended Account','active','suspended@example.invalid'),
       ($6,'EMP-006','Active Account','active','active@example.invalid')`,
      [validEmployeeId, invitedEmployeeId, missingEmailEmployeeId, inactiveEmployeeId, suspendedEmployeeId, activeEmployeeId],
    );
    await pool.query(
      `INSERT INTO accounts (id, employee_id, email, principal_type, status, password_hash) VALUES
       ($1,$2,'invited@example.invalid','EMPLOYEE','invited',NULL),
       ($3,$4,'suspended@example.invalid','EMPLOYEE','suspended','synthetic-hash'),
       ($5,$6,'active@example.invalid','EMPLOYEE','active','synthetic-hash')`,
      [randomUUID(), invitedEmployeeId, randomUUID(), suspendedEmployeeId, randomUUID(), activeEmployeeId],
    );
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (setupPool && schemaCreated) {
      await setupPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    if (setupPool) {
      await setupPool.end();
    }
  });

  it("prepares valid rows per item, rotates tokens, audits, and requires employee password activation", async () => {
    const service = new BulkEmployeeAccessService(pool);
    const first = await service.prepare([
      activeEmployeeId,
      invitedEmployeeId,
      validEmployeeId,
      missingEmailEmployeeId,
      inactiveEmployeeId,
      suspendedEmployeeId,
    ], actorId);

    expect(first.summary).toMatchObject({
      alreadyActive: 1,
      accountsPrepared: 1,
      activationInvitationsIssuedOrReissued: 2,
      skippedInactiveOrResigned: 1,
      suspendedUnchanged: 1,
      requiresReview: 1,
      failed: 0,
    });
    const prepared = first.items.find((item) => item.employeeId === validEmployeeId)!;
    expect(prepared).toMatchObject({
      action: "ACCOUNT_PREPARED_AND_INVITATION_ISSUED",
      resultingAccountStatus: "invited",
    });
    expect(prepared.activationPath).toContain("/activate#token=");

    const beforeActivation = await pool.query<{ status: string; passwordSet: boolean; accountId: string }>(
      `SELECT status, (password_hash IS NOT NULL) AS "passwordSet", id AS "accountId"
       FROM accounts WHERE employee_id=$1`,
      [validEmployeeId],
    );
    expect(beforeActivation.rows[0]).toMatchObject({ status: "invited", passwordSet: false });

    const second = await service.prepare([validEmployeeId], actorId);
    expect(second.items[0]?.action).toBe("INVITATION_ISSUED");
    const tokenState = await pool.query<{ total: number; active: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE consumed_at IS NULL AND revoked_at IS NULL)::int AS active
       FROM account_activation_tokens WHERE account_id=$1`,
      [beforeActivation.rows[0]!.accountId],
    );
    expect(tokenState.rows[0]).toEqual({ total: 2, active: 1 });

    const token = second.items[0]!.activationPath!.split("token=")[1]!;
    await new AccountActivationService(pool).activate(token, "employee-owned-password", {
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });
    const afterActivation = await pool.query<{ status: string; passwordSet: boolean }>(
      `SELECT status, (password_hash IS NOT NULL) AS "passwordSet" FROM accounts WHERE employee_id=$1`,
      [validEmployeeId],
    );
    expect(afterActivation.rows[0]).toEqual({ status: "active", passwordSet: true });
    expect((await service.prepare([validEmployeeId], actorId)).items[0]?.action).toBe("ALREADY_ACTIVE");

    const audits = await pool.query<{ action: string; payload: Record<string, unknown> }>(
      `SELECT action, payload FROM access_audit_events ORDER BY occurred_at`,
    );
    expect(audits.rows.map((row) => row.action)).toEqual(expect.arrayContaining([
      "employee.account.prepared",
      "account.activation.issued",
      "employee.access.bulk.item",
      "employee.access.bulk.completed",
    ]));
    expect(JSON.stringify(audits.rows)).not.toContain("token=");
  }, 20_000);
});
