import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { ApiConfig } from "../../../config/env.js";
import {
  activeBiometricKeyId,
  biometricCollectionEnabled,
  biometricKeyringReadiness,
  reencryptBiometricPayload,
  type BiometricModality,
  type BiometricPayloadContext,
  type EncryptedBiometricPayload,
} from "./biometric-crypto.js";

const ENVELOPE_VERSION = "aes-256-gcm-v1";

export type BiometricCapabilityState = "available" | "blocked" | "not_verified";

export type BiometricCapability = {
  key: string;
  label: string;
  state: BiometricCapabilityState;
  reason: string | null;
  deviceCommandRequired: boolean;
};

type VaultSummaryRow = {
  totalCount: number;
  activeCount: number;
  retiredCount: number;
  destroyedCount: number;
  employeeCount: number;
  fingerprintCount: number;
  faceCount: number;
  palmCount: number;
  bioPhotoCount: number;
  lifecycleReviewRequiredCount: number;
};

type ReplicaSummaryRow = {
  unknownCount: number;
  missingCount: number;
  presentCount: number;
  staleCount: number;
  conflictCount: number;
  pendingCount: number;
  succeededCount: number;
  failedCount: number;
};

type DevicePolicyRow = {
  id: string;
  serialNumber: string;
  displayName: string | null;
  model: string | null;
  firmwareVersion: string | null;
  lifecycle: "active" | "disabled" | "quarantined";
  deviceCollectionEnabled: boolean;
};

type ReencryptRow = {
  id: string;
  employeeId: string;
  modality: BiometricModality;
  slotIndex: number | null;
  vendorFormat: string;
  envelopeVersion: string;
  encryptionKeyId: string;
  payloadCiphertext: Buffer;
  payloadIv: Buffer;
  payloadAuthTag: Buffer;
  payloadSha256: string;
  payloadByteLength: number;
};

export type BiometricCredentialListItem = {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeStatus: "active" | "inactive" | "resigned";
  modality: BiometricModality;
  slotIndex: number | null;
  vendorFormat: string;
  vendorVersion: string | null;
  originDeviceId: string | null;
  originDeviceSerial: string | null;
  capturedAt: Date | null;
  importedAt: Date;
  lifecycle: "active" | "retired" | "destroyed";
  payloadByteLength: number | null;
  envelopeVersion: string;
  lastReencryptedAt: Date | null;
  lifecycleReviewRequired: boolean;
};

function zeroVaultSummary(): VaultSummaryRow {
  return {
    totalCount: 0,
    activeCount: 0,
    retiredCount: 0,
    destroyedCount: 0,
    employeeCount: 0,
    fingerprintCount: 0,
    faceCount: 0,
    palmCount: 0,
    bioPhotoCount: 0,
    lifecycleReviewRequiredCount: 0,
  };
}

function zeroReplicaSummary(): ReplicaSummaryRow {
  return {
    unknownCount: 0,
    missingCount: 0,
    presentCount: 0,
    staleCount: 0,
    conflictCount: 0,
    pendingCount: 0,
    succeededCount: 0,
    failedCount: 0,
  };
}

function buildCapabilities(input: {
  keyringReady: boolean;
  globalCollectionEnabled: boolean;
  device?: DevicePolicyRow | null;
}): BiometricCapability[] {
  const effectiveCollection = Boolean(
    input.globalCollectionEnabled &&
    input.device?.deviceCollectionEnabled &&
    input.device?.lifecycle === "active",
  );

  return [
    {
      key: "vault_metadata",
      label: "Inventaris vault terenkripsi",
      state: "available",
      reason: null,
      deviceCommandRequired: false,
    },
    {
      key: "local_reencryption",
      label: "Rotasi envelope lokal",
      state: input.keyringReady ? "available" : "blocked",
      reason: input.keyringReady ? null : "biometric_keyring_not_configured",
      deviceCommandRequired: false,
    },
    {
      key: "passive_collection",
      label: "Koleksi biometric pasif",
      state: effectiveCollection ? "available" : "blocked",
      reason: effectiveCollection
        ? null
        : !input.globalCollectionEnabled
          ? "global_collection_off"
          : !input.device
            ? "device_context_required"
            : !input.device.deviceCollectionEnabled
              ? "device_collection_off"
              : "device_not_active",
      deviceCommandRequired: false,
    },
    {
      key: "template_query",
      label: "Query template dari mesin",
      state: "not_verified",
      reason: "physical_protocol_not_verified",
      deviceCommandRequired: true,
    },
    {
      key: "restore_to_device",
      label: "Restore template ke mesin",
      state: "not_verified",
      reason: "physical_protocol_not_verified",
      deviceCommandRequired: true,
    },
    {
      key: "distribution",
      label: "Distribusi template antar mesin",
      state: "not_verified",
      reason: "physical_protocol_not_verified",
      deviceCommandRequired: true,
    },
    {
      key: "remote_enrollment",
      label: "Enrollment biometric jarak jauh",
      state: "not_verified",
      reason: "physical_protocol_not_verified",
      deviceCommandRequired: true,
    },
    {
      key: "device_delete",
      label: "Hapus biometric di mesin",
      state: "not_verified",
      reason: "physical_protocol_not_verified",
      deviceCommandRequired: true,
    },
    {
      key: "master_destroy",
      label: "Musnahkan master credential HCIS",
      state: "blocked",
      reason: "retention_policy_pending",
      deviceCommandRequired: false,
    },
  ];
}

