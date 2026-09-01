import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import {
  decryptBiometricPayload,
  type BiometricPayloadContext,
  type EncryptedBiometricPayload,
} from "../src/modules/attendance/adms/biometric-crypto.js";
import {
  getBiometricControlPlaneSummary,
  listBiometricControlPlaneCredentials,
  reencryptBiometricCredentialBatch,
} from "../src/modules/attendance/adms/biometric-control-plane.js";
import { importBiometricCredential } from "../src/modules/attendance/adms/biometric-vault.js";

const databaseUrl = process.env.DATABASE_URL;
const keyV1 = "66".repeat(32);
const keyV2 = "77".repeat(32);

function collectionConfig() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    AUTH_ENCRYPTION_KEY: "88".repeat(32),
    BIOMETRIC_COLLECTION_ENABLED: "1",
    BIOMETRIC_ACTIVE_KEY_ID: "synthetic-v1",
    BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify({ "synthetic-v1": keyV1 }),
  });
}

function maintenanceConfig() {
  return loadConfig({
    DATABASE_URL: databaseUrl!,
    AUTH_ENCRYPTION_KEY: "88".repeat(32),
    BIOMETRIC_COLLECTION_ENABLED: "0",
    BIOMETRIC_ACTIVE_KEY_ID: "synthetic-v2",
    BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify({
      "synthetic-v1": keyV1,
      "synthetic-v2": keyV2,
    }),
  });
}

describe.skipIf(!databaseUrl)("ATT-005 biometric control plane", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reviews lifecycle metadata and re-encrypts a synthetic envelope with collection OFF", async () => {
    const employeeId = randomUUID();
    const accountId = randomUUID();
    const payload = Buffer.from("synthetic-biometric-restore-drill-only", "utf8");

    await pool.query(
      `INSERT INTO employees (id, employee_number, full_name, status)
       VALUES ($1, $2, 'Synthetic Biometric Review Employee', 'active')`,
      [employeeId, `BIO-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO accounts (
         id, employee_id, email, principal_type, status,
         mfa_secret_ciphertext, mfa_secret_iv, mfa_secret_tag, mfa_enabled_at
       ) VALUES ($1, NULL, $2, 'SUPER_ADMIN', 'active', 'synthetic', 'synthetic', 'synthetic', now())`,
      [accountId, `bio-admin-${randomUUID()}@example.invalid`],
    );

    const imported = await importBiometricCredential(pool, collectionConfig(), {
      employeeId,
      modality: "fingerprint",
      slotIndex: 4,
      vendorFormat: "synthetic-fp-v1",
      vendorVersion: "test-only",
      payload,
      safeMetadata: { source: "synthetic_restore_drill" },
    });
    expect(imported.created).toBe(true);

    await pool.query(`UPDATE employees SET status = 'inactive' WHERE id = $1`, [employeeId]);

    const before = await getBiometricControlPlaneSummary(pool, maintenanceConfig());
    expect(before.rawPayloadExposed).toBe(false);
    expect(before.collection.globalEnabled).toBe(false);
    expect(before.keyring).toEqual({ configured: true, ready: true, configuredKeyCount: 2 });
    expect(before.vault.lifecycleReviewRequiredCount).toBeGreaterThanOrEqual(1);
    expect(before.vault.rotationRequiredCount).toBeGreaterThanOrEqual(1);
    expect(before.capabilities.find((item) => item.key === "local_reencryption")?.state).toBe("available");
    expect(before.capabilities.find((item) => item.key === "restore_to_device")?.state).toBe("not_verified");
    expect(before.retention.masterDestroyEnabled).toBe(false);

    const review = await listBiometricControlPlaneCredentials(pool, {
      page: 1,
      pageSize: 25,
      employeeId,
      lifecycleReviewOnly: true,
    });
    expect(review.rawPayloadExposed).toBe(false);
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({
      id: imported.credentialId,
      employeeId,
      employeeStatus: "inactive",
      modality: "fingerprint",
      lifecycleReviewRequired: true,
      envelopeVersion: "aes-256-gcm-v1",
    });
    expect(JSON.stringify(review)).not.toContain(payload.toString("utf8"));
    expect(JSON.stringify(review)).not.toContain("synthetic-v1");
    expect(JSON.stringify(review)).not.toContain("synthetic-v2");

    const rotation = await reencryptBiometricCredentialBatch(pool, maintenanceConfig(), {
      actorAccountId: accountId,
      limit: 25,
      credentialIds: [imported.credentialId],
    });
    expect(rotation).toEqual({
      rawPayloadExposed: false,
      processedCount: 1,
      remainingCount: 0,
    });

    const stored = await pool.query<{
      employeeId: string;
      modality: "fingerprint";
      slotIndex: number;
      vendorFormat: string;
      encryptionKeyId: string;
      payloadCiphertext: Buffer;
      payloadIv: Buffer;
      payloadAuthTag: Buffer;
      payloadSha256: string;
      payloadByteLength: number;
      lastReencryptedAt: Date | null;
    }>(
      `SELECT
         employee_id AS "employeeId",
         modality,
         slot_index AS "slotIndex",
         vendor_format AS "vendorFormat",
         encryption_key_id AS "encryptionKeyId",
         payload_ciphertext AS "payloadCiphertext",
         payload_iv AS "payloadIv",
         payload_auth_tag AS "payloadAuthTag",
         payload_sha256 AS "payloadSha256",
         payload_byte_length AS "payloadByteLength",
         last_reencrypted_at AS "lastReencryptedAt"
       FROM attendance_biometric_credentials
       WHERE id = $1`,
      [imported.credentialId],
    );
    const row = stored.rows[0]!;
    expect(row.encryptionKeyId).toBe("synthetic-v2");
    expect(row.lastReencryptedAt).toBeInstanceOf(Date);

    const context: BiometricPayloadContext = {
      credentialId: imported.credentialId,
      employeeId: row.employeeId,
      modality: row.modality,
      slotIndex: row.slotIndex,
      vendorFormat: row.vendorFormat,
    };
    const envelope: EncryptedBiometricPayload = {
      ciphertext: row.payloadCiphertext,
      iv: row.payloadIv,
      authTag: row.payloadAuthTag,
      keyId: row.encryptionKeyId,
      sha256: row.payloadSha256,
      byteLength: row.payloadByteLength,
    };
    expect(decryptBiometricPayload(envelope, context, maintenanceConfig())).toEqual(payload);

    const audit = await pool.query<{ action: string; safeMetadata: Record<string, unknown> }>(
      `SELECT action, safe_metadata AS "safeMetadata"
       FROM attendance_biometric_audit_events
       WHERE credential_id = $1
       ORDER BY created_at, id`,
      [imported.credentialId],
    );
    expect(audit.rows.map((item) => item.action)).toEqual([
      "credential_imported",
      "credential_reencrypted",
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(payload.toString("utf8"));
    expect(JSON.stringify(audit.rows)).not.toContain("synthetic-v1");
    expect(JSON.stringify(audit.rows)).not.toContain("synthetic-v2");
  });
});