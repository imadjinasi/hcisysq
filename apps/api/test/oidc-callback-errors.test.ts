import { describe, expect, it } from "vitest";

import { safeOidcFailureCategory } from "../src/modules/auth/routes.js";
import { AuthError } from "../src/modules/auth/service.js";

describe("safe OIDC callback failure categories", () => {
  it("exposes only the approved application/account categories", () => {
    expect(
      safeOidcFailureCategory(
        new AuthError(403, "HCIS_ACCESS_DENIED", "Akses ke HCIS tidak diberikan."),
      ),
    ).toBe("access_denied");
    expect(
      safeOidcFailureCategory(
        new AuthError(
          503,
          "APPLICATION_ACCESS_UNAVAILABLE",
          "Akses HCIS belum dapat diverifikasi.",
        ),
      ),
    ).toBe("access_unavailable");
    expect(
      safeOidcFailureCategory(new AuthError(403, "ACCOUNT_INACTIVE", "Akun tidak aktif.")),
    ).toBe("account_inactive");
  });

  it("collapses mapping, callback, provider and unexpected failures into one generic category", () => {
    expect(
      safeOidcFailureCategory(
        new AuthError(403, "OIDC_ACCOUNT_NOT_MAPPED", "Identity mapping is missing."),
      ),
    ).toBe("oidc_failed");
    expect(
      safeOidcFailureCategory(
        new AuthError(401, "OIDC_CALLBACK_INVALID", "Callback contains sensitive detail."),
      ),
    ).toBe("oidc_failed");
    expect(safeOidcFailureCategory(new Error("provider secret detail"))).toBe("oidc_failed");
  });
});
