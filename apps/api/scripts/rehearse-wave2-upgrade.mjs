import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../migrations");
const schemaName = `wave2_upgrade_${randomUUID().replaceAll("-", "")}`;
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
    throw new Error(`migration ${file} failed during Wave 2 rehearsal`, { cause: error });
  }
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(`CREATE SCHEMA ${quotedSchema}`);
  await client.query(`SET search_path TO ${quotedSchema}, public`);

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const wave1Files = files.filter((name) => name <= "0025_attendance_adms_wave1_core.sql");
  assert(wave1Files.at(-1) === "0025_attendance_adms_wave1_core.sql", "Wave 1 migration boundary not found");
  assert(files.includes("0026_attendance_adms_wave2_control_plane.sql"), "Wave 2 migration not found");

  for (const file of wave1Files) await applyMigration(client, file);

  const employeeId = randomUUID();
  const deviceId = randomUUID();
  const requestId = randomUUID();
  const mappingId = randomUUID();
  const commandId = randomUUID();
  const commandEventId = randomUUID();

  await client.query(
    `INSERT INTO employees (id, employee_number, full_name, status)
     VALUES ($1, 'W2-UPGRADE-0001', 'Wave 2 Upgrade Rehearsal', 'active')`,
    [employeeId],
  );
  await client.query(
    `INSERT INTO attendance_adms_devices (
       id, serial_number, lifecycle, timezone, display_name,
       first_seen_at, last_seen_at, last_successful_request_at, last_ip
     ) VALUES (
       $1, 'W2-UPGRADE-DEVICE', 'active', 'Asia/Jakarta', 'Wave 1 seeded device',
       now() - interval '2 days', now() - interval '1 minute', now() - interval '1 minute', '192.0.2.10'
     )`,
    [deviceId],
  );
  const wave1Body = Buffer.from("0042\t2026-08-28 07:00:00\t0\t1\t0\t0\t0\t0\t0\t0\t0\n", "utf8");
  await client.query(
    `INSERT INTO attendance_adms_request_journal (
       id, device_id, serial_candidate_hash, method, path, raw_query,
       content_type, source_ip, safe_metadata, body, body_sha256,
       body_byte_length, body_captured, classification, response_status,
       response_body, received_at
     ) VALUES (
       $1, $2, repeat('a', 64), 'POST', '/iclock/cdata', '?SN=W2-UPGRADE-DEVICE&table=ATTLOG&Stamp=17',
       'text/plain', '192.0.2.10', '{}'::jsonb, $3, repeat('b', 64),
       $4, true, 'attlog', 200, 'OK: 1', now() - interval '1 hour'
     )`,
    [requestId, deviceId, wave1Body, wave1Body.length],
  );
  await client.query(
    `INSERT INTO attendance_adms_employee_mappings (
       id, device_id, pin, employee_id, effective_from
     ) VALUES ($1, $2, '0042', $3, now() - interval '30 days')`,
    [mappingId, deviceId, employeeId],
  );
  await client.query(
    `INSERT INTO attendance_adms_commands (
       id, device_id, command_type, wire_command, dedupe_key, reason, status, expires_at
     ) VALUES ($1, $2, 'sync_new', 'LOG', 'wave2-upgrade-rehearsal', 'registration_recovery', 'pending', now() + interval '1 hour')`,
    [commandId, deviceId],
  );
  await client.query(
    `INSERT INTO attendance_adms_command_events (id, command_id, event_type, metadata)
     VALUES ($1, $2, 'queued', '{"seed":"wave1"}'::jsonb)`,
    [commandEventId, commandId],
  );

  await applyMigration(client, "0026_attendance_adms_wave2_control_plane.sql");

  const preserved = await client.query(
    `SELECT
       (SELECT count(*)::int FROM employees WHERE id = $1) AS employee_count,
       (SELECT count(*)::int FROM attendance_adms_devices WHERE id = $2 AND serial_number = 'W2-UPGRADE-DEVICE') AS device_count,
       (SELECT count(*)::int FROM attendance_adms_request_journal WHERE id = $3 AND body IS NOT NULL AND body_captured = true) AS request_count,
       (SELECT count(*)::int FROM attendance_adms_employee_mappings WHERE id = $4 AND pin = '0042') AS mapping_count,
       (SELECT count(*)::int FROM attendance_adms_commands WHERE id = $5 AND command_type = 'sync_new' AND wire_command = 'LOG' AND status = 'pending') AS command_count,
       (SELECT count(*)::int FROM attendance_adms_command_events WHERE id = $6 AND event_type = 'queued') AS event_count`,
    [employeeId, deviceId, requestId, mappingId, commandId, commandEventId],
  );
  const row = preserved.rows[0];
  for (const [key, value] of Object.entries(row)) {
    assert(value === 1, `Wave 1 state was not preserved: ${key}=${String(value)}`);
  }

  const wave2Tables = await client.query(
    `SELECT
       to_regclass('attendance_adms_device_roster_entries')::text AS roster,
       to_regclass('attendance_biometric_credentials')::text AS credentials,
       to_regclass('attendance_biometric_device_states')::text AS device_states,
       to_regclass('attendance_biometric_audit_events')::text AS audit`,
  );
  for (const [key, value] of Object.entries(wave2Tables.rows[0])) {
    assert(typeof value === "string" && value.length > 0, `Wave 2 table missing after upgrade: ${key}`);
  }

  const sourceRequestColumn = await client.query(
    `SELECT count(*)::int AS count
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = 'attendance_biometric_credentials'
       AND column_name = 'source_request_id'`,
    [schemaName],
  );
  assert(sourceRequestColumn.rows[0].count === 1, "Wave 2 source_request_id provenance column missing");

  await client.query(
    `INSERT INTO attendance_adms_device_roster_entries (
       id, device_id, pin, display_name, source_request_id, first_seen_at, last_seen_at
     ) VALUES ($1, $2, '0042', 'Wave 1 mapped user', $3, now(), now())`,
    [randomUUID(), deviceId, requestId],
  );

  let invalidEnvelopeRejected = false;
  try {
    await client.query(
      `INSERT INTO attendance_biometric_credentials (
         id, employee_id, modality, slot_index, vendor_format, origin_device_id,
         source_request_id, source_pin, lifecycle
       ) VALUES ($1, $2, 'fingerprint', 1, 'synthetic-upgrade-check', $3, $4, '0042', 'active')`,
      [randomUUID(), employeeId, deviceId, requestId],
    );
  } catch (error) {
    invalidEnvelopeRejected = error?.code === "23514";
  }
  assert(invalidEnvelopeRejected, "Wave 2 encrypted-envelope constraint did not reject plaintext-less active credential");

  console.log(`Wave 1 -> Wave 2 migration rehearsal passed in schema ${schemaName}`);
} finally {
  try {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  } finally {
    await client.end();
  }
}
