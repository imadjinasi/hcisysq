import Fastify from "fastify";
import type { Pool } from "pg";

import type { ApiConfig } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { registerSystemRoutes } from "./modules/system/routes.js";

export async function createApp(config: ApiConfig, injectedPool?: Pool) {
  const pool = injectedPool ?? createPool(config.DATABASE_URL);
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  await registerSystemRoutes(app, pool);

  app.addHook("onClose", async () => {
    if (!injectedPool) await pool.end();
  });

  return app;
}
