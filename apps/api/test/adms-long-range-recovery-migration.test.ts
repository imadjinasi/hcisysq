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

describe.skipIf(!databaseUrl)("0034 bounded long-range ATTLOG recovery", () => {
  it("serializes chunks, fails closed, preserves USERINFO retirement, and keeps safe name update", async () => {
    const client = new Client({ connectionString: databaseUrl! });
    const schemaName = `long_recovery_${randomUUID().replaceAll("-", "")}`;
    const quotedSchema = `"${schemaName}"`;
    await client.connect();

    try {
      await client.query(`CREATE SCHEMA ${quotedSchema}`);
      await client.query(`SET search_path TO ${quotedSchema}, public`);
      const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
      const through0034 = files.filter((file) => file <= "0034_attendance_adms_long_range_recovery.sql");
      expect(through0034.at(-1)).toBe("0034_attendance_adms_long_range_recovery.sql");
      for (const file of through0034) await applyMigration(client, file);

      const deviceId = randomUUID();
      await client.query(
        `INSERT INTO attendance_adms_devices (
           id, serial_number, lifecycle, timezone, display_name, pre_registration_recovery_completed_at
         ) VALUES ($1, 'SYNTH-LONG-RECOVERY', 'active', 'Asia/Jakarta', 'Synthetic recovery device', now())`,
        [deviceId],
      );

      const jobId = randomUUID();
      await client.query(
        `INSERT INTO attendance_adms_recovery_jobs (
           id, device_id, requested_range_start, requested_range_end,
           chunk_days, total_chunks, status
         ) VALUES (
           $1, $2, '2026-01-01T00:00:00Z', '2026-03-15T23:59:59Z', 31, 3, 'running'
         )`,
        [jobId, deviceId],
      );

      const commandIds = [randomUUID(), randomUUID(), randomUUID()];
      const ranges = [
        ["2026-01-01 07:00:00", "2026-02-01 06:59:59"],
        ["2026-02-01 07:00:00", "2026-03-04 06:59:59"],
        ["2026-03-04 07:00:00", "2026-03-16 06:59:59"],
      ] as const;

      for (let index = 0; index < commandIds.length; index += 1) {
        const [start, end] = ranges[index]!;
        const status = index === 0 ? "pending" : "queued";
        await client.query(
          `INSERT INTO attendance_adms_commands (
             id, device_id, command_type, wire_command, reason, status,
             requested_range_start, requested_range_end, expires_at,
             recovery_job_id, recovery_sequence
           ) VALUES (
             $1, $2, 'data_query', $3, 'admin_long_range_recovery', $4,
             $5, $6, CASE WHEN $4 = 'pending' THEN now() + interval '24 hours' ELSE NULL END,
             $7, $8
           )`,
          [
            commandIds[index],
            deviceId,
            `DATA QUERY ATTLOG StartTime=${start}\tEndTime=${end}`,
            status,
            new Date(start.replace(" ", "T") + "Z"),
            new Date(end.replace(" ", "T") + "Z"),
            jobId,
            index + 1,
          ],
        );
      }

      await client.query(
        `UPDATE attendance_adms_commands
         SET status = 'succeeded', completed_at = now(), return_code = 0, result_command = 'DATA'
         WHERE id = $1`,
        [commandIds[0]],
      );

      const afterFirst = await client.query<{ sequence: number; status: string }>(
        `SELECT recovery_sequence AS sequence, status
         FROM attendance_adms_commands
         WHERE recovery_job_id = $1
         ORDER BY recovery_sequence`,
        [jobId],
      );
      expect(afterFirst.rows).toEqual([
        { sequence: 1, status: "succeeded" },
        { sequence: 2, status: "pending" },
        { sequence: 3, status: "queued" },
      ]);

      await client.query(
        `UPDATE attendance_adms_commands
         SET status = 'failed', completed_at = now(), return_code = -1, result_command = 'DATA'
         WHERE id = $1`,
        [commandIds[1]],
      );

      const job = await client.query<{ status: string; failureReason: string | null; completedAt: Date | null }>(
        `SELECT status, failure_reason AS "failureReason", completed_at AS "completedAt"
         FROM attendance_adms_recovery_jobs
         WHERE id = $1`,
        [jobId],
      );
      expect(job.rows[0]).toMatchObject({ status: "failed", failureReason: "chunk_failed" });
      expect(job.rows[0]?.completedAt).toBeInstanceOf(Date);

      const afterFailure = await client.query<{ sequence: number; status: string }>(
        `SELECT recovery_sequence AS sequence, status
         FROM attendance_adms_commands
         WHERE recovery_job_id = $1
         ORDER BY recovery_sequence`,
        [jobId],
      );
      expect(afterFailure.rows).toEqual([
        { sequence: 1, status: "succeeded" },
        { sequence: 2, status: "failed" },
        { sequence: 3, status: "cancelled" },
      ]);

      await expect(
        client.query(
          `INSERT INTO attendance_adms_commands (
             id, device_id, command_type, wire_command, reason, status,
             completed_at, return_code, result_command
           ) VALUES ($1, $2, 'query_user_info', 'DATA QUERY USERINFO PIN=9', 'admin_query_user_info', 'succeeded', now(), 0, 'DATA')`,
          [randomUUID(), deviceId],
        ),
      ).rejects.toThrow(/active USERINFO reads are retired/);

      await client.query(
        `INSERT INTO attendance_adms_commands (
           id, device_id, command_type, wire_command, reason, status,
           completed_at, return_code, result_command
         ) VALUES (
           $1, $2, 'update_user_info', 'DATA UPDATE USERINFO PIN=0042\tName=Synthetic Employee',
           'admin_update_user_info', 'succeeded', now(), 0, 'DATA'
         )`,
        [randomUUID(), deviceId],
      );
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
      await client.end();
    }
  }, 30_000);
});
