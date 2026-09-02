import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("0036 Wave 3 operations migration", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("adds HCIS-side operations tables without widening the device command allowlist", async () => {
    const tables = await pool.query<{ tableName: string }>(
      `SELECT table_name AS "tableName"
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN (
           'attendance_adms_work_codes',
           'attendance_adms_work_code_targets',
           'attendance_adms_device_messages',
           'attendance_adms_device_message_targets',
           'attendance_adms_saved_filters',
           'attendance_adms_offline_imports'
         )
       ORDER BY table_name`,
    );
    expect(tables.rows.map((row) => row.tableName)).toEqual([
      "attendance_adms_device_message_targets",
      "attendance_adms_device_messages",
      "attendance_adms_offline_imports",
      "attendance_adms_saved_filters",
      "attendance_adms_work_code_targets",
      "attendance_adms_work_codes",
    ]);

    const wireConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_adms_commands_wire_command_check'`,
    );
    const definition = wireConstraint.rows[0]?.definition ?? "";
    expect(definition).toContain("LOG");
    expect(definition).toContain("INFO");
    expect(definition).toContain("DATA QUERY ATTLOG");
    // Historical schema still recognizes the separately allowlisted same-PIN name write.
    // Active USERINFO reads are retired by the dedicated 0033 INSERT trigger, not by
    // rewriting migration history or deleting historical command rows.
    expect(definition).toContain("DATA UPDATE USERINFO");
    expect(definition).not.toContain("REBOOT");
    expect(definition).not.toContain("FIRMWARE");
    expect(definition).not.toContain("WORKCODE");
    expect(definition).not.toContain("MESSAGE");
    expect(definition).not.toContain("CLEAR ALL");

    const retiredUserInfoTrigger = await pool.query<{ triggerName: string }>(
      `SELECT tgname AS "triggerName"
       FROM pg_trigger
       WHERE tgname = 'attendance_adms_reject_retired_userinfo_reads'
         AND NOT tgisinternal`,
    );
    expect(retiredUserInfoTrigger.rows).toEqual([
      { triggerName: "attendance_adms_reject_retired_userinfo_reads" },
    ]);

    const auditConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_adms_admin_audit_events_action_check'`,
    );
    expect(auditConstraint.rows[0]?.definition).toContain("offline_attlog_imported");
    expect(auditConstraint.rows[0]?.definition).toContain("pending_commands_cleared");
  });
});