export async function getBiometricControlPlaneSummary(
  pool: Pool,
  config: ApiConfig,
  deviceId?: string,
) {
  const keyring = biometricKeyringReadiness(config);
  const globalCollectionEnabled = biometricCollectionEnabled(config);

  const vaultResult = await pool.query<VaultSummaryRow>(
    `SELECT
       count(*)::int AS "totalCount",
       (count(*) FILTER (WHERE c.lifecycle = 'active'))::int AS "activeCount",
       (count(*) FILTER (WHERE c.lifecycle = 'retired'))::int AS "retiredCount",
       (count(*) FILTER (WHERE c.lifecycle = 'destroyed'))::int AS "destroyedCount",
       count(DISTINCT c.employee_id)::int AS "employeeCount",
       (count(*) FILTER (WHERE c.modality = 'fingerprint'))::int AS "fingerprintCount",
       (count(*) FILTER (WHERE c.modality = 'face'))::int AS "faceCount",
       (count(*) FILTER (WHERE c.modality = 'palm'))::int AS "palmCount",
       (count(*) FILTER (WHERE c.modality = 'bio_photo'))::int AS "bioPhotoCount",
       (count(*) FILTER (
         WHERE c.lifecycle <> 'destroyed'
           AND emp.status <> 'active'
       ))::int AS "lifecycleReviewRequiredCount"
     FROM attendance_biometric_credentials c
     JOIN employees emp ON emp.id = c.employee_id`,
  );
  const vault = vaultResult.rows[0] ?? zeroVaultSummary();

  const replicaResult = await pool.query<ReplicaSummaryRow>(
    `SELECT
       (count(*) FILTER (WHERE state = 'unknown'))::int AS "unknownCount",
       (count(*) FILTER (WHERE state = 'missing'))::int AS "missingCount",
       (count(*) FILTER (WHERE state = 'present'))::int AS "presentCount",
       (count(*) FILTER (WHERE state = 'stale'))::int AS "staleCount",
       (count(*) FILTER (WHERE state = 'conflict'))::int AS "conflictCount",
       (count(*) FILTER (WHERE state = 'pending'))::int AS "pendingCount",
       (count(*) FILTER (WHERE state = 'succeeded'))::int AS "succeededCount",
       (count(*) FILTER (WHERE state = 'failed'))::int AS "failedCount"
     FROM attendance_biometric_device_states
     WHERE ($1::uuid IS NULL OR device_id = $1)`,
    [deviceId ?? null],
  );
  const replica = replicaResult.rows[0] ?? zeroReplicaSummary();

  let device: DevicePolicyRow | null = null;
  if (deviceId) {
    const deviceResult = await pool.query<DevicePolicyRow>(
      `SELECT
         id,
         serial_number AS "serialNumber",
         display_name AS "displayName",
         model,
         firmware_version AS "firmwareVersion",
         lifecycle,
         biometric_collection_enabled AS "deviceCollectionEnabled"
       FROM attendance_adms_devices
       WHERE id = $1`,
      [deviceId],
    );
    device = deviceResult.rows[0] ?? null;
  }

  let rotationRequiredCount: number | null = null;
  if (keyring.ready) {
    const currentKeyId = activeBiometricKeyId(config);
    const rotationResult = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_biometric_credentials
       WHERE lifecycle <> 'destroyed'
         AND encryption_key_id IS DISTINCT FROM $1`,
      [currentKeyId],
    );
    rotationRequiredCount = rotationResult.rows[0]?.count ?? 0;
  }

  return {
    rawPayloadExposed: false as const,
    collection: {
      globalEnabled: globalCollectionEnabled,
      deviceEnabled: device?.deviceCollectionEnabled ?? null,
      effectiveEnabled: Boolean(
        globalCollectionEnabled && device?.deviceCollectionEnabled && device?.lifecycle === "active",
      ),
    },
    keyring,
    vault: {
      ...vault,
      rotationRequiredCount,
    },
    replica: {
      inventorySemantics: "known_replica_state" as const,
      absenceMeansMissing: false as const,
      ...replica,
    },
    device: device
      ? {
          id: device.id,
          serialNumber: device.serialNumber,
          displayName: device.displayName,
          model: device.model,
          firmwareVersion: device.firmwareVersion,
          lifecycle: device.lifecycle,
        }
      : null,
    capabilities: buildCapabilities({
      keyringReady: keyring.ready,
      globalCollectionEnabled,
      device,
    }),
    retention: {
      automaticDestructionEnabled: false as const,
      inactiveEmployeeAction: "review_only" as const,
      masterDestroyEnabled: false as const,
      note: "Credential pegawai inactive/resigned hanya ditandai untuk review sampai kebijakan retensi dan destruction disetujui.",
    },
  };
}

export async function listBiometricControlPlaneCredentials(
  pool: Pool,
  input: {
    page: number;
    pageSize: number;
    employeeId?: string;
    originDeviceId?: string;
    modality?: BiometricModality;
    lifecycleReviewOnly?: boolean;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const filterParams = [
    input.employeeId ?? null,
    input.originDeviceId ?? null,
    input.modality ?? null,
    input.lifecycleReviewOnly ?? false,
  ];

  const [itemsResult, countResult] = await Promise.all([
    pool.query<BiometricCredentialListItem>(
      `SELECT
         c.id,
         c.employee_id AS "employeeId",
         emp.employee_number AS "employeeNumber",
         emp.full_name AS "employeeName",
         emp.status AS "employeeStatus",
         c.modality,
         c.slot_index AS "slotIndex",
         c.vendor_format AS "vendorFormat",
         c.vendor_version AS "vendorVersion",
         c.origin_device_id AS "originDeviceId",
         d.serial_number AS "originDeviceSerial",
         c.captured_at AS "capturedAt",
         c.imported_at AS "importedAt",
         c.lifecycle,
         c.payload_byte_length AS "payloadByteLength",
         c.envelope_version AS "envelopeVersion",
         c.last_reencrypted_at AS "lastReencryptedAt",
         (c.lifecycle <> 'destroyed' AND emp.status <> 'active') AS "lifecycleReviewRequired"
       FROM attendance_biometric_credentials c
       JOIN employees emp ON emp.id = c.employee_id
       LEFT JOIN attendance_adms_devices d ON d.id = c.origin_device_id
       WHERE ($1::uuid IS NULL OR c.employee_id = $1)
         AND ($2::uuid IS NULL OR c.origin_device_id = $2)
         AND ($3::text IS NULL OR c.modality = $3)
         AND (NOT $4::boolean OR (c.lifecycle <> 'destroyed' AND emp.status <> 'active'))
       ORDER BY
         (c.lifecycle <> 'destroyed' AND emp.status <> 'active') DESC,
         emp.full_name,
         c.modality,
         c.slot_index NULLS LAST,
         c.created_at DESC
       LIMIT $5 OFFSET $6`,
      [...filterParams, input.pageSize, offset],
    ),
    pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_biometric_credentials c
       JOIN employees emp ON emp.id = c.employee_id
       WHERE ($1::uuid IS NULL OR c.employee_id = $1)
         AND ($2::uuid IS NULL OR c.origin_device_id = $2)
         AND ($3::text IS NULL OR c.modality = $3)
         AND (NOT $4::boolean OR (c.lifecycle <> 'destroyed' AND emp.status <> 'active'))`,
      filterParams,
    ),
  ]);

  const total = countResult.rows[0]?.count ?? 0;
  return {
    rawPayloadExposed: false as const,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    items: itemsResult.rows,
  };
}

