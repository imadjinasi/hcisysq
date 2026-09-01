import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";
import {
  biometricKeyringReadiness,
  decryptBiometricPayload,
  encryptBiometricPayload,
  encryptBiometricPayloadForMaintenance,
  reencryptBiometricPayload,
  type BiometricPayloadContext,
} from "../src/modules/attendance/adms/biometric-crypto.js";

const keyV1 = "11".repeat(32);
const keyV2 = "22".repeat(32);
const context: BiometricPayloadContext = {
  credentialId: "00000000-0000-4000-8000-000000000901",
  employeeId: "00000000-0000-4000-8000-000000000902",
  modality: "fingerprint",
  slotIndex: 3,
  vendorFormat: "zkteco-fp-opaque",
};

function config(activeKeyId = "v1", keys: Record<string, string> = { v1: keyV1 }) {
  return loadConfig({
    DATABASE_URL: "postgres://wave2-test",
    BIOMETRIC_COLLECTION_ENABLED: "1",
    BIOMETRIC_ACTIVE_KEY_ID: activeKeyId,
    BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify(keys),
  });
}

function maintenanceConfig(activeKeyId = "v1", keys: Record<string, string> = { v1: keyV1 }) {
  return loadConfig({
    DATABASE_URL: "postgres://wave2-test",
    BIOMETRIC_COLLECTION_ENABLED: "0",
    BIOMETRIC_ACTIVE_KEY_ID: activeKeyId,
    BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify(keys),
  });
}

describe("ATT-005 Wave 2 biometric encryption", () => {
  it("round-trips opaque bytes with AES-GCM while producing a random envelope", () => {
    const payload = Buffer.from("opaque-vendor-template-not-real-biometric-data", "utf8");
    const first = encryptBiometricPayload(payload, context, config());
    const second = encryptBiometricPayload(payload, context, config());

    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.byteLength).toBe(payload.length);
    expect(first.keyId).toBe("v1");
    expect(first.iv).toHaveLength(12);
    expect(first.authTag).toHaveLength(16);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
    expect(decryptBiometricPayload(first, context, config())).toEqual(payload);
  });

  it("binds ciphertext to credential context through authenticated data", () => {
    const payload = Buffer.from("synthetic-template", "utf8");
    const encrypted = encryptBiometricPayload(payload, context, config());
    expect(() =>
      decryptBiometricPayload(
        encrypted,
        { ...context, employeeId: "00000000-0000-4000-8000-000000000999" },
        config(),
      ),
    ).toThrow();
  });

  it("decrypts an older envelope after active-key rotation while the old key remains in the keyring", () => {
    const payload = Buffer.from("synthetic-template", "utf8");
    const encryptedWithV1 = encryptBiometricPayload(payload, context, config("v1", { v1: keyV1 }));
    const rotated = config("v2", { v1: keyV1, v2: keyV2 });

    expect(decryptBiometricPayload(encryptedWithV1, context, rotated)).toEqual(payload);
    expect(encryptBiometricPayload(payload, context, rotated).keyId).toBe("v2");
  });

  it("keeps collection fail-closed while allowing local vault maintenance with collection off", () => {
    const payload = Buffer.from("synthetic-maintenance-template", "utf8");
    const oldMaintenance = maintenanceConfig("v1", { v1: keyV1 });
    const rotatedMaintenance = maintenanceConfig("v2", { v1: keyV1, v2: keyV2 });

    expect(() => encryptBiometricPayload(payload, context, oldMaintenance)).toThrow(
      "Biometric collection is disabled",
    );

    const oldEnvelope = encryptBiometricPayloadForMaintenance(payload, context, oldMaintenance);
    expect(decryptBiometricPayload(oldEnvelope, context, rotatedMaintenance)).toEqual(payload);

    const reencrypted = reencryptBiometricPayload(oldEnvelope, context, rotatedMaintenance);
    expect(reencrypted.keyId).toBe("v2");
    expect(reencrypted.sha256).toBe(oldEnvelope.sha256);
    expect(reencrypted.byteLength).toBe(oldEnvelope.byteLength);
    expect(reencrypted.ciphertext.equals(oldEnvelope.ciphertext)).toBe(false);
    expect(decryptBiometricPayload(reencrypted, context, rotatedMaintenance)).toEqual(payload);
    expect(biometricKeyringReadiness(rotatedMaintenance)).toEqual({
      configured: true,
      ready: true,
      configuredKeyCount: 2,
    });
  });

  it("reports no maintenance keyring when collection is off and no key material is configured", () => {
    const disabled = loadConfig({ DATABASE_URL: "postgres://wave2-test", BIOMETRIC_COLLECTION_ENABLED: "0" });
    expect(biometricKeyringReadiness(disabled)).toEqual({
      configured: false,
      ready: false,
      configuredKeyCount: 0,
    });
    expect(() => encryptBiometricPayload(Buffer.from("synthetic"), context, disabled)).toThrow(
      "Biometric collection is disabled",
    );
  });

  it("rejects partial or invalid keyring configuration even while collection remains off", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://wave2-test",
        BIOMETRIC_COLLECTION_ENABLED: "0",
        BIOMETRIC_ACTIVE_KEY_ID: "v1",
      }),
    ).toThrow();
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://wave2-test",
        BIOMETRIC_COLLECTION_ENABLED: "0",
        BIOMETRIC_ACTIVE_KEY_ID: "v1",
        BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify({ v1: "not-a-key" }),
      }),
    ).toThrow();
  });

  it("rejects startup configuration that enables collection without a valid keyring", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgres://wave2-test",
        BIOMETRIC_COLLECTION_ENABLED: "1",
        BIOMETRIC_ACTIVE_KEY_ID: "v1",
        BIOMETRIC_ENCRYPTION_KEYS: JSON.stringify({ v1: "not-a-key" }),
      }),
    ).toThrow();
  });
});
