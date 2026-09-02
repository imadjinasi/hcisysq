import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("0036+ WDMS operations migration safety", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("keeps Wave 3 HCIS tables and constrains later physical parity to typed operations", async () => {
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

    const savedFilterUnique = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'attendance_adms_saved_filters'
         AND c.contype = 'u'`,
    );
    expect(savedFilterUnique.rows).toHaveLength(1);
    expect(savedFilterUnique.rows[0]?.definition).toContain("NULLS NOT DISTINCT");

    const wireConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_adms_commands_wire_command_check'`,
    );
    const wireDefinition = wireConstraint.rows[0]?.definition ?? "";
    expect(wireDefinition).toContain("LOG");
    expect(wireDefinition).toContain("INFO");
    expect(wireDefinition).toContain("DATA QUERY ATTLOG");
    // Historical same-PIN name write remains separately allowlisted. Active USERINFO
    // reads remain rejected by the dedicated 0033 INSERT trigger below.
    expect(wireDefinition).toContain("DATA UPDATE USERINFO");
    // Full physical parity intentionally widens the *typed* allowlist. The safety
    // invariant is no arbitrary escape hatch and mandatory physical-operation linkage.
    expect(wireDefinition).toContain("REBOOT");
    expect(wireDefinition).toContain("WORKCODE");
    expect(wireDefinition).toContain("CLEAR DATA");
    expect(wireDefinition).toContain("UPGRADE type=1");

    const physicalShape = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_adms_commands_physical_shape_check'`,
    );
    const physicalShapeDefinition = physicalShape.rows[0]?.definition ?? "";
    expect(physicalShapeDefinition).toContain("physical_operation_id");
    expect(physicalShapeDefinition).toContain("physical_sequence");
    expect(physicalShapeDefinition).toContain("physical_capability_key");

    const commandShape = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_adms_commands_command_shape_check'`,
    );
    const commandShapeDefinition = commandShape.rows[0]?.definition ?? "";
    expect(commandShapeDefinition).toContain("admin_physical_operation");
    expect(commandShapeDefinition).toContain("physical_operation_id");
    expect(commandShapeDefinition).toContain("firmware_ticket_id");
    expect(commandShapeDefinition).not.toContain("arbitrary");

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
    expect(auditConstraint.rows[0]?.definition).toContain("physical_operation_requested");
    expect(auditConstraint.rows[0]?.definition).toContain("physical_capability_updated");
  });
});
