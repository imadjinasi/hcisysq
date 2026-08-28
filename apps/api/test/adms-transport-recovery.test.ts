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

describe.skipIf(!databaseUrl)("ATT-005 ADMS transport recovery integration", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("recovers pre-registration ATTLOG, seeds the cursor, delivers one LOG command, and records its acknowledgement", async () => {
    const deviceId = randomUUID();
    const oldRequestId = randomUUID();
    const serial = `SYNTH-RECOVERY-${randomUUID()}`;
    const oldReceivedAt = new Date("2026-08-28T14:51:45.250Z");
    const registeredAt = new Date("2026-08-28T15:00:00.000Z");
    const pollAt = new Date("2026-08-28T15:01:00.000Z");
    const lines = [
      "0701\t2026-08-28 17:57:36\t255\t1\t0\t0\t0\t0\t0\t0\t16461+",
      "0702\t2026-08-28 21:20:48\t255\t15\t0\t0\t0\t0\t0\t0\t16466+",
    ];
    const oldBody = Buffer.from(`${lines.join("\n")}\n`, "utf8");

    await pool.query(
      `INSERT INTO attendance_adms_request_journal (
         id, device_id, serial_candidate_hash, method, path, raw_query,
         safe_metadata, body, body_sha256, body_byte_length, body_captured,
         classification, response_status, response_body, received_at
       ) VALUES (
         $1, NULL, $2, 'POST', '/iclock/cdata', $3,
         '{}'::jsonb, $4, $5, $6, true,
         'attlog', 200, 'OK: 2', $7
       )`,
      [
        oldRequestId,
        sha256(serial),
        `?SN=${encodeURIComponent(serial)}&table=ATTLOG&Stamp=9999`,
        oldBody,
        sha256(oldBody),
        oldBody.length,
        oldReceivedAt,
      ],
    );
    await pool.query(
      `INSERT INTO attendance_adms_quarantines (
         id, request_id, device_id, reason, raw_line, details, created_at
       ) VALUES ($1, $2, NULL, 'UNKNOWN_DEVICE', NULL, '{}'::jsonb, $3)`,
      [randomUUID(), oldRequestId, oldReceivedAt],
    );
    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name, created_at, updated_at
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Recovery Device', $3, $3)`,
      [deviceId, serial, registeredAt],
    );

    const firstPoll = await persistAdmsIngress(pool, {
      receivedAt: pollAt,
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
    });

    expect(firstPoll.recoveredEvents).toBe(2);
    expect(firstPoll.recoveredRequestIds).toEqual([oldRequestId]);
    expect(firstPoll.deliveredCommandNumber).toMatch(/^\d+$/);
    expect(firstPoll.responseBody).toBe(`C:${firstPoll.deliveredCommandNumber}:LOG\n`);

    const events = await pool.query<{ pin: string; sourceRequestId: string }>(
      `SELECT pin, source_request_id AS "sourceRequestId"
       FROM attendance_adms_events
       WHERE device_id = $1
       ORDER BY occurred_at`,
      [deviceId],
    );
    expect(events.rows).toEqual([
      { pin: "0701", sourceRequestId: oldRequestId },
      { pin: "0702", sourceRequestId: oldRequestId },
    ]);

    const cursor = await pool.query<{ stamp: string; sourceRequestId: string }>(
      `SELECT attlog_stamp AS stamp, source_request_id AS "sourceRequestId"
       FROM attendance_adms_cursors
       WHERE device_id = $1`,
      [deviceId],
    );
    expect(cursor.rows[0]).toEqual({ stamp: "9999", sourceRequestId: oldRequestId });

    const device = await pool.query<{ recoveredAt: Date | null }>(
      `SELECT pre_registration_recovery_completed_at AS "recoveredAt"
       FROM attendance_adms_devices
       WHERE id = $1`,
      [deviceId],
    );
    expect(device.rows[0]?.recoveredAt?.toISOString()).toBe(pollAt.toISOString());

    const command = await pool.query<{
      commandNumber: string;
      status: string;
      attemptCount: number;
    }>(
      `SELECT
         command_number::text AS "commandNumber",
         status,
         attempt_count AS "attemptCount"
       FROM attendance_adms_commands
       WHERE device_id = $1`,
      [deviceId],
    );
    expect(command.rows).toHaveLength(1);
    expect(command.rows[0]).toMatchObject({
      commandNumber: firstPoll.deliveredCommandNumber,
      status: "delivered",
      attemptCount: 1,
    });

    const resultBody = Buffer.from(
      `ID=${firstPoll.deliveredCommandNumber}&Return=0&CMD=LOG`,
      "utf8",
    );
    const parsedResult = parseDeviceCommandResultText(resultBody.toString("utf8"));
    expect(parsedResult.quarantines).toEqual([]);

    const acknowledgement = await persistAdmsIngress(pool, {
      receivedAt: new Date("2026-08-28T15:01:10.000Z"),
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
      commandResults: parsedResult.results,
      quarantines: parsedResult.quarantines,
      successResponseBody: "OK",
    });
    expect(acknowledgement.responseBody).toBe("OK");
    expect(acknowledgement.commandResultsApplied).toBe(1);

    const completed = await pool.query<{
      status: string;
      returnCode: number;
      resultCommand: string;
    }>(
      `SELECT
         status,
         return_code AS "returnCode",
         result_command AS "resultCommand"
       FROM attendance_adms_commands
       WHERE device_id = $1`,
      [deviceId],
    );
    expect(completed.rows[0]).toEqual({ status: "succeeded", returnCode: 0, resultCommand: "LOG" });

    const secondPoll = await persistAdmsIngress(pool, {
      receivedAt: new Date("2026-08-28T15:01:20.000Z"),
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
    });
    expect(secondPoll.recoveredEvents).toBe(0);
    expect(secondPoll.deliveredCommandNumber).toBeNull();
    expect(secondPoll.responseBody).toBe("OK");

    const finalCounts = await pool.query<{ events: number; commands: number }>(
      `SELECT
         (SELECT count(*)::int FROM attendance_adms_events WHERE device_id = $1) AS events,
         (SELECT count(*)::int FROM attendance_adms_commands WHERE device_id = $1) AS commands`,
      [deviceId],
    );
    expect(finalCounts.rows[0]).toEqual({ events: 2, commands: 1 });
  });
});
