import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config/env.js";

const base = {
  DATABASE_URL: "postgres://unused",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
};

const oidc = {
  OIDC_ISSUER: "https://login-staging.sabilulquran.or.id/realms/sq-staff-staging",
  OIDC_CLIENT_ID: "hcis-staging",
  OIDC_CLIENT_SECRET: "synthetic-secret",
  OIDC_REDIRECT_URI: "https://hcis-staging.sabilulquran.or.id/auth/callback",
  OIDC_POST_LOGOUT_REDIRECT_URI: "https://hcis-staging.sabilulquran.or.id/",
  SQ_HUB_APPLICATION_ACCESS_URL:
    "https://hub-staging.sabilulquran.or.id/internal/v1/application-access/check",
  SQ_HUB_MACHINE_CLIENT_ID: "hcis-api-staging",
  SQ_HUB_MACHINE_CLIENT_SECRET: "synthetic-machine-secret",
};

describe("OIDC auth configuration", () => {
  it("keeps local mode as the default so a merge cannot cut production over", () => {
    expect(loadConfig(base).AUTH_MODE).toBe("local");
  });

  it("requires complete OIDC and Application Access configuration only in oidc mode", () => {
    expect(() => loadConfig({ ...base, AUTH_MODE: "oidc" })).toThrow();
    expect(loadConfig({ ...base, ...oidc, AUTH_MODE: "oidc" }).AUTH_MODE).toBe("oidc");
  });

  it("rejects an OIDC HCIS session lifetime longer than the accepted SSO maximum", () => {
    expect(() =>
      loadConfig({
        ...base,
        ...oidc,
        AUTH_MODE: "oidc",
        AUTH_SESSION_TTL_HOURS: "13",
      }),
    ).toThrow();
  });
});
