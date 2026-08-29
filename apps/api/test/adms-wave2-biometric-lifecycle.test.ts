import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("ATT-005 Wave 2 biometric lifecycle constraints", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl! });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("keeps biometric audit append-only", async () => {
    const employeeId = randomUUID();
    const auditId = randomUUID();
    await pool.query(
      `INSERT INTO employees (id, employee_number, full_name, status)
       VALUES ($1, $2, 'Synthetic Audit Employee', 'active')`,
      [employeeId, `W2-AUDIT-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO attendance_biometric_audit_events (
         id, action, employee_id, safe_metadata
       ) VALUES ($1, 'enrollment_requested', $2, '{"source":"synthetic_test"}'::jsonb)`,
      [auditId, employeeId],
    );

    await expect(
      pool.query(
        `UPDATE attendance_biometric_audit_events
         SET safe_metadata = '{}'::jsonb
         WHERE id = $1`,
        [auditId],
      ),
    ).rejects.toMatchObject({ message: "biometric audit is append-only" });

    await expect(
      pool.query(`DELETE FROM attendance_biometric_audit_events WHERE id = $1`, [auditId]),
    ).rejects.toMatchObject({ message: "biometric audit is append-only" });

    const retained = await pool.query<{ action: string; safeMetadata: Record<string, unknown> }>(
      `SELECT action, safe_metadata AS "safeMetadata"
       FROM attendance_biometric_audit_events
       WHERE id = $1`,
      [auditId],
    );
    expect(retained.rows[0]).toEqual({
      action: "enrollment_requested",
      safeMetadata: { source: "synthetic_test" },
    });
  });

  it("requires cryptographic payload fields to be absent once a credential is destroyed", async () => {
    const employeeId = randomUUID();
    const credentialId = randomUUID();
    await pool.query(
      `INSERT INTO employees (id, employee_number, full_name, status)
       VALUES ($1, $2, 'Synthetic Destroyed Employee', 'active')`,
      [employeeId, `W2-DESTROY-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO attendance_biometric_credentials (
         id, employee_id, modality, slot_index, vendor_format, lifecycle,
         payload_sha256, payload_byte_length, encryption_key_id,
         payload_ciphertext, payload_iv, payload_auth_tag
       ) VALUES (
         $1, $2, 'fingerprint', 1, 'synthetic-format', 'active',
         $3, 4, 'test-key',
         decode('01020304', 'hex'), decode('000102030405060708090a0b', 'hex'),
         decode('000102030405060708090a0b0c0d0e0f', 'hex')
       )`,
      [credentialId, employeeId, "aa".repeat(32)],
    );

    await expect(
      pool.query(
        `UPDATE attendance_biometric_credentials
         SET lifecycle = 'destroyed', destroyed_at = now()
         WHERE id = $1`,
        [credentialId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await pool.query(
      `UPDATE attendance_biometric_credentials
       SET lifecycle = 'destroyed',
           payload_sha256 = NULL,
           payload_byte_length = NULL,
           encryption_key_id = NULL,
           payload_ciphertext = NULL,
           payload_iv = NULL,
           payload_auth_tag = NULL,
           destroyed_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [credentialId],
    );

    const destroyed = await pool.query<{
      lifecycle: string;
      payloadSha256: string | null;
      payloadByteLength: number | null;
      encryptionKeyId: string | null;
      payloadCiphertext: Buffer | null;
      payloadIv: Buffer | null;
      payloadAuthTag: Buffer | null;
      destroyedAt: Date | null;
    }>(
      `SELECT
         lifecycle,
         payload_sha256 AS "payloadSha256",
         payload_byte_length AS "payloadByteLength",
         encryption_key_id AS "encryptionKeyId",
         payload_ciphertext AS "payloadCiphertext",
         payload_iv AS "payloadIv",
         payload_auth_tag AS "payloadAuthTag",
         destroyed_at AS "destroyedAt"
       FROM attendance_biometric_credentials
       WHERE id = $1`,
      [credentialId],
    );
    expect(destroyed.rows[0]).toMatchObject({
      lifecycle: "destroyed",
      payloadSha256: null,
      payloadByteLength: null,
      encryptionKeyId: null,
      payloadCiphertext: null,
      payloadIv: null,
      payloadAuthTag: null,
    });
    expect(destroyed.rows[0]?.destroyedAt).not.toBeNull();
  });
});
