import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTimeSyncCanary } from "../src/modules/attendance/adms/physical-parity-service.js";

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

  it("accepts typed time sync and 500-character messages without weakening command guards", async () => {
    const client = await pool.connect();
    const accountId = randomUUID();
    const deviceId = randomUUID();
    const messageOperationId = randomUUID();

    async function insertPhysicalMessageWireCommand(sequence: number, wireCommand: string) {
      await client.query(
        `INSERT INTO attendance_adms_commands (
           id, device_id, command_type, wire_command, reason, status, expires_at,
           physical_operation_id, physical_sequence, physical_capability_key,
           completed_at, return_code, result_command
         ) VALUES (
           $1, $2, 'physical_message', $3, 'admin_physical_operation', 'succeeded', now() + interval '1 hour',
           $4, $5, 'message_delivery', now(), 0, 'DATA'
         )`,
        [randomUUID(), deviceId, wireCommand, messageOperationId, sequence],
      );
    }

    async function insertMessageCommand(sequence: number, message: string) {
      return insertPhysicalMessageWireCommand(
        sequence,
        `DATA UPDATE SMS MSG=${message}\tTAG=253\tUID=${sequence}\tMIN=1\tStartTime=2026-09-04 00:00:00`,
      );
    }

    async function expectWireCommandRejected(sequence: number, wireCommand: string) {
      await client.query("SAVEPOINT rejected_message_wire");
      try {
        await expect(insertPhysicalMessageWireCommand(sequence, wireCommand)).rejects.toThrow(
          /attendance_adms_commands_wire_command_check/,
        );
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT rejected_message_wire");
        await client.query("RELEASE SAVEPOINT rejected_message_wire");
      }
    }

    async function expectRetiredUserInfoRejected() {
      await client.query("SAVEPOINT rejected_userinfo_wire");
      try {
        await expect(
          client.query(
            `INSERT INTO attendance_adms_commands (
               id, device_id, command_type, wire_command, reason, status, completed_at,
               return_code, result_command
             ) VALUES (
               $1, $2, 'query_user_info', 'DATA QUERY USERINFO PIN=9',
               'admin_query_user_info', 'succeeded', now(), 0, 'DATA'
             )`,
            [randomUUID(), deviceId],
          ),
        ).rejects.toThrow(/active USERINFO reads are retired/);
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT rejected_userinfo_wire");
        await client.query("RELEASE SAVEPOINT rejected_userinfo_wire");
      }
    }

    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO accounts (id, email, principal_type, status)
         VALUES ($1, $2, 'FOUNDATION_BOARD', 'active')`,
        [accountId, `att005-wire-hotfix-${accountId}@example.test`],
      );
      await client.query(
        `INSERT INTO attendance_adms_devices (
           id, serial_number, lifecycle, timezone, display_name
         ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic ATT-005 regex device')`,
        [deviceId, `SYNTH-ATT005-${deviceId}`],
      );

      const biometricDefault = await client.query<{ enabled: boolean }>(
        `SELECT biometric_collection_enabled AS enabled
         FROM attendance_adms_devices
         WHERE id = $1`,
        [deviceId],
      );
      expect(biometricDefault.rows).toEqual([{ enabled: false }]);

      const timeSync = await createTimeSyncCanary(client, {
        deviceId,
        requestedByAccountId: accountId,
      });
      const timeSyncState = await client.query<{
        operationStatus: string;
        capabilityState: string;
        wireCommand: string;
        commandStatus: string;
      }>(
        `SELECT operation.status AS "operationStatus",
                capability.state AS "capabilityState",
                command.wire_command AS "wireCommand",
                command.status AS "commandStatus"
         FROM attendance_adms_physical_operations operation
         JOIN attendance_adms_physical_capabilities capability
           ON capability.last_operation_id = operation.id
         JOIN attendance_adms_commands command
           ON command.physical_operation_id = operation.id
         WHERE operation.id = $1`,
        [timeSync.operationId],
      );
      expect(timeSyncState.rows).toEqual([
        {
          operationStatus: "running",
          capabilityState: "canary_pending",
          wireCommand: "TIME_SYNC",
          commandStatus: "pending",
        },
      ]);

      await client.query(
        `INSERT INTO attendance_adms_physical_operations (
           id, device_id, capability_key, operation_key, mode, status, destructive,
           requested_by_account_id, completed_at
         ) VALUES (
           $1, $2, 'message_delivery', 'message_length_boundary', 'canary',
           'succeeded', false, $3, now()
         )`,
        [messageOperationId, deviceId, accountId],
      );

      await insertMessageCommand(1, "a".repeat(255));
      await insertMessageCommand(2, "b".repeat(256));
      await insertMessageCommand(3, "c".repeat(500));
      await expectWireCommandRejected(
        4,
        `DATA UPDATE SMS MSG=${"d".repeat(501)}\tTAG=253\tUID=4\tMIN=1\tStartTime=2026-09-04 00:00:00`,
      );
      await expectWireCommandRejected(5, "REBOOT NOW");

      const wireConstraint = await client.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conname = 'attendance_adms_commands_wire_command_check'`,
      );
      const wireDefinition = wireConstraint.rows[0]?.definition ?? "";
      const repetitionUpperBounds = [...wireDefinition.matchAll(/\{\d+,(\d+)\}/g)].map((match) => Number(match[1]));
      expect(repetitionUpperBounds.length).toBeGreaterThan(0);
      expect(Math.max(...repetitionUpperBounds)).toBeLessThanOrEqual(255);
      expect(wireDefinition).not.toContain("{1,500}");

      const userInfoTrigger = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM pg_trigger
         WHERE tgname = 'attendance_adms_reject_retired_userinfo_reads'
           AND NOT tgisinternal`,
      );
      expect(userInfoTrigger.rows).toEqual([{ count: "1" }]);
      await expectRetiredUserInfoRejected();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
