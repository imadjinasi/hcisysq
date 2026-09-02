import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { ApiConfig } from "../../../config/env.js";
import {
  biometricCollectionEnabled,
  biometricKeyringReadiness,
  encryptRestrictedDevicePayload,
  type BiometricModality,
} from "./biometric-crypto.js";
import { importBiometricCredentialInTransaction } from "./biometric-vault.js";

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type UnifiedBiometricCandidate = {
  pin: string;
  modality: Exclude<BiometricModality, "bio_photo">;
  slotIndex: number;
  vendorFormat: "zkteco-push-biodata-base64";
  vendorVersion: string;
  payload: Buffer;
  safeMetadata: {
    encoding: "base64";
    valid: true;
    duress: boolean;
    protocolTable: "BIODATA";
    source: "device_query_or_enrollment";
    biometricType: number;
    index: number;
    majorVersion: number;
    minorVersion: number;
    format: number;
  };
};

function parseFields(line: string) {
  const values = new Map<string, string>();
  let normalized = line.trim();
  normalized = normalized.replace(/^biodata\s+/i, "");
  for (const segment of normalized.split("\t")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const key = segment.slice(0, separator).trim().toUpperCase().replaceAll("_", "");
    const value = segment.slice(separator + 1);
    if (key && !values.has(key)) values.set(key, value);
  }
  return values;
}

function integer(value: string | undefined, min: number, max: number) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function modalityForType(type: number): Exclude<BiometricModality, "bio_photo"> | null {
  if (type === 1) return "fingerprint";
  if (type === 2 || type === 9) return "face";
  if (type === 6 || type === 8 || type === 10) return "palm";
  return null;
}

export function parseUnifiedBiometricCandidates(text: string) {
  const records: UnifiedBiometricCandidate[] = [];
  let rejectedRecords = 0;
  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    if (!rawLine.trim()) continue;
    const fields = parseFields(rawLine);
    const pin = fields.get("PIN")?.trim() ?? "";
    const type = integer(fields.get("TYPE"), 0, 10);
    const no = integer(fields.get("NO") ?? fields.get("FID"), 0, 255);
    const index = integer(fields.get("INDEX"), 0, 255) ?? 0;
    const valid = integer(fields.get("VALID"), 0, 3) ?? 1;
    const duress = integer(fields.get("DURESS"), 0, 1) ?? 0;
    const majorVersion = integer(fields.get("MAJORVER"), 0, 65535) ?? 0;
    const minorVersion = integer(fields.get("MINORVER"), 0, 65535) ?? 0;
    const format = integer(fields.get("FORMAT"), 0, 65535) ?? 0;
    const payload = fields.get("TMP") ?? "";
    const modality = type === null ? null : modalityForType(type);
    if (
      !/^\d{1,128}$/.test(pin) || type === null || !modality || no === null || valid !== 1 ||
      payload.length === 0 || payload.length > 5 * 1024 * 1024 || payload.length % 4 !== 0 ||
      !BASE64_PATTERN.test(payload)
    ) {
      rejectedRecords += 1;
      continue;
    }
    records.push({
      pin,
      modality,
      slotIndex: no,
      vendorFormat: "zkteco-push-biodata-base64",
      vendorVersion: `${majorVersion}.${minorVersion}`,
      payload: Buffer.from(payload, "utf8"),
      safeMetadata: {
        encoding: "base64",
        valid: true,
        duress: duress === 1,
        protocolTable: "BIODATA",
        source: "device_query_or_enrollment",
        biometricType: type,
        index,
        majorVersion,
        minorVersion,
        format,
      },
    });
  }
  return { records, rejectedRecords };
}

