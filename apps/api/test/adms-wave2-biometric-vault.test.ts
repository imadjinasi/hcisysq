import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import {
  importBiometricCredential,
  listBiometricCredentialMetadata,
} from "../src/modules/attendance/adms/biometric-vault.js";

const databaseUrl = process.env.DATABASE_URL;

function vaultConfig() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    BIOMETRIC_COLLECTION_ENABLED: "1",
    BIOMETRIC_ACTIVE_KEY_ID: "test-v1",
    BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify({ test_v0: "44".repeat(32), "test-v1": "55".repeat(32) }),
  });
}

describe.skipIf(!databaseUrl)("ATT-005 Wave 2 encrypted biometric vault", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("stores only an AES-GCM envelope and deduplicates a synthetic opaque payload", async () => {
    const employeeId = randomUUID();
    const employeeNumber = `W2-${randomUUID()}`;
    const deviceId = randomUUID();
    await pool.query(
      `INSERT INTO employees (id, employee_number, full_name, status)
       VALUES ($1, $2, 'Synthetic Vault Employee', 'active')`,
      [employeeId, employeeNumber],
    );
    await pool.query(
      `INSERT INTO attendance_adms_devices (
         id, serial_number, lifecycle, timezone, display_name
       ) VALUES ($1, $2, 'active', 'Asia/Jakarta', 'Synthetic Vault Device')`,
      [deviceId, `SYNTH-VAULT-${randomUUID()}`],
    );

    const payload = Buffer.from("synthetic-opaque-template-do-not-use-as-biometric-fixture", "utf8");
    const first = await importBiometricCredential(pool, vaultConfig(), {
      employeeId,
      modality: "fingerprint",
      slotIndex: 2,
      vendorFormat: "zkteco-fp-opaque",
      originDeviceId: deviceId,
      sourcePin: "0042",
      payload,
      safeMetadata: {
        encoding: "opaque-test",
        source: "synthetic_integration_test",
        ignoredSecret: "must-not-copy",
      },
    });
    const second = await importBiometricCredential(pool, vaultConfig(), {
      employeeId,
      modality: "fingerprint",
      slotIndex: 2,
      vendorFormat: "zkteco-fp-opaque",
      originDeviceId: deviceId,
      sourcePin: "0042",
      payload,
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({ credentialId: first.credentialId, created: false });

    const stored = await pool.query<{
      payloadCiphertext: Buffer;
      payloadIv: Buffer;
      payloadAuthTag: Buffer;
      payloadSha256: string;
      payloadByteLength: number;
      encryptionKeyId: string;
      safeMetadata: Record<string, unknown>;
    }>(
      `SELECT
         payload_ciphertext AS "payloadCiphertext",
         payload_iv AS "payloadIv",
         payload_auth_tag AS "payloadAuthTag",
         payload_sha256 AS "payloadSha256",
         payload_byte_length AS "payloadByteLength",
         encryption_key_id AS "encryptionKeyId",
         safe_metadata AS "safeMetadata"
       FROM attendance_biometric_credentials
       WHERE id = $1`,
      [first.credentialId],
    );
    expect(stored.rows[0]?.payloadCiphertext.equals(payload)).toBe(false);
    expect(stored.rows[0]?.payloadIv).toHaveLength(12);
    expect(stored.rows[0]?.payloadAuthTag).toHaveLength(16);
    expect(stored.rows[0]?.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]?.payloadByteLength).toBe(payload.length);
    expect(stored.rows[0]?.encryptionKeyId).toBe("test-v1");
    expect(stored.rows[0]?.safeMetadata).toEqual({
      encoding: "opaque-test",
      source: "synthetic_integration_test",
    });
    expect(JSON.stringify(stored.rows[0]?.safeMetadata)).not.toContain("must-not-copy");

    const metadata = await listBiometricCredentialMetadata(pool, { employeeId });
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({
      id: first.credentialId,
      employeeId,
      modality: "fingerprint",
      slotIndex: 2,
      vendorFormat: "zkteco-fp-opaque",
      sourcePin: "0042",
      lifecycle: "active",
      payloadByteLength: payload.length,
      encryptionKeyId: "test-v1",
    });
    expect(JSON.stringify(metadata)).not.toContain(payload.toString("utf8"));

    const audit = await pool.query<{ action: string; safeMetadata: Record<string, unknown> }>(
      `SELECT action, safe_metadata AS "safeMetadata"
       FROM attendance_biometric_audit_events
       WHERE credential_id = $1`,
      [first.credentialId],
    );
    expect(audit.rows).toEqual([
      {
        action: "credential_imported",
        safeMetadata: {
          modality: "fingerprint",
          slotIndex: 2,
          vendorFormat: "zkteco-fp-opaque",
          source: "synthetic_integration_test",
        },
      },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(payload.toString("utf8"));
  });
});
