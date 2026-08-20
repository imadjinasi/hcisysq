import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

export async function registerSystemRoutes(app: FastifyInstance, pool: Pool) {
  app.get("/health", async () => ({ status: "ok" as const }));

  app.get("/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready" as const };
    } catch {
      return reply.code(503).send({ status: "not_ready" as const });
    }
  });
}
