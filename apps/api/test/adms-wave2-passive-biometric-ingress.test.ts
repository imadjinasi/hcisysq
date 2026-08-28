import { createHash, randomUUID } from "node:crypto";

import Fastify from "fastify";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import { decryptBiometricPayload } from "../src/modules/attendance/adms/biometric-crypto.js";
import { registerAdmsIngressRoutes } from "../src/modules/attendance/adms/routes.js";

const databaseUrl = process.env.DATABASE_URL;
const keyHex = "66".repeat(32);

function enabledConfig() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    ADMS_INGRESS_HOST: "adms.test.local",
    BIOMETRIC_COLLECTION_ENABLED: "1",
    BIOMETRIC_ACTIVE_KEY_ID: "passive-test-v1",
    BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify({ "passive-test-v1": keyHex }),
  });
}

function disabledConfig() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    ADMS_INGRESS_HOST: "adms.test.local",
    BIOMETRIC_COLLECTION_ENABLED: "0",
  });
}

function templateRecord(pin: string, fid = 2) {
  const tmp = Buffer.from(`synthetic-passive-template-${pin}-${fid}`, "utf8").toString("base64");
  return {
    tmp,
    body: `FP PIN=${pin}\tFID=${fid}\tSize=${tmp.length}\tValid=1\tTMP=${tmp}\n`,
  };
}

async function insertDevice(pool: Pool, serial: string) {
  const deviceId = randomUUID();
  await pool.query(
    `INSERT INTO attendance_adms_devices (
       id, serial_number, lifecycle, timezone, display_name
     ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Passive Biometric Device')`,
    [deviceId, serial],
  );
  return deviceId;
}

async function insertEmployee(pool: Pool) {
  const employeeId = randomUUID();
  await pool.query(
    `INSERT INTO employees (id, employee_number, full_name, status)
     VALUES ($1, $2, 'Synthetic Passive Biometric Employee', 'active')`,
    [employeeId, `W2-PASSIVE-${randomUUID()}`],
  );
  return employeeId;
}

