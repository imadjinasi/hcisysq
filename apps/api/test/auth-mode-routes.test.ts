import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import type { ApiConfig } from "../src/config/env.js";
import { registerAuthRoutes } from "../src/modules/auth/routes.js";

const config: ApiConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://unused",
  AUTH_MODE: "oidc",
  AUTH_ENCRYPTION_KEY: "11".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
  OIDC_ISSUER: "https://login.sabilulquran.or.id/realms/sq-staff-staging",
  OIDC_CLIENT_ID: "hcis-staging",
  OIDC_CLIENT_SECRET: "synthetic-secret",
  OIDC_REDIRECT_URI: "https://hcis-staging.sabilulquran.or.id/auth/callback",
  OIDC_POST_LOGOUT_REDIRECT_URI: "https://hcis-staging.sabilulquran.or.id/",
  SQ_HUB_APPLICATION_ACCESS_URL:
    "https://hub-staging.sabilulquran.or.id/internal/v1/application-access/check",
  SQ_HUB_MACHINE_CLIENT_ID: "hcis-api-staging",
  SQ_HUB_MACHINE_CLIENT_SECRET: "synthetic-machine-secret",
};

const pool = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool;

describe("auth mode routes", () => {
  it("does not expose local password authentication in oidc mode", async () => {
    const app = Fastify({ logger: false });
    await registerAuthRoutes(app, pool, config);

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "staff@example.org", password: "not-used" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "LOCAL_AUTH_DISABLED" });
    await app.close();
  });

  it("reports oidc mode so the frontend never guesses or falls back to local", async () => {
    const app = Fastify({ logger: false });
    await registerAuthRoutes(app, pool, config);
    const response = await app.inject({ method: "GET", url: "/auth/mode" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ mode: "oidc" });
    await app.close();
  });
});
