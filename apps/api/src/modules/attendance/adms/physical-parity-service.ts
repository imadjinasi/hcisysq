import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { ApiConfig } from "../../../config/env.js";
import {
  biometricKeyringReadiness,
  decryptBiometricPayload,
  type BiometricModality,
  type BiometricPayloadContext,
} from "./biometric-crypto.js";
import {
  activeTimeSyncWireCommand,
  fingerprintRestoreWireCommand,
  firmwareUpgradeWireCommand,
  type PhysicalCapabilityKey,
} from "./physical-parity-protocol.js";

type PhysicalCommandSpec = {
  commandType:
    | "physical_work_code"
    | "physical_message"
    | "device_option"
    | "reboot"
    | "biometric_query"
    | "biometric_restore"
    | "biometric_enroll"
    | "biometric_delete"
    | "device_clear"
    | "firmware_upgrade";
  wireCommand: string;
  biometricCredentialId?: string | null;
  firmwareTicketId?: string | null;
};

export type QueuePhysicalOperationInput = {
  deviceId: string;
  capabilityKey: PhysicalCapabilityKey;
  operationKey: string;
  mode: "canary" | "execute";
  destructive?: boolean;
  requestedByAccountId: string;
  commands: PhysicalCommandSpec[];
  safeMetadata?: Record<string, string | number | boolean | null>;
  expiresInHours?: number;
};

function safeOperationKey(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error("Physical operation key is invalid");
  }
  return normalized;
}

export async function queuePhysicalOperation(
  client: PoolClient,
  input: QueuePhysicalOperationInput,
) {
  if (input.commands.length === 0 || input.commands.length > 8) {
    throw new Error("Physical operation must contain 1-8 typed commands");
  }
  const device = await client.query<{ lifecycle: string }>(
    `SELECT lifecycle FROM attendance_adms_devices WHERE id = $1 FOR UPDATE`,
    [input.deviceId],
  );
  if (!device.rows[0]) throw new Error("ADMS device not found");
  if (device.rows[0].lifecycle !== "active") throw new Error("ADMS device is not active");

  const active = await client.query<{ id: string }>(
    `SELECT id FROM attendance_adms_commands
     WHERE device_id = $1 AND status IN ('pending', 'delivered', 'acknowledged')
     LIMIT 1`,
    [input.deviceId],
  );
  if (active.rows[0]) throw new Error("ADMS device already has an active command");

  const operationId = randomUUID();
  const expiresInHours = input.expiresInHours ?? 6;
  if (!Number.isFinite(expiresInHours) || expiresInHours < 1 || expiresInHours > 72) {
    throw new Error("Physical operation expiry is invalid");
  }

  await client.query(
    `INSERT INTO attendance_adms_physical_operations (
       id, device_id, capability_key, operation_key, mode, status, destructive,
       requested_by_account_id, safe_metadata
     ) VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8::jsonb)`,
    [
      operationId,
      input.deviceId,
      input.capabilityKey,
      safeOperationKey(input.operationKey),
      input.mode,
      input.destructive ?? false,
      input.requestedByAccountId,
      JSON.stringify(input.safeMetadata ?? {}),
    ],
  );

  if (input.mode === "canary") {
    await client.query(
      `INSERT INTO attendance_adms_physical_capabilities (
         device_id, capability_key, state, last_operation_id, safe_metadata, updated_at
       ) VALUES ($1, $2, 'canary_pending', $3, $4::jsonb, now())
       ON CONFLICT (device_id, capability_key) DO UPDATE
       SET state = 'canary_pending',
           last_operation_id = EXCLUDED.last_operation_id,
           safe_metadata = attendance_adms_physical_capabilities.safe_metadata || EXCLUDED.safe_metadata,
           updated_at = now()`,
      [input.deviceId, input.capabilityKey, operationId, JSON.stringify({ lastCanaryOperationKey: input.operationKey })],
    );
  }

  const commandIds: string[] = [];
  for (let index = 0; index < input.commands.length; index += 1) {
    const command = input.commands[index]!;
    const commandId = randomUUID();
    commandIds.push(commandId);
    const status = index === 0 ? "pending" : "queued";
    await client.query(
      `INSERT INTO attendance_adms_commands (
         id, device_id, command_type, wire_command, reason, status, expires_at,
         physical_operation_id, physical_sequence, physical_capability_key,
         biometric_credential_id, firmware_ticket_id
       ) VALUES (
         $1, $2, $3, $4, 'admin_physical_operation', $5,
         now() + ($6::text || ' hours')::interval,
         $7, $8, $9, $10, $11
       )`,
      [
        commandId,
        input.deviceId,
        command.commandType,
        command.wireCommand,
        status,
        String(expiresInHours),
        operationId,
        index + 1,
        input.capabilityKey,
        command.biometricCredentialId ?? null,
        command.firmwareTicketId ?? null,
      ],
    );
    await client.query(
      `INSERT INTO attendance_adms_command_events (
         id, command_id, event_type, actor_account_id, metadata
       ) VALUES ($1, $2, 'queued', $3, $4::jsonb)`,
      [
        randomUUID(),
        commandId,
        input.requestedByAccountId,
        JSON.stringify({
          physicalOperationId: operationId,
          physicalCapabilityKey: input.capabilityKey,
          sequence: index + 1,
          initialStatus: status,
        }),
      ],
    );
  }

  return { operationId, commandIds };
}

