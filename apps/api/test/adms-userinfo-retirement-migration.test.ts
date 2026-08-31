import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "../migrations");

async function applyMigration(client: Client, file: string) {
  const sql = await readFile(join(migrationsDir, file), "utf8");
  await client.query(sql);
}

async function expectInsertRejected(client: Client, deviceId: string, wireCommand: string) {
  try {
    await client.query(
      `INSERT INTO attendance_adms_commands (
         id, device_id, command_type, wire_command, reason, status, completed_at, return_code, result_command
       ) VALUES ($1, $2, 'query_user_info', $3, 'admin_query_user_info', 'succeeded', now(), 0, 'DATA')`,
      [randomUUID(), deviceId, wireCommand],
    );
    throw new Error(`expected retired command to be rejected: ${wireCommand}`);
  } catch (error) {
    expect((error as { message?: string }).message).toContain("active USERINFO reads are retired");
  }
}

describe.skipIf(!databaseUrl)("0033 active USERINFO read retirement migration", () => {
  it("preserves historical C:11/C:12/C:13 evidence and rejects only new USERINFO reads", async () => {
    const client = new Client({ connectionString: databaseUrl! });
    const schemaName = `userinfo_retirement_${randomUUID().replaceAll("-", "")}`;
    const quotedSchema = `"${schemaName}"`;
    await client.connect();

    try {
      await client.query(`CREATE SCHEMA ${quotedSchema}`);
      await client.query(`SET search_path TO ${quotedSchema}, public`);
      const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
      const through0031 = files.filter((file) => file <= "0031_attendance_adms_full_roster_query.sql");
      expect(through0031.at(-1)).toBe("0031_attendance_adms_full_roster_query.sql");
      for (const file of through0031) await applyMigration(client, file);

      const deviceId = randomUUID();
      await client.query(
        `INSERT INTO attendance_adms_devices (
           id, serial_number, lifecycle, timezone, display_name, pre_registration_recovery_completed_at
         ) VALUES ($1, 'SYNTH-USERINFO-RETIREMENT', 'active', 'Asia/Jakarta', 'Synthetic retirement device', now())`,
        [deviceId],
      );

      await client.query(
        `INSERT INTO attendance_adms_commands (
           id, command_number, device_id, command_type, wire_command, reason,
           status, completed_at, return_code, result_command
         ) OVERRIDING SYSTEM VALUE VALUES
           ($1, 11, $4, 'query_user_info', 'DATA QUERY USERINFO', 'admin_query_user_info', 'succeeded', now(), 0, 'DATA'),
           ($2, 12, $4, 'query_user_info', 'DATA QUERY USERINFO PIN=0042', 'admin_query_user_info', 'succeeded', now(), 0, 'DATA'),
           ($3, 13, $4, 'update_user_info', 'DATA UPDATE USERINFO PIN=0042\tName=Synthetic Employee', 'admin_update_user_info', 'succeeded', now(), 0, 'DATA')`,
        [randomUUID(), randomUUID(), randomUUID(), deviceId],
      );

      await applyMigration(client, "0032_attendance_adms_retire_full_roster_query.sql");
      await applyMigration(client, "0033_attendance_adms_retire_all_userinfo_reads.sql");

      const historical = await client.query<{ commandNumber: string; wireCommand: string }>(
        `SELECT command_number::text AS "commandNumber", wire_command AS "wireCommand"
         FROM attendance_adms_commands
         WHERE command_number IN (11, 12, 13)
         ORDER BY command_number`,
      );
      expect(historical.rows).toEqual([
        { commandNumber: "11", wireCommand: "DATA QUERY USERINFO" },
        { commandNumber: "12", wireCommand: "DATA QUERY USERINFO PIN=0042" },
        { commandNumber: "13", wireCommand: "DATA UPDATE USERINFO PIN=0042\tName=Synthetic Employee" },
      ]);

      await expectInsertRejected(client, deviceId, "DATA QUERY USERINFO");
      await expectInsertRejected(client, deviceId, "DATA QUERY USERINFO PIN=9");
      await expectInsertRejected(client, deviceId, `DATA QUERY USERINFO PIN=${"9".repeat(128)}`);

      const allowedCommands = [
        ["sync_new", "LOG", "admin_sync_new"],
        ["read_info", "INFO", "admin_read_information"],
        [
          "data_query",
          "DATA QUERY ATTLOG StartTime=2026-08-31 00:00:00\tEndTime=2026-08-31 00:10:00",
          "admin_range_recovery",
        ],
        ["update_user_info", "DATA UPDATE USERINFO PIN=0042\tName=Synthetic Employee", "admin_update_user_info"],
      ] as const;

      for (const [commandType, wireCommand, reason] of allowedCommands) {
        const range = commandType === "data_query";
        await client.query(
          `INSERT INTO attendance_adms_commands (
             id, device_id, command_type, wire_command, reason, status,
             requested_range_start, requested_range_end, completed_at, return_code, result_command
           ) VALUES ($1, $2, $3, $4, $5, 'succeeded', $6, $7, now(), 0, $8)`,
          [
            randomUUID(),
            deviceId,
            commandType,
            wireCommand,
            reason,
            range ? new Date("2026-08-30T17:00:00.000Z") : null,
            range ? new Date("2026-08-30T17:10:00.000Z") : null,
            commandType === "sync_new" ? "LOG" : commandType === "read_info" ? "INFO" : "DATA",
          ],
        );
      }
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      await client.end();
    }
  }, 30_000);
});