describe.skipIf(!databaseUrl)("ATT-005 Wave 2 passive biometric ingress", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("redacts and acknowledges fingerprint upload while collection is disabled without creating vault data", async () => {
    const serial = `SYNTH-PASSIVE-OFF-${randomUUID()}`;
    const deviceId = await insertDevice(pool, serial);
    const { body, tmp } = templateRecord("0042");
    const app = Fastify({ logger: false });
    await registerAdmsIngressRoutes(app, pool, disabledConfig());

    const response = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=OPERLOG&Stamp=100`,
      headers: { host: "adms.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("OK: 1");
    const journal = await pool.query<{ body: Buffer | null; safeMetadata: Record<string, string> }>(
      `SELECT body, safe_metadata AS "safeMetadata"
       FROM attendance_adms_request_journal
       WHERE device_id = $1
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId],
    );
    expect(journal.rows[0]?.body).toBeNull();
    expect(journal.rows[0]?.safeMetadata).toMatchObject({
      protocolTable: "OPERLOG",
      bodyRedaction: "sensitive_device_data_redacted",
      biometricRecordCount: "1",
    });
    expect(JSON.stringify(journal.rows[0])).not.toContain(tmp);

    const count = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_biometric_credentials
       WHERE origin_device_id = $1`,
      [deviceId],
    );
    expect(count.rows[0]?.count).toBe(0);
    await app.close();
  });

  it("imports to the mapped active employee only and records redacted provenance plus device presence", async () => {
    const serial = `SYNTH-PASSIVE-ON-${randomUUID()}`;
    const deviceId = await insertDevice(pool, serial);
    const employeeId = await insertEmployee(pool);
    const mappingId = randomUUID();
    await pool.query(
      `INSERT INTO attendance_adms_employee_mappings (
         id, device_id, pin, employee_id, effective_from
       ) VALUES ($1, $2, '0042', $3, now() - interval '1 hour')`,
      [mappingId, deviceId, employeeId],
    );

    const { body, tmp } = templateRecord("0042", 3);
    const config = enabledConfig();
    const app = Fastify({ logger: false });
    await registerAdmsIngressRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=OPERLOG&Stamp=101`,
      headers: { host: "adms.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("OK: 1");

    const journal = await pool.query<{
      id: string;
      body: Buffer | null;
      bodySha256: string;
      bodyByteLength: number;
    }>(
      `SELECT
         id,
         body,
         body_sha256 AS "bodySha256",
         body_byte_length AS "bodyByteLength"
       FROM attendance_adms_request_journal
       WHERE device_id = $1
       ORDER BY received_at DESC
       LIMIT 1`,
      [deviceId],
    );
    expect(journal.rows[0]?.body).toBeNull();
    expect(journal.rows[0]?.bodySha256).toBe(createHash("sha256").update(body).digest("hex"));
    expect(journal.rows[0]?.bodyByteLength).toBe(Buffer.byteLength(body));

    const credential = await pool.query<{
      id: string;
      mappedEmployeeId: string;
      sourceRequestId: string;
      modality: "fingerprint";
      slotIndex: number;
      vendorFormat: string;
      sourcePin: string;
      payloadCiphertext: Buffer;
      payloadIv: Buffer;
      payloadAuthTag: Buffer;
      payloadSha256: string;
      payloadByteLength: number;
      encryptionKeyId: string;
      safeMetadata: Record<string, unknown>;
    }>(
      `SELECT
         id,
         employee_id AS "mappedEmployeeId",
         source_request_id AS "sourceRequestId",
         modality,
         slot_index AS "slotIndex",
         vendor_format AS "vendorFormat",
         source_pin AS "sourcePin",
         payload_ciphertext AS "payloadCiphertext",
         payload_iv AS "payloadIv",
         payload_auth_tag AS "payloadAuthTag",
         payload_sha256 AS "payloadSha256",
         payload_byte_length AS "payloadByteLength",
         encryption_key_id AS "encryptionKeyId",
         safe_metadata AS "safeMetadata"
       FROM attendance_biometric_credentials
       WHERE origin_device_id = $1`,
      [deviceId],
    );
    expect(credential.rows).toHaveLength(1);
    expect(credential.rows[0]).toMatchObject({
      mappedEmployeeId: employeeId,
      sourceRequestId: journal.rows[0]?.id,
      modality: "fingerprint",
      slotIndex: 3,
      vendorFormat: "zkteco-push-fingertmp-base64",
      sourcePin: "0042",
      payloadByteLength: Buffer.byteLength(tmp),
      encryptionKeyId: "passive-test-v1",
      safeMetadata: {
        encoding: "base64",
        valid: true,
        duress: false,
        protocolTable: "OPERLOG",
        source: "device_passive_upload",
      },
    });
    expect(credential.rows[0]!.payloadCiphertext.equals(Buffer.from(tmp, "utf8"))).toBe(false);

    const plaintext = decryptBiometricPayload(
      {
        ciphertext: credential.rows[0]!.payloadCiphertext,
        iv: credential.rows[0]!.payloadIv,
        authTag: credential.rows[0]!.payloadAuthTag,
        keyId: credential.rows[0]!.encryptionKeyId,
        sha256: credential.rows[0]!.payloadSha256,
        byteLength: credential.rows[0]!.payloadByteLength,
      },
      {
        credentialId: credential.rows[0]!.id,
        employeeId,
        modality: "fingerprint",
        slotIndex: 3,
        vendorFormat: "zkteco-push-fingertmp-base64",
      },
      config,
    );
    expect(plaintext.toString("utf8")).toBe(tmp);

    const replica = await pool.query<{
      state: string;
      devicePayloadSha256: string;
      deviceVendorFormat: string;
      observedAt: Date | null;
      safeMetadata: Record<string, unknown>;
    }>(
      `SELECT
         state,
         device_payload_sha256 AS "devicePayloadSha256",
         device_vendor_format AS "deviceVendorFormat",
         observed_at AS "observedAt",
         safe_metadata AS "safeMetadata"
       FROM attendance_biometric_device_states
       WHERE credential_id = $1 AND device_id = $2`,
      [credential.rows[0]!.id, deviceId],
    );
    expect(replica.rows).toHaveLength(1);
    expect(replica.rows[0]).toMatchObject({
      state: "present",
      devicePayloadSha256: createHash("sha256").update(Buffer.from(tmp, "utf8")).digest("hex"),
      deviceVendorFormat: "zkteco-push-fingertmp-base64",
      safeMetadata: {
        source: "device_passive_upload",
        sourceRequestId: journal.rows[0]?.id,
      },
    });
    expect(replica.rows[0]?.observedAt).not.toBeNull();

    const audit = await pool.query<{ safeMetadata: Record<string, unknown> }>(
      `SELECT safe_metadata AS "safeMetadata"
       FROM attendance_biometric_audit_events
       WHERE credential_id = $1`,
      [credential.rows[0]!.id],
    );
    expect(JSON.stringify(audit.rows)).not.toContain(tmp);
    expect(JSON.stringify(audit.rows)).not.toContain(body);

    await app.close();
  });

  it("does not guess an employee when the device PIN has no explicit mapping", async () => {
    const serial = `SYNTH-PASSIVE-UNMAPPED-${randomUUID()}`;
    const deviceId = await insertDevice(pool, serial);
    const { body } = templateRecord("0099");
    const app = Fastify({ logger: false });
    await registerAdmsIngressRoutes(app, pool, enabledConfig());

    const response = await app.inject({
      method: "POST",
      url: `/iclock/cdata?SN=${encodeURIComponent(serial)}&table=OPERLOG&Stamp=102`,
      headers: { host: "adms.test.local", "content-type": "text/plain; charset=UTF-8" },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    const count = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_biometric_credentials
       WHERE origin_device_id = $1`,
      [deviceId],
    );
    expect(count.rows[0]?.count).toBe(0);
    await app.close();
  });
});