export async function createTimeSyncCanary(
  client: PoolClient,
  input: { deviceId: string; requestedByAccountId: string },
) {
  return queuePhysicalOperation(client, {
    deviceId: input.deviceId,
    capabilityKey: "time_sync",
    operationKey: "set_options_datetime",
    mode: "canary",
    requestedByAccountId: input.requestedByAccountId,
    commands: [{ commandType: "device_option", wireCommand: "TIME_SYNC" }],
    safeMetadata: { materializedAtDelivery: true, timezoneSource: "device_registry" },
  });
}

export async function completeTimeSyncCanaryIfPending(
  client: PoolClient,
  deviceId: string,
  receivedAt: Date,
) {
  const operation = await client.query<{ id: string; requestedByAccountId: string }>(
    `SELECT id, requested_by_account_id AS "requestedByAccountId"
     FROM attendance_adms_physical_operations
     WHERE device_id = $1
       AND capability_key = 'time_sync'
       AND mode = 'canary'
       AND status = 'running'
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT 1`,
    [deviceId],
  );
  const row = operation.rows[0];
  if (!row) return false;

  const command = await client.query<{ id: string; status: string }>(
    `SELECT id, status FROM attendance_adms_commands
     WHERE physical_operation_id = $1
     ORDER BY physical_sequence
     LIMIT 1
     FOR UPDATE`,
    [row.id],
  );
  if (command.rows[0] && !["succeeded", "failed", "expired", "cancelled"].includes(command.rows[0].status)) {
    await client.query(
      `UPDATE attendance_adms_commands
       SET status = 'succeeded', acknowledged_at = COALESCE(acknowledged_at, $2),
           completed_at = $2, return_code = 0, result_command = 'TIME_SYNC_EVIDENCE',
           result_raw = NULL, updated_at = $2
       WHERE id = $1`,
      [command.rows[0].id, receivedAt],
    );
    return true;
  }
  return false;
}

type MaterializedCommandRow = {
  wireCommand: string;
  deviceTimezone: string;
  deviceModel: string | null;
  biometricCredentialId: string | null;
  firmwareTicketId: string | null;
  targetPin: string | null;
  employeeId: string | null;
  modality: BiometricModality | null;
  slotIndex: number | null;
  vendorFormat: string | null;
  vendorVersion: string | null;
  payloadSha256: string | null;
  payloadByteLength: number | null;
  encryptionKeyId: string | null;
  payloadCiphertext: Buffer | null;
  payloadIv: Buffer | null;
  payloadAuthTag: Buffer | null;
  lifecycle: string | null;
  safeMetadata: Record<string, unknown> | null;
  firmwareTargetModel: string | null;
  firmwareMd5: string | null;
  firmwareByteLength: number | null;
};

function unifiedType(modality: BiometricModality, safeMetadata: Record<string, unknown> | null) {
  const raw = safeMetadata?.biometricType;
  if (typeof raw === "number" && [1, 2, 6, 8, 9, 10].includes(raw)) return raw;
  if (modality === "fingerprint") return 1;
  if (modality === "face") return 9;
  if (modality === "palm") return 8;
  throw new Error("Biometric modality cannot be restored to device");
}

