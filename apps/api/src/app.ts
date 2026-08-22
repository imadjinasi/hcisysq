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
import { registerPlannedEvidenceRoutes } from "./modules/leave/planned-evidence-routes.js";
import { registerPlannedLeaveRoutes } from "./modules/leave/planned-leave-routes.js";
import { registerSpecialLeaveRoutes } from "./modules/leave/special-leave-routes.js";
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
  await registerPlannedLeaveRoutes(app, pool, config);
  await registerPlannedEvidenceRoutes(app, pool, config);
  await registerSpecialLeaveRoutes(app, pool, config);
  await registerAttendanceResolutionRoutes(app, pool, config);

  app.setErrorHandler((error, _request, reply) => {
    const databaseError = error as Error & { code?: string; constraint?: string };
    if (
      databaseError.code === "23514" &&
      databaseError.message === "active leave request overlaps another active leave request"
    ) {
      return reply.status(409).send({
        code: "LEAVE_REQUEST_OVERLAP",
        message: "Rentang cuti bertabrakan dengan pengajuan aktif lain.",
      });
    }
    if (
      databaseError.code === "23514" &&
      [
        "attendance resolution is already final",
        "attendance resolution is awaiting employee decision",
        "invalid attendance resolution transition",
      ].includes(databaseError.message)
    ) {
      return reply.status(409).send({
        code: "ATTENDANCE_RESOLUTION_STATE_CONFLICT",
        message: "Status penyelesaian kehadiran sudah berubah. Muat ulang sebelum mengambil keputusan.",
      });
    }
    if (
      databaseError.code === "23505" &&
      databaseError.constraint === "leave_request_approval_steps_one_pending_idx"
    ) {
      return reply.status(409).send({
        code: "APPROVAL_STATE_CONFLICT",
        message: "Tahap persetujuan aktif sudah berubah. Muat ulang sebelum mengambil keputusan.",
      });
    }
    if (
      databaseError.code === "23505" &&
      databaseError.constraint === "leave_hajj_one_active_request_idx"
    ) {
      return reply.status(409).send({
        code: "HAJJ_REQUEST_ALREADY_ACTIVE",
        message: "Masih ada pengajuan Cuti Ibadah Haji Wajib yang aktif untuk pegawai ini.",
      });
    }
    if (
      databaseError.code === "23505" &&
      databaseError.constraint === "leave_hajj_final_usage_pkey"
    ) {
      return reply.status(409).send({
        code: "HAJJ_ALREADY_USED",
        message: "Hak Cuti Ibadah Haji Wajib sudah pernah digunakan selama masa kerja.",
      });
    }
    return reply.send(error);
  });

  app.addHook("onClose", async () => {
    if (!injectedPool) await pool.end();
  });

  return app;
}
