import { createHash, randomUUID } from "node:crypto";

import Fastify from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { registerAdmsIngressRoutes } from "../src/modules/attendance/adms/routes.js";

const databaseUrl = process.env.DATABASE_URL;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe.skipIf(!databaseUrl)("ATT-005 Wave 2 sensitive ingress redaction", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("acks USER/OPERLOG, redacts plaintext, and projects only allowlisted roster fields", async () => {
    const deviceId = randomUUID();
    const serial = `SYNTH-W2-${randomUUID()}`;
    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Wave 2 Device')`,
      [deviceId, serial],
    );

    const app = Fastify({ logger: false });
    const config = loadConfig({
      DATABASE_URL: databaseUrl!,
      ADMS_INGRESS_HOST: "adms.test.local",
    });
    await registerAdmsIngressRoutes(app, pool, config);

    const sensitiveBody =
      "USER PIN=0042\tName=Pegawai Synthetic\tPasswd=do-not-journal\tCard=00001234\tPri=0\tVerify=1\tGrp=1\tTZ=0000000100000000\n";
    const response = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=OPERLOG`,
      headers: {
        host: "adms.test.local",
        "content-type": "text/plain; charset=UTF-8",
      },
      payload: sensitiveBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("OK: 1");

    const journal = await pool.query<{
      classification: string;
      body: Buffer | null;
      bodySha256: string;
      bodyByteLength: number;
      bodyCaptured: boolean;
      safeMetadata: Record<string, string>;
    }>(
      `SELECT
         classification,
         body,
         body_sha256 AS "bodySha256",
         body_byte_length AS "bodyByteLength",
         body_captured AS "bodyCaptured",
         safe_metadata AS "safeMetadata"
       FROM attendance_adms_request_journal
       WHERE device_id = $1
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId],
    );

    expect(journal.rows[0]).toMatchObject({
      classification: "sensitive_device_data_redacted",
      body: null,
      bodySha256: sha256(sensitiveBody),
      bodyByteLength: Buffer.byteLength(sensitiveBody),
      bodyCaptured: true,
      safeMetadata: {
        protocolTable: "OPERLOG",
        bodyRedaction: "sensitive_device_data_redacted",
        safeRosterRecordCount: "1",
      },
    });

    const plaintextLeak = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_adms_request_journal
       WHERE device_id = $1
         AND body IS NOT NULL
         AND convert_from(body, 'UTF8') LIKE '%do-not-journal%'`,
      [deviceId],
    );
    expect(plaintextLeak.rows[0]?.count).toBe(0);

    const roster = await pool.query<{
      pin: string;
      displayName: string | null;
      cardNumber: string | null;
      privilege: string | null;
      verifyMode: string | null;
      safeMetadata: Record<string, string>;
    }>(
      `SELECT
         pin,
         display_name AS "displayName",
         card_number AS "cardNumber",
         privilege,
         verify_mode AS "verifyMode",
         safe_metadata AS "safeMetadata"
       FROM attendance_adms_device_roster_entries
       WHERE device_id = $1`,
      [deviceId],
    );
    expect(roster.rows).toEqual([
      {
        pin: "0042",
        displayName: "Pegawai Synthetic",
        cardNumber: "00001234",
        privilege: "0",
        verifyMode: "1",
        safeMetadata: { group: "1", timezone: "0000000100000000" },
      },
    ]);
    expect(JSON.stringify(roster.rows)).not.toContain("do-not-journal");
    expect(JSON.stringify(roster.rows)).not.toContain("Passwd");

    await app.close();
  });

  it("continues to persist structurally valid ATTLOG evidence losslessly", async () => {
    const deviceId = randomUUID();
    const serial = `SYNTH-W2-ATT-${randomUUID()}`;
    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Wave 2 ATTLOG Device')`,
      [deviceId, serial],
    );

    const app = Fastify({ logger: false });
    const config = loadConfig({
      DATABASE_URL: databaseUrl!,
      ADMS_INGRESS_HOST: "adms.test.local",
    });
    await registerAdmsIngressRoutes(app, pool, config);

    const attlog = "0042\t2026-08-28 07:13:20\t0\t1\t0\t0\t0\t0\t0\t0\t0\n";
    const response = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=ATTLOG&Stamp=9001`,
      headers: {
        host: "adms.test.local",
        "content-type": "text/plain; charset=UTF-8",
      },
      payload: attlog,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("OK: 1");
    const journal = await pool.query<{ classification: string; body: Buffer | null }>(
      `SELECT classification, body
       FROM attendance_adms_request_journal
       WHERE device_id = $1
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId],
    );
    expect(journal.rows[0]?.classification).toBe("attlog");
    expect(journal.rows[0]?.body?.toString("utf8")).toBe(attlog);

    await app.close();
  });
});