export async function importMappedUnifiedBiometrics(
  pool: Pool,
  config: ApiConfig,
  input: {
    deviceId: string;
    sourceRequestId: string;
    observedAt: Date;
    records: UnifiedBiometricCandidate[];
  },
) {
  if (!biometricCollectionEnabled(config)) {
    return { imported: 0, deduplicated: 0, skippedCollectionDisabled: input.records.length };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const device = await client.query<{ lifecycle: string; collectionEnabled: boolean }>(
      `SELECT lifecycle, biometric_collection_enabled AS "collectionEnabled"
       FROM attendance_adms_devices WHERE id = $1 FOR UPDATE`,
      [input.deviceId],
    );
    if (!device.rows[0] || device.rows[0].lifecycle !== "active" || !device.rows[0].collectionEnabled) {
      await client.query("COMMIT");
      return { imported: 0, deduplicated: 0, skippedCollectionDisabled: input.records.length };
    }

    let imported = 0;
    let deduplicated = 0;
    for (const record of input.records) {
      const mapping = await client.query<{ employeeId: string; status: string }>(
        `SELECT m.employee_id AS "employeeId", e.status
         FROM attendance_adms_employee_mappings m
         JOIN employees e ON e.id = m.employee_id
         WHERE m.device_id = $1 AND m.pin = $2
           AND m.effective_from <= $3
           AND (m.effective_to IS NULL OR m.effective_to > $3)
         ORDER BY m.effective_from DESC LIMIT 2`,
        [input.deviceId, record.pin, input.observedAt],
      );
      if (mapping.rows.length !== 1 || mapping.rows[0]!.status !== "active") continue;
      const result = await importBiometricCredentialInTransaction(client, config, {
        employeeId: mapping.rows[0]!.employeeId,
        modality: record.modality,
        slotIndex: record.slotIndex,
        vendorFormat: record.vendorFormat,
        vendorVersion: record.vendorVersion,
        originDeviceId: input.deviceId,
        sourceRequestId: input.sourceRequestId,
        sourcePin: record.pin,
        payload: record.payload,
        safeMetadata: record.safeMetadata,
      });
      await client.query(
        `INSERT INTO attendance_biometric_device_states (
           credential_id, device_id, state, observed_at, last_error_code, safe_metadata, updated_at
         ) VALUES ($1, $2, 'present', $3, NULL, $4::jsonb, $3)
         ON CONFLICT (credential_id, device_id) DO UPDATE
         SET state = 'present', observed_at = EXCLUDED.observed_at, last_error_code = NULL,
             safe_metadata = EXCLUDED.safe_metadata, updated_at = EXCLUDED.updated_at`,
        [result.credentialId, input.deviceId, input.observedAt, JSON.stringify({ source: "unified_biodata_upload" })],
      );
      if (result.created) imported += 1;
      else deduplicated += 1;
    }
    await client.query("COMMIT");
    return { imported, deduplicated, skippedCollectionDisabled: 0 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type ParsedAttendancePhoto = {
  photoId: string;
  pin: string | null;
  occurredAtRaw: string | null;
  payload: Buffer;
  command: string;
};

export function parseAttendancePhotoBody(body: Buffer): ParsedAttendancePhoto | null {
  if (body.length < 16 || body.length > 5 * 1024 * 1024 + 4096) return null;
  const separator = body.indexOf(0);
  if (separator <= 0 || separator > 4096) return null;
  const header = body.subarray(0, separator).toString("utf8").replace(/\r/g, "\n");
  const fields = new Map<string, string>();
  for (const segment of header.split(/[\n\t ]+/).filter(Boolean)) {
    const equals = segment.indexOf("=");
    if (equals <= 0) continue;
    fields.set(segment.slice(0, equals).toUpperCase(), segment.slice(equals + 1));
  }
  const photoId = fields.get("PIN") ?? "";
  const declaredSize = integer(fields.get("SIZE"), 1, 5 * 1024 * 1024);
  const command = fields.get("CMD") ?? "";
  const payload = body.subarray(separator + 1);
  if (!photoId || photoId.length > 255 || declaredSize === null || payload.length !== declaredSize) return null;
  if (!/^uploadphoto|realupload$/i.test(command)) return null;
  if (payload.length < 3 || payload[0] !== 0xff || payload[1] !== 0xd8 || payload[2] !== 0xff) return null;

  const date = /^(\d{14})/.exec(photoId)?.[1] ?? null;
  const pinMatch = /^\d{14}(?:-\d+)?-(\d{1,128})(?:-|\.)/.exec(photoId);
  return {
    photoId,
    pin: pinMatch?.[1] ?? null,
    occurredAtRaw: date,
    payload,
    command: command.toLowerCase(),
  };
}

function parsePhotoTimestamp(raw: string | null) {
  if (!raw || !/^\d{14}$/.test(raw)) return null;
  const value = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+07:00`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function persistEncryptedAttendancePhoto(
  pool: Pool,
  config: ApiConfig,
  input: {
    deviceId: string;
    sourceRequestId: string;
    receivedAt: Date;
    photo: ParsedAttendancePhoto;
  },
) {
  if (!biometricKeyringReadiness(config).ready) return { stored: false, reason: "keyring_not_ready" as const };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const capability = await client.query<{ state: string }>(
      `SELECT state FROM attendance_adms_physical_capabilities
       WHERE device_id = $1 AND capability_key = 'attendance_photo'
       FOR UPDATE`,
      [input.deviceId],
    );
    if (!capability.rows[0] || !["canary_pending", "verified"].includes(capability.rows[0].state)) {
      await client.query("COMMIT");
      return { stored: false, reason: "capability_not_enabled" as const };
    }

    const id = randomUUID();
    const encrypted = encryptRestrictedDevicePayload(input.photo.payload, {
      recordId: id,
      deviceId: input.deviceId,
      domain: "attendance_photo",
      sourceRequestId: input.sourceRequestId,
    }, config);
    await client.query(
      `INSERT INTO attendance_adms_attendance_photos (
         id, device_id, source_request_id, pin, occurred_at_raw, occurred_at,
         payload_sha256, payload_byte_length, encryption_key_id,
         payload_ciphertext, payload_iv, payload_auth_tag, safe_metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       ON CONFLICT (source_request_id) DO NOTHING`,
      [
        id, input.deviceId, input.sourceRequestId, input.photo.pin, input.photo.occurredAtRaw,
        parsePhotoTimestamp(input.photo.occurredAtRaw), encrypted.sha256, encrypted.byteLength,
        encrypted.keyId, encrypted.ciphertext, encrypted.iv, encrypted.authTag,
        JSON.stringify({ photoId: input.photo.photoId.slice(0, 255), command: input.photo.command }),
      ],
    );

    if (capability.rows[0].state === "canary_pending") {
      const operation = await client.query<{ id: string; requestedByAccountId: string }>(
        `SELECT id, requested_by_account_id AS "requestedByAccountId"
         FROM attendance_adms_physical_operations
         WHERE device_id = $1 AND capability_key = 'attendance_photo'
           AND mode = 'canary' AND status = 'running'
         ORDER BY created_at LIMIT 1 FOR UPDATE`,
        [input.deviceId],
      );
      if (operation.rows[0]) {
        await client.query(
          `UPDATE attendance_adms_physical_operations
           SET status = 'succeeded', completed_at = $2, updated_at = $2 WHERE id = $1`,
          [operation.rows[0].id, input.receivedAt],
        );
        await client.query(
          `UPDATE attendance_adms_physical_capabilities
           SET state = 'verified', last_result_code = 0, verified_at = $3,
               verified_by_account_id = $2,
               safe_metadata = safe_metadata || $4::jsonb, updated_at = $3
           WHERE device_id = $1 AND capability_key = 'attendance_photo'`,
          [input.deviceId, operation.rows[0].requestedByAccountId, input.receivedAt, JSON.stringify({ encryptedStorageVerified: true })],
        );
      }
    }
    await client.query("COMMIT");
    return { stored: true as const, id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
