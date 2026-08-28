import { describe, expect, it } from "vitest";

import { parsePassiveBiometricCandidates } from "../src/modules/attendance/adms/biometric-ingress.js";

function encoded(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

describe("ATT-005 Wave 2 passive biometric protocol", () => {
  it("parses documented fingerprint uploads and preserves leading-zero PIN", () => {
    const tmp = encoded("synthetic-fingerprint");
    const parsed = parsePassiveBiometricCandidates(
      `FP PIN=0042\tFID=9\tSize=${tmp.length}\tValid=3\tTMP=${tmp}`,
      "OPERLOG",
    );
    expect(parsed.rejectedRecords).toBe(0);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      pin: "0042",
      modality: "fingerprint",
      slotIndex: 9,
      vendorFormat: "zkteco-push-fingertmp-base64",
      safeMetadata: {
        encoding: "base64",
        valid: true,
        duress: true,
        protocolTable: "OPERLOG",
        source: "device_passive_upload",
      },
    });
    expect(parsed.records[0]?.payload.toString("utf8")).toBe(tmp);
  });

  it("parses documented face uploads as opaque base64 bytes", () => {
    const tmp = encoded("synthetic-face-template");
    const parsed = parsePassiveBiometricCandidates(
      `FACE PIN=0007\tFID=2\tSIZE=${tmp.length}\tVALID=1\tTMP=${tmp}`,
      "OPERLOG",
    );
    expect(parsed.rejectedRecords).toBe(0);
    expect(parsed.records[0]).toMatchObject({
      pin: "0007",
      modality: "face",
      slotIndex: 2,
      vendorFormat: "zkteco-push-face-base64",
      safeMetadata: { duress: false },
    });
    expect(parsed.records[0]?.payload.toString("utf8")).toBe(tmp);
  });

  it("rejects invalid template framing without exposing the payload in an error object", () => {
    const tmp = encoded("synthetic-invalid-template");
    const wrongSize = parsePassiveBiometricCandidates(
      `FP PIN=0042\tFID=1\tSize=${tmp.length + 1}\tValid=1\tTMP=${tmp}`,
      "OPERLOG",
    );
    const invalidBase64 = parsePassiveBiometricCandidates(
      "FP PIN=0042\tFID=1\tSize=4\tValid=1\tTMP=!!!!",
      "OPERLOG",
    );
    const invalidFingerprintSlot = parsePassiveBiometricCandidates(
      `FP PIN=0042\tFID=10\tSize=${tmp.length}\tValid=1\tTMP=${tmp}`,
      "OPERLOG",
    );
    const invalidTemplate = parsePassiveBiometricCandidates(
      `FP PIN=0042\tFID=1\tSize=${tmp.length}\tValid=0\tTMP=${tmp}`,
      "OPERLOG",
    );
    for (const result of [wrongSize, invalidBase64, invalidFingerprintSlot, invalidTemplate]) {
      expect(result.records).toEqual([]);
      expect(result.rejectedRecords).toBe(1);
      expect(JSON.stringify(result)).not.toContain(tmp);
    }
  });

  it("does not parse templates from an unexpected protocol table", () => {
    const tmp = encoded("synthetic-template");
    expect(
      parsePassiveBiometricCandidates(
        `FP PIN=0042\tFID=1\tSize=${tmp.length}\tValid=1\tTMP=${tmp}`,
        "FINGERTMP",
      ),
    ).toEqual({ records: [], rejectedRecords: 0 });
  });
});
