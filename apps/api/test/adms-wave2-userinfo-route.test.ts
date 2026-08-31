import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { ApiConfig } from "../src/config/env.js";

const config: ApiConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3001,
  DATABASE_URL: "postgres://userinfo-retirement.invalid/hcis",
  AUTH_MODE: "local",
  AUTH_ENCRYPTION_KEY: "77".repeat(32),
  AUTH_SESSION_TTL_HOURS: 8,
  BIOMETRIC_COLLECTION_ENABLED: "0",
};

const pool = {
  query: async () => ({ rows: [], rowCount: 0 }),
} as unknown as Pool;

describe("retired USERINFO Admin endpoint", () => {
  it("is not registered in the production application", async () => {
    const app = await createApp(config, pool);
    const response = await app.inject({
      method: "POST",
      url: "/admin/attendance/adms/devices/00000000-0000-4000-8000-000000000901/commands/query-user-info",
      headers: { "content-type": "application/json" },
      payload: { pin: "0042" },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
