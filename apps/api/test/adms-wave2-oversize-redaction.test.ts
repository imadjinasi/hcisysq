import { createHash, randomUUID } from "node:crypto";

import Fastify from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { ADMS_MAX_BODY_BYTES } from "../src/modules/attendance/adms/protocol.js";
import { registerAdmsIngressRoutes } from "../src/modules/attendance/adms/routes.js";

const databaseUrl = process.env.DATABASE_URL;

function disabledConfig() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    ADMS_INGRESS_HOST: "adms.test.local",
    BIOMETRIC_COLLECTION_ENABLED: "0",
  });
}

async function insertDevice(pool: Pool, serial: string) {
  const deviceId = randomUUID();
  await pool.query(
    `INSERT INTO attendance_adms_devices (
       id, serial_number, lifecycle, timezone, display_name, pre_registration_recovery_completed_at
     ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Oversize Device', now())`,
    [deviceId, serial],
  );
  return deviceId;
}

describe.skipIf(!databaseUrl)("ATT-005 Wave 2 oversized ADMS payload handling", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("stores oversized sensitive device data as hash-only evidence and rejects it with 413", async () => {
    const serial = `SYNTH-OVERSIZE-SENSITIVE-${randomUUID()}`;
    const deviceId = await insertDevice(pool, serial);
    const payload = Buffer.alloc(ADMS_MAX_BODY_BYTES + 1, 0x53);
    const app = Fastify({ logger: false });
    await registerAdmsIngressRoutes(app, pool, disabledConfig());

    const response = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=OPERLOG&Stamp=oversize-sensitive`,
      headers: { host: "adms.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload,
    });

    expect(response.statusCode).toBe(413);

    const journal = await pool.query<{
      body: Buffer | null;
      bodySha256: string;
      bodyByteLength: number;
      bodyCaptured: boolean;
      classification: string;
      safeMetadata: Record<string, string>;
    }>(
      `SELECT
         body,
         body_sha256 AS "bodySha256",
         body_byte_length AS "bodyByteLength",
         body_captured AS "bodyCaptured",
         classification,
         safe_metadata AS "safeMetadata"
       FROM attendance_adms_request_journal
       WHERE device_id = $1
         AND raw_query LIKE '%table=OPERLOG%'
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId],
    );

    expect(journal.rows[0]).toMatchObject({
      body: null,
      bodySha256: createHash("sha256").update(payload).digest("hex"),
      bodyByteLength: payload.length,
      bodyCaptured: false,
      classification: "sensitive_device_data_redacted",
      safeMetadata: {
        protocolTable: "OPERLOG",
        bodyCapture: "hash_only_oversize",
        bodyRedaction: "sensitive_device_data_redacted",
      },
    });

    const projected = await pool.query<{ roster: number; credentials: number }>(
      `SELECT
         (SELECT count(*)::int FROM attendance_adms_device_roster_entries WHERE device_id = $1) AS roster,
         (SELECT count(*)::int FROM attendance_biometric_credentials WHERE origin_device_id = $1) AS credentials`,
      [deviceId],
    );
    expect(projected.rows[0]).toEqual({ roster: 0, credentials: 0 });

    await app.close();
  });

  it("never parses or projects an oversized explicit ATTLOG payload", async () => {
    const serial = `SYNTH-OVERSIZE-ATTLOG-${randomUUID()}`;
    const deviceId = await insertDevice(pool, serial);
    const payload = Buffer.alloc(ADMS_MAX_BODY_BYTES + 1, 0x41);
    const app = Fastify({ logger: false });
    await registerAdmsIngressRoutes(app, pool, disabledConfig());

    const response = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=ATTLOG&Stamp=oversize-attlog`,
      headers: { host: "adms.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload,
    });

    expect(response.statusCode).toBe(413);
    const journal = await pool.query<{
      body: Buffer | null;
      bodyCaptured: boolean;
      classification: string;
      safeMetadata: Record<string, string>;
    }>(
      `SELECT
         body,
         body_captured AS "bodyCaptured",
         classification,
         safe_metadata AS "safeMetadata"
       FROM attendance_adms_request_journal
       WHERE device_id = $1
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId],
    );
    expect(journal.rows[0]).toMatchObject({
      body: null,
      bodyCaptured: false,
      classification: "attlog_oversize_rejected",
      safeMetadata: {
        protocolTable: "ATTLOG",
        bodyCapture: "hash_only_oversize",
      },
    });

    const events = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM attendance_adms_events WHERE device_id = $1`,
      [deviceId],
    );
    expect(events.rows[0]?.count).toBe(0);

    await app.close();
  });
});
