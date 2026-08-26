import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ApiConfig } from "../../config/env.js";

/** Contact fields are canonical Employee Master data; the reasoned/audited
 * employee-master editor is the only mutation path. */
export async function registerEmployeeContactAdminRoutes(
  _app: FastifyInstance,
  _pool: Pool,
  _config: ApiConfig,
) { void _app; void _pool; void _config; }
