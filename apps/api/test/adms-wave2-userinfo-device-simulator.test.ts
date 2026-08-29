import { randomUUID } from "node:crypto";

import Fastify from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { registerAdmsIngressRoutes } from "../src/modules/attendance/adms/routes.js";

const databaseUrl = process.env.DATABASE_URL;

function config() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    ADMS_INGRESS_HOST: "adms-userinfo.test.local",
    BIOMETRIC_COLLECTION_ENABLED: "0",
  });
}

describe.skipIf(!databaseUrl)("ATT-005 Wave 2 USERINFO synthetic device canary", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("delivers single-PIN USERINFO, records DATA success, redacts upload, and projects only safe roster fields", async () => {
    const serial = `SYNTH-W2-USER-${randomUUID()}`;
    const deviceId = randomUUID();
    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name, pre_registration_recovery_completed_at
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic USERINFO Device', now())`,
      [deviceId, serial],
    );

    const commandId = randomUUID();
    const queued = await pool.query<{ commandNumber: string; createdAt: Date }>(
      `INSERT INTO attendance_adms_commands (
         id, device_id, command_type, wire_command, reason, status, expires_at
       ) VALUES (
         $1, $2, 'query_user_info', 'DATA QUERY USERINFO PIN=0042',
         'admin_query_user_info', 'pending', now() + interval '15 minutes'
       )
       RETURNING command_number::text AS "commandNumber", created_at AS "createdAt"`,
      [commandId, deviceId],
    );
    const commandNumber = queued.rows[0]!.commandNumber;

    const app = Fastify({ logger: false });
    await registerAdmsIngressRoutes(app, pool, config());

    const delivery = await app.inject({
      method: "GET",
      url: `/iclock/getrequest?SN=${encodeURIComponent(serial)}`,
      headers: { host: "adms-userinfo.test.local" },
    });
    expect(delivery.statusCode).toBe(200);
    expect(delivery.body).toBe(`C:${commandNumber}:DATA QUERY USERINFO PIN=0042\n`);

    const deliveredState = await pool.query<{ deliveredAt: Date | null; status: string }>(
      `SELECT delivered_at AS "deliveredAt", status
       FROM attendance_adms_commands
       WHERE id = $1`,
      [commandId],
    );
    expect(deliveredState.rows[0]?.status).toBe("delivered");
    expect(deliveredState.rows[0]?.deliveredAt).toBeInstanceOf(Date);

    const result = await app.inject({
      method: "POST",
      url: `/iclock/devicecmd?SN=${encodeURIComponent(serial)}`,
      headers: { host: "adms-userinfo.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload: `ID=${commandNumber}&Return=0&CMD=DATA\n`,
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe("OK");

    const terminal = await pool.query<{
      status: string;
      returnCode: number | null;
      resultCommand: string | null;
    }>(
      `SELECT status, return_code AS "returnCode", result_command AS "resultCommand"
       FROM attendance_adms_commands
       WHERE id = $1`,
      [commandId],
    );
    expect(terminal.rows[0]).toEqual({ status: "succeeded", returnCode: 0, resultCommand: "DATA" });

    const userBody = [
      "USER PIN=0042",
      "Name=Synthetic Query User",
      "Passwd=must-never-be-journaled",
      "Card=000123",
      "Pri=0",
      "Verify=1",
      "Grp=2",
    ].join("\t") + "\n";
    const upload = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=USERINFO&Stamp=user-query-1`,
      headers: { host: "adms-userinfo.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload: userBody,
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.body).toBe("OK: 1");

    const roster = await pool.query<{
      pin: string;
      displayName: string | null;
      cardNumber: string | null;
      privilege: string | null;
      verifyMode: string | null;
      safeMetadata: Record<string, string>;
      sourceRequestId: string | null;
      lastSeenAt: Date;
    }>(
      `SELECT
         pin,
         display_name AS "displayName",
         card_number AS "cardNumber",
         privilege,
         verify_mode AS "verifyMode",
         safe_metadata AS "safeMetadata",
         source_request_id AS "sourceRequestId",
         last_seen_at AS "lastSeenAt"
       FROM attendance_adms_device_roster_entries
       WHERE device_id = $1 AND pin = '0042'`,
      [deviceId],
    );
    expect(roster.rows).toHaveLength(1);
    expect(roster.rows[0]).toMatchObject({
      pin: "0042",
      displayName: "Synthetic Query User",
      cardNumber: "000123",
      privilege: "0",
      verifyMode: "1",
      safeMetadata: { group: "2" },
    });
    expect(roster.rows[0]?.sourceRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(roster.rows[0]?.lastSeenAt.getTime()).toBeGreaterThanOrEqual(deliveredState.rows[0]!.deliveredAt!.getTime());

    const journal = await pool.query<{
      id: string;
      body: Buffer | null;
      classification: string;
      safeRosterRecordCount: string | null;
    }>(
      `SELECT
         id,
         body,
         classification,
         safe_metadata ->> 'safeRosterRecordCount' AS "safeRosterRecordCount"
       FROM attendance_adms_request_journal
       WHERE device_id = $1
         AND safe_metadata ->> 'protocolTable' = 'USERINFO'
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId],
    );
    expect(journal.rows[0]).toMatchObject({
      id: roster.rows[0]?.sourceRequestId,
      body: null,
      classification: "sensitive_device_data_redacted",
      safeRosterRecordCount: "1",
    });
    expect(JSON.stringify(journal.rows[0])).not.toContain("must-never-be-journaled");

    await app.close();
  });
});
