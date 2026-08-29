import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { importMappedPassiveBiometrics } from "../src/modules/attendance/adms/biometric-ingress.js";

const databaseUrl = process.env.DATABASE_URL;
const keyHex = "88".repeat(32);

function enabledConfig() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    BIOMETRIC_COLLECTION_ENABLED: "1",
    BIOMETRIC_ACTIVE_KEY_ID: "race-v1",
    BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify({ "race-v1": keyHex }),
  });
}

describe.skipIf(!databaseUrl)("ATT-005 Wave 2 biometric pilot policy serialization", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("does not import after a concurrent pilot disable commits", async () => {
    const deviceId = randomUUID();
    const employeeId = randomUUID();
    const mappingId = randomUUID();
    const requestId = randomUUID();

    await pool.query(
      `INSERT INTO employees (id, employee_number, full_name, status)
       VALUES ($1, $2, 'Synthetic Policy Race Employee', 'active')`,
      [employeeId, `W2-RACE-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name,
         biometric_collection_enabled, biometric_collection_enabled_at
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Policy Race Device', true, now())`,
      [deviceId, `W2-RACE-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO attendance_adms_employee_mappings (
         id, device_id, pin, employee_id, effective_from
       ) VALUES ($1, $2, '0042', $3, now() - interval '1 hour')`,
      [mappingId, deviceId, employeeId],
    );
    await pool.query(
      `INSERT INTO attendance_adms_request_journal (
         id, device_id, method, path, raw_query, safe_metadata,
         body, body_sha256, body_byte_length, body_captured,
         classification, response_status, received_at
       ) VALUES (
         $1, $2, 'POST', '/iclock/cdata', '?table=OPERLOG',
         '{"bodyRedaction":"sensitive_device_data_redacted"}'::jsonb,
         NULL, repeat('a', 64), 64, true,
         'sensitive_device_data_redacted', 200, now()
       )`,
      [requestId, deviceId],
    );

    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        `SELECT id FROM attendance_adms_devices WHERE id = $1 FOR UPDATE`,
        [deviceId],
      );
      await blocker.query(
        `UPDATE attendance_adms_devices
         SET biometric_collection_enabled = false,
             biometric_collection_enabled_at = NULL,
             biometric_collection_enabled_by_account_id = NULL
         WHERE id = $1`,
        [deviceId],
      );

      const importPromise = importMappedPassiveBiometrics(pool, enabledConfig(), {
        deviceId,
        sourceRequestId: requestId,
        observedAt: new Date(),
        records: [
          {
            pin: "0042",
            modality: "fingerprint",
            slotIndex: 1,
            vendorFormat: "zkteco-push-fingertmp-base64",
            payload: Buffer.from("c3ludGhldGljLXJhY2UtdGVtcGxhdGU=", "utf8"),
            safeMetadata: {
              encoding: "base64",
              valid: true,
              duress: false,
              protocolTable: "OPERLOG",
              source: "device_passive_upload",
            },
          },
        ],
      });

      await blocker.query("COMMIT");
      const result = await importPromise;
      expect(result).toMatchObject({
        imported: 0,
        deduplicated: 0,
        skippedDeviceCollectionDisabled: 1,
      });
    } finally {
      try {
        await blocker.query("ROLLBACK");
      } catch {
        // Transaction is already closed after COMMIT.
      }
      blocker.release();
    }

    const credentials = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_biometric_credentials
       WHERE origin_device_id = $1`,
      [deviceId],
    );
    expect(credentials.rows[0]?.count).toBe(0);
  });
});
