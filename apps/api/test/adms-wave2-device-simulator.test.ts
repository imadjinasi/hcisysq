import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { registerAdmsIngressRoutes } from "../src/modules/attendance/adms/routes.js";

const databaseUrl = process.env.DATABASE_URL;

function config() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    ADMS_INGRESS_HOST: "adms.test.local",
    BIOMETRIC_COLLECTION_ENABLED: "0",
  });
}

class SyntheticAdmsDevice {
  constructor(
    private readonly app: FastifyInstance,
    readonly serial: string,
  ) {}

  poll() {
    return this.app.inject({
      method: "GET",
      url: `/iclock/getrequest?SN=${encodeURIComponent(this.serial)}`,
      headers: { host: "adms.test.local" },
    });
  }

  acknowledgeInfo(commandNumber: string) {
    return this.app.inject({
      method: "POST",
      url: `/iclock/devicecmd?SN=${encodeURIComponent(this.serial)}`,
      headers: { host: "adms.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload: [
        `ID=${commandNumber}&Return=0&CMD=INFO`,
        "DeviceName=ZKTeco Synthetic Simulator",
        "FWVersion=SYNTH-W2-1.0",
        "PrivateSetting=must-not-be-promoted-to-safe-telemetry",
      ].join("\n"),
    });
  }

  upload(table: "USERINFO" | "OPERLOG", body: string, stamp: string) {
    return this.app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(this.serial)}&table=${table}&Stamp=${encodeURIComponent(stamp)}`,
      headers: { host: "adms.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload: body,
    });
  }
}

async function insertDevice(pool: Pool, serial: string) {
  const deviceId = randomUUID();
  await pool.query(
    `INSERT INTO attendance_adms_devices (
       id, serial_number, lifecycle, timezone, display_name, pre_registration_recovery_completed_at
     ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Simulator Device', now())`,
    [deviceId, serial],
  );
  return deviceId;
}

describe.skipIf(!databaseUrl)("ATT-005 Wave 2 synthetic ADMS device simulator", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("exercises idle polling, INFO transport, safe roster observation, and passive FP redaction without hardware", async () => {
    const serial = `SYNTH-W2-SIM-${randomUUID()}`;
    const deviceId = await insertDevice(pool, serial);
    const app = Fastify({ logger: false });
    await registerAdmsIngressRoutes(app, pool, config());
    const device = new SyntheticAdmsDevice(app, serial);

    const idle = await device.poll();
    expect(idle.statusCode).toBe(200);
    expect(idle.body).toBe("OK");

    const commandId = randomUUID();
    const command = await pool.query<{ commandNumber: string }>(
      `INSERT INTO attendance_adms_commands (
         id, device_id, command_type, wire_command, reason, status, expires_at
       ) VALUES ($1, $2, 'read_info', 'INFO', 'admin_read_information', 'pending', now() + interval '1 hour')
       RETURNING command_number::text AS "commandNumber"`,
      [commandId, deviceId],
    );
    const commandNumber = command.rows[0]!.commandNumber;

    const delivery = await device.poll();
    expect(delivery.statusCode).toBe(200);
    expect(delivery.body).toBe(`C:${commandNumber}:INFO\n`);

    const infoAck = await device.acknowledgeInfo(commandNumber);
    expect(infoAck.statusCode).toBe(200);
    expect(infoAck.body).toBe("OK");

    const commandState = await pool.query<{
      status: string;
      resultCommand: string | null;
      firmwareVersion: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT
         c.status,
         c.result_command AS "resultCommand",
         d.firmware_version AS "firmwareVersion",
         d.metadata
       FROM attendance_adms_commands c
       JOIN attendance_adms_devices d ON d.id = c.device_id
       WHERE c.id = $1`,
      [commandId],
    );
    expect(commandState.rows[0]).toMatchObject({
      status: "succeeded",
      resultCommand: "INFO",
      firmwareVersion: "SYNTH-W2-1.0",
      metadata: {
        infoObserved: {
          DeviceName: "ZKTeco Synthetic Simulator",
          FWVersion: "SYNTH-W2-1.0",
        },
      },
    });
    expect(JSON.stringify(commandState.rows[0]?.metadata)).not.toContain("PrivateSetting");

    const userBody = "USER PIN=0042\tName=Synthetic User\tPasswd=do-not-store\tCard=000123\tPri=0\tVerify=1\n";
    const userUpload = await device.upload("USERINFO", userBody, "user-1");
    expect(userUpload.statusCode).toBe(200);
    expect(userUpload.body).toBe("OK: 1");

    const roster = await pool.query<{
      pin: string;
      displayName: string | null;
      cardNumber: string | null;
      privilege: string | null;
      verifyMode: string | null;
      safeMetadata: Record<string, unknown>;
    }>(
      `SELECT
         pin,
         display_name AS "displayName",
         card_number AS "cardNumber",
         privilege,
         verify_mode AS "verifyMode",
         safe_metadata AS "safeMetadata"
       FROM attendance_adms_device_roster_entries
       WHERE device_id = $1 AND pin = '0042'`,
      [deviceId],
    );
    expect(roster.rows).toHaveLength(1);
    expect(roster.rows[0]).toEqual({
      pin: "0042",
      displayName: "Synthetic User",
      cardNumber: "000123",
      privilege: "0",
      verifyMode: "1",
      safeMetadata: {},
    });
    expect(JSON.stringify(roster.rows[0])).not.toContain("do-not-store");

    const tmp = Buffer.from("synthetic-device-simulator-fingerprint", "utf8").toString("base64");
    const fingerprintBody = `FP PIN=0042\tFID=1\tSize=${tmp.length}\tValid=1\tTMP=${tmp}\n`;
    const fpUpload = await device.upload("OPERLOG", fingerprintBody, "fp-1");
    expect(fpUpload.statusCode).toBe(200);
    expect(fpUpload.body).toBe("OK: 1");

    const sensitiveJournal = await pool.query<{
      protocolTable: string;
      body: Buffer | null;
      classification: string;
      safeMetadata: Record<string, string>;
    }>(
      `SELECT
         safe_metadata ->> 'protocolTable' AS "protocolTable",
         body,
         classification,
         safe_metadata AS "safeMetadata"
       FROM attendance_adms_request_journal
       WHERE device_id = $1
         AND safe_metadata ->> 'protocolTable' IN ('USERINFO', 'OPERLOG')
       ORDER BY received_at`,
      [deviceId],
    );
    expect(sensitiveJournal.rows).toHaveLength(2);
    for (const row of sensitiveJournal.rows) {
      expect(row.body).toBeNull();
      expect(row.classification).toBe("sensitive_device_data_redacted");
      expect(row.safeMetadata.bodyRedaction).toBe("sensitive_device_data_redacted");
    }
    expect(JSON.stringify(sensitiveJournal.rows)).not.toContain("do-not-store");
    expect(JSON.stringify(sensitiveJournal.rows)).not.toContain(tmp);

    const credentials = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_biometric_credentials
       WHERE origin_device_id = $1`,
      [deviceId],
    );
    expect(credentials.rows[0]?.count).toBe(0);

    const idleAgain = await device.poll();
    expect(idleAgain.statusCode).toBe(200);
    expect(idleAgain.body).toBe("OK");

    await app.close();
  });
});