function payloadContext(row: ReencryptRow): BiometricPayloadContext {
  return {
    credentialId: row.id,
    employeeId: row.employeeId,
    modality: row.modality,
    slotIndex: row.slotIndex,
    vendorFormat: row.vendorFormat,
  };
}

function encryptedPayload(row: ReencryptRow): EncryptedBiometricPayload {
  return {
    ciphertext: row.payloadCiphertext,
    iv: row.payloadIv,
    authTag: row.payloadAuthTag,
    keyId: row.encryptionKeyId,
    sha256: row.payloadSha256,
    byteLength: row.payloadByteLength,
  };
}

async function selectCredentialsForReencryption(
  client: PoolClient,
  currentKeyId: string,
  limit: number,
  credentialIds?: string[],
) {
  const selectedIds = credentialIds?.length ? credentialIds : null;
  const result = await client.query<ReencryptRow>(
    `SELECT
       id,
       employee_id AS "employeeId",
       modality,
       slot_index AS "slotIndex",
       vendor_format AS "vendorFormat",
       envelope_version AS "envelopeVersion",
       encryption_key_id AS "encryptionKeyId",
       payload_ciphertext AS "payloadCiphertext",
       payload_iv AS "payloadIv",
       payload_auth_tag AS "payloadAuthTag",
       payload_sha256 AS "payloadSha256",
       payload_byte_length AS "payloadByteLength"
     FROM attendance_biometric_credentials
     WHERE lifecycle <> 'destroyed'
       AND encryption_key_id IS DISTINCT FROM $1
       AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))
     ORDER BY updated_at, id
     FOR UPDATE SKIP LOCKED
     LIMIT $2`,
    [currentKeyId, limit, selectedIds],
  );
  return result.rows;
}

