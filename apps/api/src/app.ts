import Fastify from "fastify";
import type { Pool } from "pg";

import type { ApiConfig } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerEmployeeContactAdminRoutes } from "./modules/employees/admin-employee-contact-routes.js";
import { registerEmployeeAdminRoutes } from "./modules/employees/admin-routes.js";
import { registerOrgAccessAdminRoutes } from "./modules/employees/admin-org-access-routes.js";
import { registerSystemRoutes } from "./modules/system/routes.js";

export async function createApp(config: ApiConfig, injectedPool?: Pool) {
  const pool = injectedPool ?? createPool(config.DATABASE_URL);
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    trustProxy: true,
  });

  app.addContentTypeParser(
    [
      "application/octet-stream",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ],
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  await registerSystemRoutes(app, pool);
  await registerAuthRoutes(app, pool, config);
  await registerEmployeeAdminRoutes(app, pool, config);
  await registerOrgAccessAdminRoutes(app, pool, config);
  await registerEmployeeContactAdminRoutes(app, pool, config);

  app.addHook("onClose", async () => {
    if (!injectedPool) await pool.end();
  });

  return app;
}
