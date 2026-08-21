import Fastify from "fastify";
import type { Pool } from "pg";

import type { ApiConfig } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { registerAttendanceRoutes } from "./modules/attendance/routes.js";
import { registerAccountActivationAdminRoutes } from "./modules/auth/admin-account-activation-routes.js";
import { registerAccountActivationRoutes } from "./modules/auth/activation-routes.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerBoardDashboardRoutes } from "./modules/board/dashboard-routes.js";
import { registerEmployeeContactAdminRoutes } from "./modules/employees/admin-employee-contact-routes.js";
import { registerEmployeeAdminRoutes } from "./modules/employees/admin-routes.js";
import { registerOrgAccessAdminRoutes } from "./modules/employees/admin-org-access-routes.js";
import { registerLeaveAdminRoutes } from "./modules/leave/admin-routes.js";
import { registerAttendanceResolutionRoutes } from "./modules/leave/attendance-resolution-routes.js";
import { registerLeaveCalendarAdminRoutes } from "./modules/leave/calendar-admin-routes.js";
import { registerEmployeeLeaveRoutes } from "./modules/leave/employee-routes.js";
import { registerSpecialLeaveRoutes } from "./modules/leave/special-leave-routes.js";
import { registerPayslipRoutes } from "./modules/payslips/routes.js";
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
  await registerAccountActivationRoutes(app, pool);
  await registerAccountActivationAdminRoutes(app, pool, config);
  await registerBoardDashboardRoutes(app, pool, config);
  await registerEmployeeAdminRoutes(app, pool, config);
  await registerOrgAccessAdminRoutes(app, pool, config);
  await registerEmployeeContactAdminRoutes(app, pool, config);
  await registerAttendanceRoutes(app, pool, config);
  await registerLeaveAdminRoutes(app, pool, config);
  await registerLeaveCalendarAdminRoutes(app, pool, config);
  await registerEmployeeLeaveRoutes(app, pool, config);
  await registerSpecialLeaveRoutes(app, pool, config);
  await registerAttendanceResolutionRoutes(app, pool, config);
  await registerPayslipRoutes(app, pool, config);

  app.addHook("onClose", async () => {
    if (!injectedPool) await pool.end();
  });

  return app;
}
