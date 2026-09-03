import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";

import type { ApiConfig } from "../../../config/env.js";
import { resolveFirmwareDownload } from "./physical-parity-service.js";

function directHostname(hostHeader: string | undefined): string | null {
  if (!hostHeader || hostHeader.includes(",")) return null;
  try {
    return new URL(`http://${hostHeader.trim()}`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function requestSourceIp(request: FastifyRequest) {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ?? request.ip;
  return raw && /^[0-9A-Fa-f:.]{1,45}$/.test(raw) ? raw : null;
}

export async function registerAdmsPhysicalParityDeviceRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  app.get(
    "/iclock/file",
    { logLevel: "silent" },
    async (request, reply) => {
      const expectedHost = config.ADMS_INGRESS_HOST?.toLowerCase().replace(/\.$/, "");
      if (!expectedHost || directHostname(request.headers.host) !== expectedHost) {
        return reply.status(404).send();
      }
      const token = typeof (request.query as { token?: unknown }).token === "string"
        ? String((request.query as { token: string }).token)
        : "";
      const resolved = await resolveFirmwareDownload(pool, token);
      if (!resolved) return reply.status(404).send();

      const sourceIp = requestSourceIp(request);
      const device = await pool.query<{ lastIp: string | null }>(
        `SELECT last_ip AS "lastIp" FROM attendance_adms_devices WHERE id = $1`,
        [resolved.deviceId],
      );
      const lastIp = device.rows[0]?.lastIp ?? null;
      if (lastIp && sourceIp && sourceIp !== lastIp) {
        return reply.status(404).send();
      }

      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Content-Length", String(resolved.payload.length));
      reply.type("application/octet-stream");
      return reply.send(resolved.payload);
    },
  );
}
