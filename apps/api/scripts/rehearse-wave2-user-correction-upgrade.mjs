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
const schemaName = `wave2_user_correction_${randomUUID().replaceAll("-", "")}`;
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
    throw new Error(`migration ${file} failed during user-correction rehearsal`, { cause: error });
  }
}

async function expectCheckViolation(client, sql, params, message) {
  let rejected = false;
  try {
    await client.query(sql, params);
  } catch (error) {
    rejected = error?.code === "23514";
  }
  assert(rejected, message);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(`CREATE SCHEMA ${quotedSchema}`);
  await client.query(`SET search_path TO ${quotedSchema}, public`);

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const beforeCorrection = files.filter((name) => name <= "0029_attendance_adms_userinfo_query.sql");
  assert(beforeCorrection.at(-1) === "0029_attendance_adms_userinfo_query.sql", "0029 boundary not found");
  assert(files.includes("0030_attendance_adms_device_user_correction.sql"), "0030 user-correction migration not found");
  for (const file of beforeCorrection) await applyMigration(client, file);

  const employeeId = randomUUID();
  await client.query(
    `INSERT INTO employees (id, employee_number, full_name, status)
     VALUES ($1, 'W2-CORRECTION-EMP', 'Synthetic Correction Employee', 'active')`,
    [employeeId],
  );

  const deviceId = randomUUID();
  await client.query(
    `INSERT INTO attendance_adms_devices (
       id, serial_number, lifecycle, timezone, display_name, pre_registration_recovery_completed_at
     ) VALUES ($1, 'W2-CORRECTION-UPGRADE', 'active', 'Asia/Jakarta', 'Correction rehearsal', now())`,
    [deviceId],
  );

  const existingCommandId = randomUUID();
  await client.query(
    `INSERT INTO attendance_adms_commands (
       id, device_id, command_type, wire_command, reason, status, return_code, result_command, completed_at
     ) VALUES ($1, $2, 'query_user_info', 'DATA QUERY USERINFO PIN=0042', 'admin_query_user_info', 'succeeded', 0, 'DATA', now())`,
    [existingCommandId, deviceId],
  );

  await applyMigration(client, "0030_attendance_adms_device_user_correction.sql");

  const preserved = await client.query(
    `SELECT count(*)::int AS count
     FROM attendance_adms_commands
     WHERE id = $1
       AND command_type = 'query_user_info'
       AND wire_command = 'DATA QUERY USERINFO PIN=0042'
       AND status = 'succeeded'`,
    [existingCommandId],
  );
  assert(preserved.rows[0]?.count === 1, "0030 did not preserve existing USERINFO command state");

  const updateCommandId = randomUUID();
  const valid = await client.query(
    `INSERT INTO attendance_adms_commands (
       id, device_id, command_type, wire_command, reason, status, expires_at
     ) VALUES (
       $1, $2, 'update_user_info', 'DATA UPDATE USERINFO PIN=0042\tName=Synthetic Correction Employee',
       'admin_update_user_info', 'pending', now() + interval '15 minutes'
     )
     RETURNING wire_command`,
    [updateCommandId, deviceId],
  );
  assert(
    valid.rows[0]?.wire_command === "DATA UPDATE USERINFO PIN=0042\tName=Synthetic Correction Employee",
    "0030 rejected the narrow name-only USERINFO update",
  );
  await client.query(
    `UPDATE attendance_adms_commands
     SET status = 'succeeded', completed_at = now(), return_code = 0, result_command = 'DATA'
     WHERE id = $1`,
    [updateCommandId],
  );

  const invalidUpdateSql = `INSERT INTO attendance_adms_commands (
    id, device_id, command_type, wire_command, reason, status, expires_at
  ) VALUES ($1, $2, 'update_user_info', $3, 'admin_update_user_info', 'pending', now() + interval '15 minutes')`;

  await expectCheckViolation(
    client,
    invalidUpdateSql,
    [randomUUID(), deviceId, "DATA UPDATE USERINFO PIN=0042\tName=Synthetic\tPri=14"],
    "0030 unexpectedly allowed privilege mutation in USERINFO update",
  );
  await expectCheckViolation(
    client,
    invalidUpdateSql,
    [randomUUID(), deviceId, "DATA UPDATE USERINFO PIN=0043\tCard=1234"],
    "0030 unexpectedly allowed card-only USERINFO update",
  );
  await expectCheckViolation(
    client,
    invalidUpdateSql,
    [randomUUID(), deviceId, "DATA DELETE USERINFO PIN=0042"],
    "0030 unexpectedly allowed destructive user delete",
  );
  await expectCheckViolation(
    client,
    `INSERT INTO attendance_adms_commands (
       id, device_id, command_type, wire_command, reason, status, expires_at
     ) VALUES ($1, $2, 'query_user_info', $3, 'admin_query_user_info', 'pending', now() + interval '15 minutes')`,
    [randomUUID(), deviceId, "DATA UPDATE USERINFO PIN=0042\tName=Synthetic Correction Employee"],
    "0030 unexpectedly allowed query_user_info type to carry an update wire command",
  );

  const planId = randomUUID();
  await client.query(
    `INSERT INTO attendance_adms_device_user_corrections (
       id, device_id, employee_id, legacy_pin, intended_pin, reason, status, safe_metadata
     ) VALUES ($1, $2, $3, '0042', '0043', 'pin_typo', 'planned', '{"executionAllowed":false}'::jsonb)`,
    [planId, deviceId, employeeId],
  );
  const plan = await client.query(
    `SELECT legacy_pin AS "legacyPin", intended_pin AS "intendedPin", status
     FROM attendance_adms_device_user_corrections
     WHERE id = $1`,
    [planId],
  );
  assert(plan.rows[0]?.legacyPin === "0042", "legacy PIN leading zeroes were not preserved");
  assert(plan.rows[0]?.intendedPin === "0043", "intended PIN leading zeroes were not preserved");
  assert(plan.rows[0]?.status === "planned", "correction plan did not remain planning-only");

  await expectCheckViolation(
    client,
    `INSERT INTO attendance_adms_device_user_corrections (
       id, device_id, employee_id, legacy_pin, intended_pin, reason, status
     ) VALUES ($1, $2, $3, '0042', '0042', 'pin_typo', 'planned')`,
    [randomUUID(), deviceId, employeeId],
    "0030 unexpectedly allowed identical legacy and intended PIN",
  );

  process.stdout.write(`Wave 2 user-correction migration rehearsal passed in schema ${schemaName}\n`);
} finally {
  try {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  } finally {
    await client.end();
  }
}
