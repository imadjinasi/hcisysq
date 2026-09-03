import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../migrations");
const schemaName = `org004_upgrade_${randomUUID().replaceAll("-", "")}`;
const quotedSchema = `"${schemaName.replaceAll('"', '""')}"`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function applyMigration(client, file) {
  const sql = await readFile(join(migrationsDir, file), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`migration ${file} failed during ORG-004 rehearsal`, { cause: error });
  }
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(`CREATE SCHEMA ${quotedSchema}`);
  await client.query(`SET search_path TO ${quotedSchema}, public`);

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const legacyFiles = files.filter((name) => name <= "0018_payslip_published_immutability.sql");
  assert(
    legacyFiles.at(-1) === "0018_payslip_published_immutability.sql",
    "Pre-ORG-004 migration boundary not found",
  );
  assert(files.includes("0019_dynamic_organization.sql"), "ORG-004 migration not found");

  for (const file of legacyFiles) await applyMigration(client, file);

  const unitId = randomUUID();
  const positionId = randomUUID();
  const requesterId = randomUUID();
  const managerId = randomUUID();
  const unitApproverId = randomUUID();
  const managerAccountId = randomUUID();
  const requestId = randomUUID();
  const managerStepId = randomUUID();
  const unitStepId = randomUUID();
  const legacyValidationSummary = {
    policyVersion: "ORG004-UPGRADE-REHEARSAL",
    authorityResolution: { source: "ORG-002" },
  };

  await client.query(
    `INSERT INTO organizational_units (id, normalized_name, name)
     VALUES ($1, 'org004 upgrade unit', 'ORG-004 Upgrade Unit')`,
    [unitId],
  );
  await client.query(
    `INSERT INTO positions (id, normalized_name, name)
     VALUES ($1, 'org004 upgrade position', 'ORG-004 Upgrade Position')`,
    [positionId],
  );
  await client.query(
    `INSERT INTO employees (
       id, employee_number, full_name, status, organizational_unit_id,
       position_id, direct_manager_employee_id
     ) VALUES
       ($1, 'ORG004-UPGRADE-REQUESTER', 'Synthetic Upgrade Requester', 'active', $4, $5, $2),
       ($2, 'ORG004-UPGRADE-MANAGER', 'Synthetic Upgrade Manager', 'active', $4, $5, $3),
       ($3, 'ORG004-UPGRADE-APPROVER', 'Synthetic Upgrade Unit Approver', 'active', $4, $5, NULL)`,
    [requesterId, managerId, unitApproverId, unitId, positionId],
  );
  await client.query(
    `UPDATE organizational_units SET leave_approver_employee_id = $2 WHERE id = $1`,
    [unitId, unitApproverId],
  );
  await client.query(
    `INSERT INTO accounts (id, employee_id, email, principal_type, status)
     VALUES ($1, $2, 'org004-upgrade-manager@example.invalid', 'EMPLOYEE', 'active')`,
    [managerAccountId, managerId],
  );
  await client.query(
    `INSERT INTO leave_requests (
       id, employee_id, policy_key, status, start_on, end_on, working_days,
       reason, annual_period_key, annual_entitlement_days, annual_period_limit_days,
       annual_available_before, hc_handling, idempotency_key, validation_summary
     ) VALUES (
       $1, $2, 'annual', 'in_review', DATE '2026-09-07', DATE '2026-09-07', 1,
       'Synthetic migration rehearsal', 'JUL_SEP', 12, 3, 3,
       'notify', 'org004-upgrade-request', $3::jsonb
     )`,
    [requestId, requesterId, JSON.stringify(legacyValidationSummary)],
  );
  await client.query(
    `INSERT INTO leave_request_approval_steps (
       id, leave_request_id, step_order, approver_employee_id, sources, status
     ) VALUES
       ($1, $3, 1, $4, ARRAY['DIRECT_MANAGER'], 'approved'),
       ($2, $3, 2, $5, ARRAY['UNIT_APPROVER'], 'pending')`,
    [managerStepId, unitStepId, requestId, managerId, unitApproverId],
  );

  await applyMigration(client, "0019_dynamic_organization.sql");

  const preserved = await client.query(
    `SELECT
       (SELECT direct_manager_employee_id = $2 FROM employees WHERE id = $1) AS manager_preserved,
       (SELECT leave_approver_employee_id = $3 FROM organizational_units WHERE id = $4) AS approver_preserved,
       (SELECT validation_summary = $5::jsonb FROM leave_requests WHERE id = $6) AS snapshot_preserved,
       (SELECT array_agg(approver_employee_id ORDER BY step_order) = ARRAY[$2, $3]::uuid[]
          FROM leave_request_approval_steps WHERE leave_request_id = $6) AS chain_preserved,
       (SELECT count(*)::int FROM organization_rollout_settings) AS rollout_count,
       (SELECT count(*)::int FROM organization_change_sets) AS change_set_count`,
    [
      requesterId,
      managerId,
      unitApproverId,
      unitId,
      JSON.stringify(legacyValidationSummary),
      requestId,
    ],
  );
  const row = preserved.rows[0];
  assert(row?.manager_preserved === true, "ORG-002 direct manager was rewritten");
  assert(row?.approver_preserved === true, "ORG-002 Unit Approver was rewritten");
  assert(row?.snapshot_preserved === true, "Submitted Leave resolution metadata was rewritten");
  assert(row?.chain_preserved === true, "Submitted Leave approval chain was rewritten");
  assert(row?.rollout_count === 0, "ORG-004 migration unexpectedly activated rollout");
  assert(row?.change_set_count === 0, "ORG-004 migration unexpectedly seeded structure data");

  const orgTables = await client.query(
    `SELECT
       to_regclass('organization_change_sets')::text AS change_sets,
       to_regclass('organization_nodes')::text AS nodes,
       to_regclass('organization_positions')::text AS positions,
       to_regclass('organization_rollout_settings')::text AS rollout,
       to_regclass('organization_audit_events')::text AS audit`,
  );
  for (const [key, value] of Object.entries(orgTables.rows[0])) {
    assert(typeof value === "string" && value.length > 0, `ORG-004 table missing: ${key}`);
  }

  process.stdout.write(`Pre-ORG-004 -> ORG-004 migration rehearsal passed in schema ${schemaName}\n`);
} finally {
  try {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  } finally {
    await client.end();
  }
}
