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
    expect(definition).not.toContain("USERINFO");
    expect(definition).not.toContain("REBOOT");
    expect(definition).not.toContain("FIRMWARE");

    const auditConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_adms_admin_audit_events_action_check'`,
    );
    expect(auditConstraint.rows[0]?.definition).toContain("offline_attlog_imported");
    expect(auditConstraint.rows[0]?.definition).toContain("pending_commands_cleared");
  });
});