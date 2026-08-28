import { createHash } from "node:crypto";

import type { Pool } from "pg";

import type { ApiConfig } from "../../../config/env.js";
import { biometricCollectionEnabled, type BiometricModality } from "./biometric-crypto.js";
import { importBiometricCredential } from "./biometric-vault.js";

const MAX_ENCODED_TEMPLATE_BYTES = 512 * 1024;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type PassiveBiometricCandidate = {
  pin: string;
  modality: Extract<BiometricModality, "fingerprint" | "face">;
  slotIndex: number;
  vendorFormat: string;
  payload: Buffer;
  safeMetadata: {
    encoding: "base64";
    valid: true;
    duress: boolean;
    protocolTable: "OPERLOG";
    source: "device_passive_upload";
  };
};

export type PassiveBiometricParseResult = {
  records: PassiveBiometricCandidate[];
  rejectedRecords: number;
};

function containsControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function parseFields(rawLine: string) {
  const firstSpace = rawLine.indexOf(" ");
  if (firstSpace <= 0) return null;
  const kind = rawLine.slice(0, firstSpace).trim().toUpperCase();
  const fields = new Map<string, string>();
  for (const segment of rawLine.slice(firstSpace + 1).split("\t")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const key = segment.slice(0, separator).trim().toUpperCase();
    const value = segment.slice(separator + 1);
    if (!key || fields.has(key)) continue;
    fields.set(key, value);
  }
  return { kind, fields };
}

function parseInteger(value: string | undefined, min: number, max: number) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function strictBase64(value: string) {
  if (
    value.length === 0 ||
    value.length > MAX_ENCODED_TEMPLATE_BYTES ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value)
  ) {
    return false;
  }
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length > 0 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}

/**
 * Parses the documented PUSH 2.x passive FP/FACE upload records from OPERLOG only.
 * The base64 text remains opaque vendor data: HCIS validates framing and encrypts the exact
 * encoded bytes, but does not decode or interpret biometric features.
 */
export function parsePassiveBiometricCandidates(
  text: string,
  protocolTable: string | null,
): PassiveBiometricParseResult {
  if (protocolTable !== "OPERLOG") return { records: [], rejectedRecords: 0 };

  const records: PassiveBiometricCandidate[] = [];
  let rejectedRecords = 0;
  for (const rawLine of text.split(/\r\n|\n|\r/)) {
    if (!rawLine) continue;
    const parsed = parseFields(rawLine);
    if (!parsed || (parsed.kind !== "FP" && parsed.kind !== "FACE")) continue;

    const pin = parsed.fields.get("PIN")?.trim() ?? "";
    const slotIndex = parseInteger(parsed.fields.get("FID"), 0, parsed.kind === "FP" ? 9 : 255);
    const declaredSize = parseInteger(parsed.fields.get("SIZE"), 1, MAX_ENCODED_TEMPLATE_BYTES);
    const valid = parseInteger(parsed.fields.get("VALID"), 0, 3);
    const payload = parsed.fields.get("TMP") ?? "";
    const allowedValidity = parsed.kind === "FP" ? valid === 1 || valid === 3 : valid === 1;

    if (
      !pin ||
      pin.length > 128 ||
      containsControlCharacter(pin) ||
      slotIndex === null ||
      declaredSize === null ||
      declaredSize !== payload.length ||
      !allowedValidity ||
      !strictBase64(payload)
    ) {
      rejectedRecords += 1;
      continue;
    }

    const modality = parsed.kind === "FP" ? "fingerprint" : "face";
    records.push({
      pin,
      modality,
      slotIndex,
      vendorFormat: parsed.kind === "FP"
        ? "zkteco-push-fingertmp-base64"
        : "zkteco-push-face-base64",
      payload: Buffer.from(payload, "utf8"),
      safeMetadata: {
        encoding: "base64",
        valid: true,
        duress: parsed.kind === "FP" && valid === 3,
        protocolTable: "OPERLOG",
        source: "device_passive_upload",
      },
    });
  }
  return { records, rejectedRecords };
}

export async function importMappedPassiveBiometrics(
  pool: Pool,
  config: ApiConfig,
  input: {
    deviceId: string;
    sourceRequestId: string;
    observedAt: Date;
    records: PassiveBiometricCandidate[];
  },
) {
  if (!biometricCollectionEnabled(config)) {
    return {
      imported: 0,
      deduplicated: 0,
      skippedCollectionDisabled: input.records.length,
      skippedUnmapped: 0,
      skippedInactiveEmployee: 0,
      skippedMappingConflict: 0,
    };
  }

  let imported = 0;
  let deduplicated = 0;
  let skippedUnmapped = 0;
  let skippedInactiveEmployee = 0;
  let skippedMappingConflict = 0;

  for (const record of input.records) {
    const mapping = await pool.query<{
      employeeId: string;
      employeeStatus: string;
    }>(
      `SELECT
         m.employee_id AS "employeeId",
         e.status AS "employeeStatus"
       FROM attendance_adms_employee_mappings m
       JOIN employees e ON e.id = m.employee_id
       WHERE m.device_id = $1
         AND m.pin = $2
         AND m.effective_from <= $3
         AND (m.effective_to IS NULL OR m.effective_to > $3)
       ORDER BY m.effective_from DESC
       LIMIT 2`,
      [input.deviceId, record.pin, input.observedAt],
    );

    if (mapping.rows.length === 0) {
      skippedUnmapped += 1;
      continue;
    }
    if (mapping.rows.length !== 1) {
      skippedMappingConflict += 1;
      continue;
    }
    if (mapping.rows[0]!.employeeStatus !== "active") {
      skippedInactiveEmployee += 1;
      continue;
    }

    const payloadSha256 = createHash("sha256").update(record.payload).digest("hex");
    const result = await importBiometricCredential(pool, config, {
      employeeId: mapping.rows[0]!.employeeId,
      modality: record.modality,
      slotIndex: record.slotIndex,
      vendorFormat: record.vendorFormat,
      originDeviceId: input.deviceId,
      sourceRequestId: input.sourceRequestId,
      sourcePin: record.pin,
      capturedAt: null,
      payload: record.payload,
      safeMetadata: record.safeMetadata,
    });

    await pool.query(
      `INSERT INTO attendance_biometric_device_states (
         credential_id, device_id, state, device_payload_sha256,
         device_vendor_format, observed_at, last_error_code, safe_metadata, updated_at
       ) VALUES ($1, $2, 'present', $3, $4, $5, NULL, $6::jsonb, $5)
       ON CONFLICT (credential_id, device_id) DO UPDATE
       SET state = 'present',
           device_payload_sha256 = EXCLUDED.device_payload_sha256,
           device_vendor_format = EXCLUDED.device_vendor_format,
           observed_at = GREATEST(
             COALESCE(attendance_biometric_device_states.observed_at, EXCLUDED.observed_at),
             EXCLUDED.observed_at
           ),
           last_error_code = NULL,
           safe_metadata = EXCLUDED.safe_metadata,
           updated_at = EXCLUDED.updated_at`,
      [
        result.credentialId,
        input.deviceId,
        payloadSha256,
        record.vendorFormat,
        input.observedAt,
        JSON.stringify({ source: "device_passive_upload", sourceRequestId: input.sourceRequestId }),
      ],
    );

    if (result.created) imported += 1;
    else deduplicated += 1;
  }

  return {
    imported,
    deduplicated,
    skippedCollectionDisabled: 0,
    skippedUnmapped,
    skippedInactiveEmployee,
    skippedMappingConflict,
  };
}
