import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { ApiConfig } from "../../../config/env.js";

const MAX_BIOMETRIC_PAYLOAD_BYTES = 5 * 1024 * 1024;
const KEY_PATTERN = /^[a-fA-F0-9]{64}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

export type BiometricModality = "fingerprint" | "face" | "palm" | "bio_photo";

export type BiometricPayloadContext = {
  credentialId: string;
  employeeId: string;
  modality: BiometricModality;
  slotIndex: number | null;
  vendorFormat: string;
};

export type EncryptedBiometricPayload = {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyId: string;
  sha256: string;
  byteLength: number;
};

type BiometricKeyring = {
  activeKeyId: string;
  keys: Map<string, Buffer>;
};

export type BiometricKeyringReadiness = {
  configured: boolean;
  ready: boolean;
  configuredKeyCount: number;
};

function associatedData(context: BiometricPayloadContext) {
  return Buffer.from(
    JSON.stringify([
      "HCIS_BIOMETRIC_V1",
      context.credentialId,
      context.employeeId,
      context.modality,
      context.slotIndex,
      context.vendorFormat,
    ]),
    "utf8",
  );
}

function parseConfiguredKeyring(config: ApiConfig): BiometricKeyring {
  const activeKeyId = config.BIOMETRIC_ACTIVE_KEY_ID?.trim();
  if (!activeKeyId || !KEY_ID_PATTERN.test(activeKeyId)) {
    throw new Error("BIOMETRIC_ACTIVE_KEY_ID is not configured correctly");
  }
  if (!config.BIOMETRIC_ENCRYPTION_KEYS) {
    throw new Error("BIOMETRIC_ENCRYPTION_KEYS is not configured");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(config.BIOMETRIC_ENCRYPTION_KEYS);
  } catch {
    throw new Error("BIOMETRIC_ENCRYPTION_KEYS must be a JSON object");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("BIOMETRIC_ENCRYPTION_KEYS must be a JSON object");
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!KEY_ID_PATTERN.test(keyId) || typeof value !== "string" || !KEY_PATTERN.test(value)) {
      throw new Error("BIOMETRIC_ENCRYPTION_KEYS contains an invalid key entry");
    }
    keys.set(keyId, Buffer.from(value, "hex"));
  }
  if (!keys.has(activeKeyId)) {
    throw new Error("BIOMETRIC_ACTIVE_KEY_ID does not exist in BIOMETRIC_ENCRYPTION_KEYS");
  }
  return { activeKeyId, keys };
}

function encryptWithConfiguredKeyring(
  payload: Buffer,
  context: BiometricPayloadContext,
  config: ApiConfig,
): EncryptedBiometricPayload {
  if (payload.length === 0 || payload.length > MAX_BIOMETRIC_PAYLOAD_BYTES) {
    throw new Error("Biometric payload size is outside the supported boundary");
  }
  const keyring = parseConfiguredKeyring(config);
  const key = keyring.keys.get(keyring.activeKeyId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(context));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return {
    ciphertext,
    iv,
    authTag: cipher.getAuthTag(),
    keyId: keyring.activeKeyId,
    sha256: createHash("sha256").update(payload).digest("hex"),
    byteLength: payload.length,
  };
}

export function biometricCollectionEnabled(config: ApiConfig) {
  return config.BIOMETRIC_COLLECTION_ENABLED === "1";
}

export function biometricKeyringReadiness(config: ApiConfig): BiometricKeyringReadiness {
  if (!config.BIOMETRIC_ACTIVE_KEY_ID && !config.BIOMETRIC_ENCRYPTION_KEYS) {
    return { configured: false, ready: false, configuredKeyCount: 0 };
  }
  try {
    const keyring = parseConfiguredKeyring(config);
    return {
      configured: true,
      ready: true,
      configuredKeyCount: keyring.keys.size,
    };
  } catch {
    return { configured: true, ready: false, configuredKeyCount: 0 };
  }
}

export function activeBiometricKeyId(config: ApiConfig) {
  return parseConfiguredKeyring(config).activeKeyId;
}

export function encryptBiometricPayload(
  payload: Buffer,
  context: BiometricPayloadContext,
  config: ApiConfig,
): EncryptedBiometricPayload {
  if (!biometricCollectionEnabled(config)) {
    throw new Error("Biometric collection is disabled");
  }
  return encryptWithConfiguredKeyring(payload, context, config);
}

export function encryptBiometricPayloadForMaintenance(
  payload: Buffer,
  context: BiometricPayloadContext,
  config: ApiConfig,
): EncryptedBiometricPayload {
  return encryptWithConfiguredKeyring(payload, context, config);
}

export function decryptBiometricPayload(
  encrypted: EncryptedBiometricPayload,
  context: BiometricPayloadContext,
  config: ApiConfig,
): Buffer {
  const keyring = parseConfiguredKeyring(config);
  const key = keyring.keys.get(encrypted.keyId);
  if (!key) throw new Error("Biometric encryption key is unavailable");
  if (encrypted.iv.length !== 12 || encrypted.authTag.length !== 16) {
    throw new Error("Encrypted biometric payload envelope is invalid");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.iv);
  decipher.setAAD(associatedData(context));
  decipher.setAuthTag(encrypted.authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
  const actualHash = createHash("sha256").update(plaintext).digest();
  const expectedHash = Buffer.from(encrypted.sha256, "hex");
  if (expectedHash.length !== actualHash.length || !timingSafeEqual(actualHash, expectedHash)) {
    throw new Error("Biometric payload integrity check failed");
  }
  if (plaintext.length !== encrypted.byteLength) {
    throw new Error("Biometric payload length check failed");
  }
  return plaintext;
}

export function reencryptBiometricPayload(
  encrypted: EncryptedBiometricPayload,
  context: BiometricPayloadContext,
  config: ApiConfig,
): EncryptedBiometricPayload {
  const plaintext = decryptBiometricPayload(encrypted, context, config);
  const reencrypted = encryptBiometricPayloadForMaintenance(plaintext, context, config);
  if (reencrypted.sha256 !== encrypted.sha256 || reencrypted.byteLength !== encrypted.byteLength) {
    throw new Error("Biometric payload changed during re-encryption");
  }
  return reencrypted;
}
