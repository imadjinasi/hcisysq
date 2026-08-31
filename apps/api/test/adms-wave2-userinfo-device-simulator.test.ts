import { randomUUID } from "node:crypto";

import Fastify from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { registerAdmsIngressRoutes } from "../src/modules/attendance/adms/routes.js";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("ATT-005 passive USERINFO observation", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("keeps passive safe roster projection without queueing an active USERINFO read", async () => {
    const serial = `SYNTH-PASSIVE-USER-${randomUUID()}`;
    const deviceId = randomUUID();
    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name, pre_registration_recovery_completed_at
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic passive USERINFO device', now())`,
      [deviceId, serial],
    );

    const app = Fastify({ logger: false });
    await registerAdmsIngressRoutes(app, pool, loadConfig({
      DATABASE_URL: databaseUrl!,
      ADMS_INGRESS_HOST: "adms-passive-userinfo.test.local",
      BIOMETRIC_COLLECTION_ENABLED: "0",
    }));

    const syntheticBody = [
      "USER PIN=0042",
      "Name=Synthetic Passive User",
      "Passwd=synthetic-secret-that-must-not-be-journaled",
      "Card=000123",
      "Pri=0",
      "Verify=1",
      "Grp=2",
    ].join("\t") + "\n";
    const upload = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=USERINFO&Stamp=passive-user-1`,
      headers: { host: "adms-passive-userinfo.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload: syntheticBody,
    });

    expect(upload.statusCode).toBe(200);
    expect(upload.body).toBe("OK: 1");

    const roster = await pool.query<{
      pin: string;
      displayName: string | null;
      cardNumber: string | null;
      sourceRequestId: string | null;
    }>(
      `SELECT pin, display_name AS "displayName", card_number AS "cardNumber",
              source_request_id AS "sourceRequestId"
       FROM attendance_adms_device_roster_entries
       WHERE device_id = $1 AND pin = '0042'`,
      [deviceId],
    );
    expect(roster.rows[0]).toMatchObject({
      pin: "0042",
      displayName: "Synthetic Passive User",
      cardNumber: "000123",
    });

    const journal = await pool.query<{ body: Buffer | null; classification: string }>(
      `SELECT body, classification
       FROM attendance_adms_request_journal
       WHERE id = $1`,
      [roster.rows[0]?.sourceRequestId],
    );
    expect(journal.rows[0]).toEqual({
      body: null,
      classification: "sensitive_device_data_redacted",
    });
    expect(JSON.stringify(journal.rows[0])).not.toContain("synthetic-secret-that-must-not-be-journaled");

    const activeReads = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_adms_commands
       WHERE device_id = $1
         AND wire_command LIKE 'DATA QUERY USERINFO%'`,
      [deviceId],
    );
    expect(activeReads.rows[0]?.count).toBe(0);

    await app.close();
  });
});
