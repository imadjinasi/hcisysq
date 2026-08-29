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
const schemaName = `wave2_userinfo_${randomUUID().replaceAll("-", "")}`;
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
    throw new Error(`migration ${file} failed during USERINFO rehearsal`, { cause: error });
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
  const beforeUserInfo = files.filter((name) => name <= "0028_attendance_adms_biometric_lifecycle_guard.sql");
  assert(beforeUserInfo.at(-1) === "0028_attendance_adms_biometric_lifecycle_guard.sql", "0028 boundary not found");
  assert(files.includes("0029_attendance_adms_userinfo_query.sql"), "0029 USERINFO migration not found");
  for (const file of beforeUserInfo) await applyMigration(client, file);

  const deviceId = randomUUID();
  await client.query(
    `INSERT INTO attendance_adms_devices (
       id, serial_number, lifecycle, timezone, display_name, pre_registration_recovery_completed_at
     ) VALUES ($1, 'W2-USERINFO-UPGRADE', 'active', 'Asia/Jakarta', 'USERINFO rehearsal', now())`,
    [deviceId],
  );

  const existingCommandId = randomUUID();
  await client.query(
    `INSERT INTO attendance_adms_commands (
       id, device_id, command_type, wire_command, reason, status, return_code, result_command, completed_at
     ) VALUES ($1, $2, 'read_info', 'INFO', 'admin_read_information', 'succeeded', 0, 'INFO', now())`,
    [existingCommandId, deviceId],
  );

  await applyMigration(client, "0029_attendance_adms_userinfo_query.sql");

  const preserved = await client.query(
    `SELECT count(*)::int AS count
     FROM attendance_adms_commands
     WHERE id = $1
       AND command_type = 'read_info'
       AND wire_command = 'INFO'
       AND status = 'succeeded'`,
    [existingCommandId],
  );
  assert(preserved.rows[0]?.count === 1, "0029 did not preserve existing Wave 2 command state");

  const validCommandId = randomUUID();
  const valid = await client.query(
    `INSERT INTO attendance_adms_commands (
       id, device_id, command_type, wire_command, reason, status, expires_at
     ) VALUES (
       $1, $2, 'query_user_info', 'DATA QUERY USERINFO PIN=0042',
       'admin_query_user_info', 'pending', now() + interval '15 minutes'
     )
     RETURNING wire_command`,
    [validCommandId, deviceId],
  );
  assert(valid.rows[0]?.wire_command === "DATA QUERY USERINFO PIN=0042", "single-PIN USERINFO command was not accepted");
  await client.query(
    `UPDATE attendance_adms_commands
     SET status = 'succeeded', completed_at = now(), return_code = 0, result_command = 'DATA'
     WHERE id = $1`,
    [validCommandId],
  );

  const invalidUserInfoSql = `INSERT INTO attendance_adms_commands (
    id, device_id, command_type, wire_command, reason, status, expires_at
  ) VALUES ($1, $2, 'query_user_info', $3, 'admin_query_user_info', 'pending', now() + interval '15 minutes')`;

  await expectCheckViolation(
    client,
    invalidUserInfoSql,
    [randomUUID(), deviceId, "DATA QUERY USERINFO"],
    "0029 unexpectedly allowed full USERINFO roster dump",
  );
  await expectCheckViolation(
    client,
    invalidUserInfoSql,
    [randomUUID(), deviceId, "DATA QUERY FINGERTMP PIN=0042"],
    "0029 unexpectedly allowed fingerprint-template query",
  );
  await expectCheckViolation(
    client,
    invalidUserInfoSql,
    [randomUUID(), deviceId, "DATA QUERY USERINFO PIN=AB42"],
    "0029 unexpectedly allowed non-numeric USERINFO PIN",
  );

  const mismatchedShapeSql = `INSERT INTO attendance_adms_commands (
    id, device_id, command_type, wire_command, reason, status, expires_at
  ) VALUES ($1, $2, $3, $4, $5, 'pending', now() + interval '15 minutes')`;
  await expectCheckViolation(
    client,
    mismatchedShapeSql,
    [randomUUID(), deviceId, "read_info", "DATA QUERY USERINFO PIN=0042", "admin_read_information"],
    "0029 unexpectedly allowed read_info type to carry USERINFO wire command",
  );
  await expectCheckViolation(
    client,
    mismatchedShapeSql,
    [randomUUID(), deviceId, "query_user_info", "INFO", "admin_query_user_info"],
    "0029 unexpectedly allowed query_user_info type to carry INFO wire command",
  );
  await expectCheckViolation(
    client,
    mismatchedShapeSql,
    [randomUUID(), deviceId, "query_user_info", "DATA QUERY USERINFO PIN=0042", "admin_read_information"],
    "0029 unexpectedly allowed USERINFO wire command with read-info reason",
  );

  process.stdout.write(`Wave 2 USERINFO migration rehearsal passed in schema ${schemaName}\n`);
} finally {
  try {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  } finally {
    await client.end();
  }
}