function unifiedRestoreWireCommand(input: {
  pin: string;
  no: number;
  index: number;
  type: number;
  majorVersion: number;
  minorVersion: number;
  format: number;
  encodedTemplate: string;
}) {
  if (!/^\d{1,128}$/.test(input.pin)) throw new Error("Biometric target PIN is invalid");
  for (const value of [input.no, input.index, input.type, input.majorVersion, input.minorVersion, input.format]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 65535) throw new Error("Unified biometric metadata is invalid");
  }
  if (!input.encodedTemplate || input.encodedTemplate.length > 5 * 1024 * 1024 || /[\t\r\n]/.test(input.encodedTemplate)) {
    throw new Error("Unified biometric template is invalid");
  }
  return `DATA UPDATE BIODATA Pin=${input.pin}\tNo=${input.no}\tIndex=${input.index}\tValid=1\tDuress=0\tType=${input.type}\tMajorVer=${input.majorVersion}\tMinorVer=${input.minorVersion}\tFormat=${input.format}\tTmp=${input.encodedTemplate}`;
}

function legacyFaceRestoreWireCommand(input: { pin: string; slotIndex: number; encodedTemplate: string }) {
  if (!/^\d{1,128}$/.test(input.pin) || !Number.isInteger(input.slotIndex) || input.slotIndex < 0 || input.slotIndex > 255) {
    throw new Error("Face restore target is invalid");
  }
  if (!input.encodedTemplate || input.encodedTemplate.length > 5 * 1024 * 1024 || /[\t\r\n]/.test(input.encodedTemplate)) {
    throw new Error("Face template is invalid");
  }
  return `DATA UPDATE FACE PIN=${input.pin}\tFID=${input.slotIndex}\tSize=${input.encodedTemplate.length}\tValid=1\tTMP=${input.encodedTemplate}`;
}

