import { describe, expect, it, vi } from "vitest";

import { requirePrincipalFromCookie } from "../src/modules/auth/authorization.js";
import { AuthError, type AuthService } from "../src/modules/auth/service.js";

function authWithSession(
  principalType: "EMPLOYEE" | "FOUNDATION_BOARD" | "SUPER_ADMIN" | null,
): Pick<AuthService, "getSession"> {
  return {
    getSession: vi.fn(async () =>
      principalType
        ? {
            principal: {
              id: "00000000-0000-4000-8000-000000000001",
              email: "synthetic@example.test",
              principalType,
            },
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }
        : null,
    ),
  };
}

describe("requirePrincipalFromCookie", () => {
  it("rejects missing sessions", async () => {
    await expect(
      requirePrincipalFromCookie(authWithSession(null), undefined, "SUPER_ADMIN"),
    ).rejects.toMatchObject<AuthError>({ statusCode: 401, code: "UNAUTHENTICATED" });
  });

  it("rejects an authenticated principal with the wrong type", async () => {
    await expect(
      requirePrincipalFromCookie(
        authWithSession("EMPLOYEE"),
        "hcis_session=synthetic-token",
        "SUPER_ADMIN",
      ),
    ).rejects.toMatchObject<AuthError>({ statusCode: 403, code: "FORBIDDEN" });
  });

  it("returns the principal when the expected type matches", async () => {
    await expect(
      requirePrincipalFromCookie(
        authWithSession("SUPER_ADMIN"),
        "hcis_session=synthetic-token",
        "SUPER_ADMIN",
      ),
    ).resolves.toMatchObject({ principalType: "SUPER_ADMIN" });
  });
});
