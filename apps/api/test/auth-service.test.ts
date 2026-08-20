import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  encryptSecret,
  generateTotp,
  generateTotpSecret,
  hashPassword,
} from "../src/modules/auth/crypto.js";
import {
  AUTH_COOKIE_NAME,
  AuthService,
  readCookie,
} from "../src/modules/auth/service.js";

const encryptionKey = "11".repeat(32);

async function superAdminRow() {
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret, encryptionKey);

  return {
    secret,
    account: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "admin@hcis.sabilulquran.or.id",
      principalType: "SUPER_ADMIN" as const,
      status: "active" as const,
      passwordHash: await hashPassword("very-long-test-password"),
      mfaSecretCiphertext: encrypted.ciphertext,
      mfaSecretIv: encrypted.iv,
      mfaSecretTag: encrypted.tag,
      mfaEnabledAt: new Date(),
    },
  };
}

describe("AuthService", () => {
  it("requires MFA before a Super Admin session can be created", async () => {
    const { account } = await superAdminRow();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounts")) return { rows: [account], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const service = new AuthService({ query } as unknown as Pool, encryptionKey, 8, true);

    await expect(
      service.login(
        {
          email: account.email,
          password: "very-long-test-password",
        },
        { ipAddress: "127.0.0.1", userAgent: "vitest" },
      ),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED", statusCode: 401 });

    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auth_sessions"))).toBe(
      false,
    );
  });

  it("creates an opaque secure session after password and TOTP succeed", async () => {
    const { account, secret } = await superAdminRow();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM accounts")) return { rows: [account], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const service = new AuthService({ query } as unknown as Pool, encryptionKey, 8, true);

    const result = await service.login(
      {
        email: account.email,
        password: "very-long-test-password",
        mfaCode: generateTotp(secret),
      },
      { ipAddress: "127.0.0.1", userAgent: "vitest" },
    );

    expect(result.session.principal).toMatchObject({
      email: account.email,
      principalType: "SUPER_ADMIN",
    });
    expect(result.setCookie).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(result.setCookie).toContain("HttpOnly");
    expect(result.setCookie).toContain("Secure");
    expect(result.setCookie).toContain("SameSite=Lax");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO auth_sessions"))).toBe(
      true,
    );
  });

  it("returns no session when the database rejects the token/account state", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const service = new AuthService({ query } as unknown as Pool, encryptionKey, 8, true);

    await expect(service.getSession("opaque-token")).resolves.toBeNull();
  });
});

describe("readCookie", () => {
  it("reads only the requested cookie", () => {
    expect(readCookie("other=1; hcis_session=abc123; theme=dark", "hcis_session")).toBe(
      "abc123",
    );
    expect(readCookie("other=1", "hcis_session")).toBeNull();
  });
});