export async function materializePhysicalWireCommand(
  client: PoolClient,
  config: ApiConfig,
  commandId: string,
) {
  const result = await client.query<MaterializedCommandRow>(
    `SELECT
       c.wire_command AS "wireCommand",
       d.timezone AS "deviceTimezone",
       d.model AS "deviceModel",
       c.biometric_credential_id AS "biometricCredentialId",
       c.firmware_ticket_id AS "firmwareTicketId",
       o.safe_metadata ->> 'targetPin' AS "targetPin",
       b.employee_id AS "employeeId",
       b.modality,
       b.slot_index AS "slotIndex",
       b.vendor_format AS "vendorFormat",
       b.vendor_version AS "vendorVersion",
       b.payload_sha256 AS "payloadSha256",
       b.payload_byte_length AS "payloadByteLength",
       b.encryption_key_id AS "encryptionKeyId",
       b.payload_ciphertext AS "payloadCiphertext",
       b.payload_iv AS "payloadIv",
       b.payload_auth_tag AS "payloadAuthTag",
       b.lifecycle,
       b.safe_metadata AS "safeMetadata",
       fp.target_model AS "firmwareTargetModel",
       fp.md5 AS "firmwareMd5",
       fp.byte_length AS "firmwareByteLength"
     FROM attendance_adms_commands c
     JOIN attendance_adms_devices d ON d.id = c.device_id
     LEFT JOIN attendance_adms_physical_operations o ON o.id = c.physical_operation_id
     LEFT JOIN attendance_biometric_credentials b ON b.id = c.biometric_credential_id
     LEFT JOIN attendance_adms_firmware_download_tickets ft ON ft.id = c.firmware_ticket_id
     LEFT JOIN attendance_adms_firmware_packages fp ON fp.id = ft.package_id
     WHERE c.id = $1
     FOR UPDATE OF c`,
    [commandId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("ADMS command not found");

  if (row.wireCommand === "TIME_SYNC") {
    return activeTimeSyncWireCommand(new Date(), row.deviceTimezone);
  }

  if (row.wireCommand === "FIRMWARE_UPGRADE") {
    if (
      !row.firmwareTicketId || !row.firmwareTargetModel || !row.firmwareMd5 ||
      row.firmwareByteLength === null || !row.deviceModel || row.deviceModel !== row.firmwareTargetModel
    ) {
      throw new Error("Firmware package no longer matches the target device");
    }
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    await client.query(
      `UPDATE attendance_adms_firmware_download_tickets
       SET token_sha256 = $2, expires_at = now() + interval '15 minutes'
       WHERE id = $1`,
      [row.firmwareTicketId, tokenHash],
    );
    return firmwareUpgradeWireCommand({
      checksumMd5: row.firmwareMd5,
      byteLength: row.firmwareByteLength,
      urlPath: `/iclock/file?token=${token}`,
    });
  }

  if (row.wireCommand !== "BIOMETRIC_RESTORE") return row.wireCommand;
  if (!biometricKeyringReadiness(config).ready) throw new Error("Biometric keyring is not ready");
  if (
    !row.biometricCredentialId || !row.targetPin || !row.employeeId || !row.modality ||
    row.slotIndex === null || !row.vendorFormat || !row.payloadSha256 || row.payloadByteLength === null ||
    !row.encryptionKeyId || !row.payloadCiphertext || !row.payloadIv || !row.payloadAuthTag || row.lifecycle !== "active"
  ) {
    throw new Error("Biometric restore credential is not eligible");
  }

  const mapping = await client.query<{ employeeId: string }>(
    `SELECT employee_id AS "employeeId"
     FROM attendance_adms_employee_mappings
     WHERE device_id = (SELECT device_id FROM attendance_adms_commands WHERE id = $1)
       AND pin = $2
       AND effective_from <= now()
       AND (effective_to IS NULL OR effective_to > now())
     ORDER BY effective_from DESC
     LIMIT 2`,
    [commandId, row.targetPin],
  );
  if (mapping.rows.length !== 1 || mapping.rows[0]!.employeeId !== row.employeeId) {
    throw new Error("Biometric restore mapping changed before delivery");
  }

  const context: BiometricPayloadContext = {
    credentialId: row.biometricCredentialId,
    employeeId: row.employeeId,
    modality: row.modality,
    slotIndex: row.slotIndex,
    vendorFormat: row.vendorFormat,
  };
  const plaintext = decryptBiometricPayload(
    {
      ciphertext: row.payloadCiphertext,
      iv: row.payloadIv,
      authTag: row.payloadAuthTag,
      keyId: row.encryptionKeyId,
      sha256: row.payloadSha256,
      byteLength: row.payloadByteLength,
    },
    context,
    config,
  );
  const encoded = plaintext.toString("utf8");

  if (row.vendorFormat === "zkteco-push-fingertmp-base64" && row.modality === "fingerprint") {
    return fingerprintRestoreWireCommand({ pin: row.targetPin, slotIndex: row.slotIndex, encodedTemplate: encoded });
  }
  if (row.vendorFormat === "zkteco-push-face-base64" && row.modality === "face") {
    return legacyFaceRestoreWireCommand({ pin: row.targetPin, slotIndex: row.slotIndex, encodedTemplate: encoded });
  }
  if (row.vendorFormat === "zkteco-push-biodata-base64") {
    const metadata = row.safeMetadata ?? {};
    const numeric = (key: string, fallback: number) => typeof metadata[key] === "number" ? Number(metadata[key]) : fallback;
    return unifiedRestoreWireCommand({
      pin: row.targetPin,
      no: row.slotIndex,
      index: numeric("index", 0),
      type: unifiedType(row.modality, metadata),
      majorVersion: numeric("majorVersion", 0),
      minorVersion: numeric("minorVersion", 0),
      format: numeric("format", 0),
      encodedTemplate: encoded,
    });
  }
  throw new Error("Biometric vendor format is not physically restorable");
}

export async function resolveFirmwareDownload(
  pool: Pool,
  token: string,
) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const result = await pool.query<{
    ticketId: string;
    deviceId: string;
    serialNumber: string;
    targetModel: string;
    deviceModel: string | null;
    filename: string;
    payload: Buffer;
    sha256: string;
  }>(
    `SELECT
       ft.id AS "ticketId", ft.device_id AS "deviceId", d.serial_number AS "serialNumber",
       fp.target_model AS "targetModel", d.model AS "deviceModel", fp.filename,
       fp.payload, fp.sha256
     FROM attendance_adms_firmware_download_tickets ft
     JOIN attendance_adms_firmware_packages fp ON fp.id = ft.package_id
     JOIN attendance_adms_devices d ON d.id = ft.device_id
     WHERE ft.token_sha256 = $1
       AND ft.expires_at > now()
       AND d.lifecycle = 'active'
     LIMIT 1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row || !row.deviceModel || row.deviceModel !== row.targetModel) return null;
  return row;
}

export async function listPhysicalCapabilities(pool: Pool, deviceId: string) {
  const result = await pool.query<{
    capabilityKey: PhysicalCapabilityKey;
    state: string;
    lastResultCode: number | null;
    verifiedAt: Date | null;
    safeMetadata: Record<string, unknown>;
    updatedAt: Date;
  }>(
    `SELECT capability_key AS "capabilityKey", state,
            last_result_code AS "lastResultCode", verified_at AS "verifiedAt",
            safe_metadata AS "safeMetadata", updated_at AS "updatedAt"
     FROM attendance_adms_physical_capabilities
     WHERE device_id = $1
     ORDER BY capability_key`,
    [deviceId],
  );
  return result.rows;
}
