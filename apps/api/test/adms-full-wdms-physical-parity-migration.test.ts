import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("ATT-005 full WDMS physical parity migrations", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("adds the WDMS registry, neutral Job Code catalog and physical evidence ledger", async () => {
    const deviceColumns = await pool.query<{ columnName: string }>(
      `SELECT column_name AS "columnName"
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'attendance_adms_devices'
         AND column_name IN (
           'organizational_unit_id',
           'area_context',
           'worksite_label',
           'device_role',
           'transfer_mode',
           'heartbeat_interval_seconds',
           'desired_push_protocol_version'
         )
       ORDER BY column_name`,
    );
    expect(deviceColumns.rows.map((row) => row.columnName)).toEqual([
      "area_context",
      "desired_push_protocol_version",
      "device_role",
      "heartbeat_interval_seconds",
      "organizational_unit_id",
      "transfer_mode",
      "worksite_label",
    ]);

    const tables = await pool.query<{ tableName: string }>(
      `SELECT table_name AS "tableName"
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN (
           'attendance_adms_job_codes',
           'attendance_adms_physical_capabilities',
           'attendance_adms_physical_operations',
           'attendance_adms_firmware_packages',
           'attendance_adms_firmware_download_tickets',
           'attendance_adms_attendance_photos'
         )
       ORDER BY table_name`,
    );
    expect(tables.rows.map((row) => row.tableName)).toEqual([
      "attendance_adms_attendance_photos",
      "attendance_adms_firmware_download_tickets",
      "attendance_adms_firmware_packages",
      "attendance_adms_job_codes",
      "attendance_adms_physical_capabilities",
      "attendance_adms_physical_operations",
    ]);
  });

  it("keeps user lifecycle non-destructive and binds physical wires to typed operations", async () => {
    const wireConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_adms_commands_wire_command_check'`,
    );
    const wireDefinition = wireConstraint.rows[0]?.definition ?? "";
    expect(wireDefinition).toContain("DATA UPDATE user Pin=");
    expect(wireDefinition).toContain("DATA UPDATE userauthorize Pin=");
    expect(wireDefinition).toContain("SET OPTIONS NTPServer=");
    expect(wireDefinition).toContain("SET OPTIONS WebServerIP=");
    expect(wireDefinition).not.toContain("DATA DELETE user Pin=");

    const shapeConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'attendance_adms_commands_command_shape_check'`,
    );
    const shape = shapeConstraint.rows[0]?.definition ?? "";
    expect(shape).toContain("admin_physical_operation");
    expect(shape).toContain("physical_operation_id");
    expect(shape).toContain("user_profile_upsert");
    expect(shape).toContain("user_enable_disable");
    expect(shape).toContain("server_config");
    expect(shape).toContain("ntp_config");
  });

  it("enforces DB-level physical-operation rate limiting and preserves retired USERINFO reads", async () => {
    const triggers = await pool.query<{ triggerName: string }>(
      `SELECT tgname AS "triggerName"
       FROM pg_trigger
       WHERE tgname IN (
         'attendance_adms_physical_operation_rate_limit',
         'attendance_adms_reject_retired_userinfo_reads'
       )
         AND NOT tgisinternal
       ORDER BY tgname`,
    );
    expect(triggers.rows).toEqual([
      { triggerName: "attendance_adms_physical_operation_rate_limit" },
      { triggerName: "attendance_adms_reject_retired_userinfo_reads" },
    ]);

    const rateFunction = await pool.query<{ definition: string }>(
      `SELECT pg_get_functiondef(p.oid) AS definition
       FROM pg_proc p
       WHERE p.proname = 'enforce_attendance_adms_physical_operation_rate_limit'`,
    );
    const definition = rateFunction.rows[0]?.definition ?? "";
    expect(definition).toContain("30 seconds");
    expect(definition).toContain("1 hour");
    expect(definition).toContain("destructive");
    expect(definition).toContain("firmware_upgrade");
  });
});
