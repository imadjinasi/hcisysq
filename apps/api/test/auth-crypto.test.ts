import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSessionToken,
  generateTotp,
  hashPassword,
  hashRecoveryCode,
  hashSessionToken,
  verifyPassword,
  verifyTotp,
} from "../src/modules/auth/crypto.js";

const RFC_SHA1_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("auth crypto", () => {
  it("hashes passwords with scrypt and verifies without storing plaintext", async () => {
    const encoded = await hashPassword("correct horse battery staple");

    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", encoded)).resolves.toBe(false);
  });

  it("matches the RFC 6238 SHA1 vector reduced to six digits", () => {
    expect(generateTotp(RFC_SHA1_SECRET, 59_000)).toBe("287082");
    expect(verifyTotp(RFC_SHA1_SECRET, "287082", 59_000)).toBe(true);
    expect(verifyTotp(RFC_SHA1_SECRET, "000000", 59_000)).toBe(false);
  });

  it("encrypts MFA secrets and supports hashed recovery/session tokens", () => {
    const key = "00".repeat(32);
    const encrypted = encryptSecret(RFC_SHA1_SECRET, key);

    expect(encrypted.ciphertext).not.toContain(RFC_SHA1_SECRET);
    expect(decryptSecret(encrypted, key)).toBe(RFC_SHA1_SECRET);

    const recovery = generateRecoveryCodes(1)[0]!;
    expect(hashRecoveryCode(recovery)).toBe(
      hashRecoveryCode(recovery.toLowerCase().replaceAll("-", "")),
    );

    const session = generateSessionToken();
    expect(session.hash).toBe(hashSessionToken(session.token));
    expect(session.token).not.toBe(session.hash);
  });
});
