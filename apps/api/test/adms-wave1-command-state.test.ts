import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseDeviceCommandResultText } from "../src/modules/attendance/adms/protocol.js";
import { persistAdmsIngress } from "../src/modules/attendance/adms/repository.js";

const databaseUrl = process.env.DATABASE_URL;

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function emptyBody() {
  const body = Buffer.alloc(0);
  return { body, bodySha256: sha256(body), bodyByteLength: 0, bodyCaptured: true };
}

function pollInput(serial: string, receivedAt: Date) {
  return {
    receivedAt,
    method: "GET",
    path: "/iclock/getrequest",
    rawQuery: `?SN=${encodeURIComponent(serial)}`,
    contentType: null,
    sourceIp: "127.0.0.1",
    safeMetadata: {},
    serialCandidate: serial,
    ...emptyBody(),
    classification: "protocol_discovery",
    attlogText: null,
    attlogStamp: null,
    commandResults: [],
    quarantines: [],
    successResponseBody: "OK",
  };
}

describe.skipIf(!databaseUrl)("ATT-005 Wave 1 command state integration", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("persists allowlisted INFO evidence and firmware without exposing arbitrary options", async () => {
    const deviceId = randomUUID();
    const commandId = randomUUID();
    const serial = `SYNTH-INFO-${randomUUID()}`;
    const registeredAt = new Date("2026-08-28T16:00:00.000Z");
    const pollAt = new Date("2026-08-28T16:01:00.000Z");

    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name,
         pre_registration_recovery_completed_at, created_at, updated_at
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic INFO Device', $3, $3, $3)`,
      [deviceId, serial, registeredAt],
    );
    await pool.query(
      `INSERT INTO attendance_adms_commands (
         id, device_id, command_type, wire_command, reason, status, expires_at
       ) VALUES ($1, $2, 'read_info', 'INFO', 'admin_read_information', 'pending', $3::timestamptz + interval '1 hour')`,
      [commandId, deviceId, pollAt],
    );

    const poll = await persistAdmsIngress(pool, pollInput(serial, pollAt));
    expect(poll.responseBody).toBe(`C:${poll.deliveredCommandNumber}:INFO\n`);

    const resultBody = Buffer.from(
      [
        `ID=${poll.deliveredCommandNumber}&Return=0&CMD=INFO`,
        "TransactionCount=42",
        "FPCount=10",
        "FWVersion=ZMM510-NF28VA-Ver2.0.16",
        "SecretThing=must-not-be-retained",
      ].join("\n"),
      "utf8",
    );
    const parsed = parseDeviceCommandResultText(resultBody.toString("utf8"));
    expect(parsed.quarantines).toEqual([]);

    await persistAdmsIngress(pool, {
      receivedAt: new Date("2026-08-28T16:01:10.000Z"),
      method: "POST",
      path: "/iclock/devicecmd",
      rawQuery: `?SN=${encodeURIComponent(serial)}`,
      contentType: "application/push;charset=UTF-8",
      sourceIp: "127.0.0.1",
      safeMetadata: {},
      serialCandidate: serial,
      body: resultBody,
      bodySha256: sha256(resultBody),
      bodyByteLength: resultBody.length,
      bodyCaptured: true,
      classification: "device_command_result",
      attlogText: null,
      attlogStamp: null,
      commandResults: parsed.results,
      quarantines: parsed.quarantines,
      successResponseBody: "OK",
    });

    const device = await pool.query<{
      firmwareVersion: string | null;
      infoObserved: Record<string, string> | null;
    }>(
      `SELECT
         firmware_version AS "firmwareVersion",
         metadata -> 'infoObserved' AS "infoObserved"
       FROM attendance_adms_devices
       WHERE id = $1`,
      [deviceId],
    );
    expect(device.rows[0]?.firmwareVersion).toBe("ZMM510-NF28VA-Ver2.0.16");
    expect(device.rows[0]?.infoObserved).toMatchObject({
      TransactionCount: "42",
      FPCount: "10",
      FWVersion: "ZMM510-NF28VA-Ver2.0.16",
    });
    expect(device.rows[0]?.infoObserved).not.toHaveProperty("SecretThing");
  });

  it("queues one bounded scheduled reconciliation only when explicitly enabled", async () => {
    const deviceId = randomUUID();
    const serial = `SYNTH-RECON-${randomUUID()}`;
    const registeredAt = new Date("2026-08-28T16:00:00.000Z");
    const pollAt = new Date("2026-08-28T17:00:00.000Z");

    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name,
         pre_registration_recovery_completed_at,
         reconciliation_enabled, reconciliation_interval_minutes,
         reconciliation_lookback_hours,
         created_at, updated_at
       ) VALUES (
         $1, $2, 'active', 'Asia/Jakarta', 'Synthetic Reconciliation Device',
         $3, true, 1440, 24, $3, $3
       )`,
      [deviceId, serial, registeredAt],
    );

    const poll = await persistAdmsIngress(pool, pollInput(serial, pollAt));
    expect(poll.deliveredCommandNumber).toMatch(/^\d+$/);
    expect(poll.responseBody).toContain(":DATA QUERY ATTLOG StartTime=2026-08-28 00:00:00");
    expect(poll.responseBody).toContain("\tEndTime=2026-08-29 00:00:00\n");

    const commands = await pool.query<{
      commandType: string;
      reason: string;
      status: string;
      rangeStart: Date;
      rangeEnd: Date;
      expiresAt: Date;
    }>(
      `SELECT
         command_type AS "commandType",
         reason,
         status,
         requested_range_start AS "rangeStart",
         requested_range_end AS "rangeEnd",
         expires_at AS "expiresAt"
       FROM attendance_adms_commands
       WHERE device_id = $1`,
      [deviceId],
    );
    expect(commands.rows).toHaveLength(1);
    expect(commands.rows[0]).toMatchObject({
      commandType: "data_query",
      reason: "scheduled_reconciliation",
      status: "delivered",
    });
    expect(commands.rows[0]?.rangeStart.toISOString()).toBe("2026-08-27T17:00:00.000Z");
    expect(commands.rows[0]?.rangeEnd.toISOString()).toBe(pollAt.toISOString());
    expect(commands.rows[0]?.expiresAt.toISOString()).toBe("2026-08-28T23:00:00.000Z");
  });

  it("does not schedule reconciliation under the default disabled policy", async () => {
    const deviceId = randomUUID();
    const serial = `SYNTH-RECON-OFF-${randomUUID()}`;
    const registeredAt = new Date("2026-08-28T16:00:00.000Z");

    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name,
         pre_registration_recovery_completed_at, created_at, updated_at
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Reconciliation Off Device', $3, $3, $3)`,
      [deviceId, serial, registeredAt],
    );

    const poll = await persistAdmsIngress(
      pool,
      pollInput(serial, new Date("2026-08-28T17:00:00.000Z")),
    );
    expect(poll.deliveredCommandNumber).toBeNull();
    expect(poll.responseBody).toBe("OK");
  });
});
