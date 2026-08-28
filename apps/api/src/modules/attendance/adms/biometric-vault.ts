import { createHash, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { ApiConfig } from "../../../config/env.js";
import {
  encryptBiometricPayload,
  type BiometricModality,
  type BiometricPayloadContext,
} from "./biometric-crypto.js";

const SAFE_METADATA_KEYS = new Set([
  "encoding",
  "valid",
  "duress",
  "protocolTable",
  "source",
  "algorithmVersion",
]);

function sanitizeSafeMetadata(input: Record<string, unknown> | undefined) {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
    const normalized = typeof value === "string" ? value.slice(0, 160) : value;
    output[key] = normalized;
  }
  return output;
}

export type ImportBiometricCredentialInput = {
  employeeId: string;
  modality: BiometricModality;
  slotIndex: number | null;
  vendorFormat: string;
  vendorVersion?: string | null;
  originDeviceId?: string | null;
  sourcePin?: string | null;
  capturedAt?: Date | null;
  payload: Buffer;
  actorAccountId?: string | null;
  safeMetadata?: Record<string, unknown>;
};

export type BiometricCredentialMetadata = {
  id: string;
  employeeId: string;
  modality: BiometricModality;
  slotIndex: number | null;
  vendorFormat: string;
  vendorVersion: string | null;
  originDeviceId: string | null;
  sourcePin: string | null;
  capturedAt: Date | null;
  importedAt: Date;
  lifecycle: "active" | "retired" | "destroyed";
  payloadByteLength: number | null;
  encryptionKeyId: string | null;
  safeMetadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

async function findCredentialByHash(
  client: PoolClient,
  employeeId: string,
  modality: BiometricModality,
  payloadSha256: string,
) {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM attendance_biometric_credentials
     WHERE employee_id = $1
       AND modality = $2
       AND payload_sha256 = $3
     LIMIT 1`,
    [employeeId, modality, payloadSha256],
  );
  return result.rows[0]?.id ?? null;
}

export async function importBiometricCredential(
  pool: Pool,
  config: ApiConfig,
  input: ImportBiometricCredentialInput,
): Promise<{ credentialId: string; created: boolean }> {
  const payloadSha256 = createHash("sha256").update(input.payload).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findCredentialByHash(client, input.employeeId, input.modality, payloadSha256);
    if (existing) {
      await client.query("COMMIT");
      return { credentialId: existing, created: false };
    }

    const credentialId = randomUUID();
    const context: BiometricPayloadContext = {
      credentialId,
      employeeId: input.employeeId,
      modality: input.modality,
      slotIndex: input.slotIndex,
      vendorFormat: input.vendorFormat,
    };
    const encrypted = encryptBiometricPayload(input.payload, context, config);
    const safeMetadata = sanitizeSafeMetadata(input.safeMetadata);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO attendance_biometric_credentials (
         id, employee_id, modality, slot_index, vendor_format, vendor_version,
         origin_device_id, source_pin, captured_at, payload_sha256,
         payload_byte_length, encryption_key_id, payload_ciphertext, payload_iv,
         payload_auth_tag, safe_metadata, created_by_account_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14,
         $15, $16::jsonb, $17
       )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        credentialId,
        input.employeeId,
        input.modality,
        input.slotIndex,
        input.vendorFormat,
        input.vendorVersion ?? null,
        input.originDeviceId ?? null,
        input.sourcePin ?? null,
        input.capturedAt ?? null,
        encrypted.sha256,
        encrypted.byteLength,
        encrypted.keyId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        JSON.stringify(safeMetadata),
        input.actorAccountId ?? null,
      ],
    );

    if (!inserted.rowCount) {
      const raced = await findCredentialByHash(client, input.employeeId, input.modality, payloadSha256);
      if (!raced) throw new Error("Biometric credential dedupe conflict could not be resolved");
      await client.query("COMMIT");
      return { credentialId: raced, created: false };
    }

    await client.query(
      `INSERT INTO attendance_biometric_audit_events (
         id, actor_account_id, action, credential_id, employee_id, device_id, safe_metadata
       ) VALUES ($1, $2, 'credential_imported', $3, $4, $5, $6::jsonb)`,
      [
        randomUUID(),
        input.actorAccountId ?? null,
        credentialId,
        input.employeeId,
        input.originDeviceId ?? null,
        JSON.stringify({
          modality: input.modality,
          slotIndex: input.slotIndex,
          vendorFormat: input.vendorFormat,
          source: safeMetadata.source ?? "device",
        }),
      ],
    );

    await client.query("COMMIT");
    return { credentialId, created: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listBiometricCredentialMetadata(
  db: Pool | PoolClient,
  input: { employeeId?: string; originDeviceId?: string; modality?: BiometricModality } = {},
): Promise<BiometricCredentialMetadata[]> {
  const result = await db.query<BiometricCredentialMetadata>(
    `SELECT
       id,
       employee_id AS "employeeId",
       modality,
       slot_index AS "slotIndex",
       vendor_format AS "vendorFormat",
       vendor_version AS "vendorVersion",
       origin_device_id AS "originDeviceId",
       source_pin AS "sourcePin",
       captured_at AS "capturedAt",
       imported_at AS "importedAt",
       lifecycle,
       payload_byte_length AS "payloadByteLength",
       encryption_key_id AS "encryptionKeyId",
       safe_metadata AS "safeMetadata",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM attendance_biometric_credentials
     WHERE ($1::uuid IS NULL OR employee_id = $1)
       AND ($2::uuid IS NULL OR origin_device_id = $2)
       AND ($3::text IS NULL OR modality = $3)
     ORDER BY employee_id, modality, slot_index NULLS LAST, created_at DESC
     LIMIT 1000`,
    [input.employeeId ?? null, input.originDeviceId ?? null, input.modality ?? null],
  );
  return result.rows;
}