export async function reencryptBiometricCredentialBatch(
  pool: Pool,
  config: ApiConfig,
  input: { actorAccountId: string; limit: number; credentialIds?: string[] },
) {
  const readiness = biometricKeyringReadiness(config);
  if (!readiness.ready) {
    throw new Error("Biometric keyring is not configured for vault maintenance");
  }
  const currentKeyId = activeBiometricKeyId(config);
  const selectedIds = input.credentialIds?.length ? input.credentialIds : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await selectCredentialsForReencryption(
      client,
      currentKeyId,
      input.limit,
      input.credentialIds,
    );
    for (const row of rows) {
      if (row.envelopeVersion !== ENVELOPE_VERSION) {
        throw new Error("Unsupported biometric envelope version");
      }
      const reencrypted = reencryptBiometricPayload(
        encryptedPayload(row),
        payloadContext(row),
        config,
      );
      await client.query(
        `UPDATE attendance_biometric_credentials
         SET encryption_key_id = $2,
             payload_ciphertext = $3,
             payload_iv = $4,
             payload_auth_tag = $5,
             payload_sha256 = $6,
             payload_byte_length = $7,
             last_reencrypted_at = now(),
             last_reencrypted_by_account_id = $8,
             updated_at = now()
         WHERE id = $1`,
        [
          row.id,
          reencrypted.keyId,
          reencrypted.ciphertext,
          reencrypted.iv,
          reencrypted.authTag,
          reencrypted.sha256,
          reencrypted.byteLength,
          input.actorAccountId,
        ],
      );
      await client.query(
        `INSERT INTO attendance_biometric_audit_events (
           id, actor_account_id, action, credential_id, employee_id, device_id, safe_metadata
         ) VALUES ($1, $2, 'credential_reencrypted', $3, $4, NULL, $5::jsonb)`,
        [
          randomUUID(),
          input.actorAccountId,
          row.id,
          row.employeeId,
          JSON.stringify({
            envelopeVersion: ENVELOPE_VERSION,
            modality: row.modality,
            slotIndex: row.slotIndex,
            vendorFormat: row.vendorFormat,
          }),
        ],
      );
    }

    const remainingResult = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM attendance_biometric_credentials
       WHERE lifecycle <> 'destroyed'
         AND encryption_key_id IS DISTINCT FROM $1
         AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))`,
      [currentKeyId, selectedIds],
    );
    await client.query("COMMIT");
    return {
      rawPayloadExposed: false as const,
      processedCount: rows.length,
      remainingCount: remainingResult.rows[0]?.count ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
