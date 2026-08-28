import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import type { ApiConfig } from "../../../config/env.js";
import { requirePrincipalFromCookie } from "../../auth/authorization.js";
import { AuthError, AuthService, type AuthPrincipal } from "../../auth/service.js";

const deviceIdSchema = z.object({ deviceId: z.string().uuid() });
const connectivityPolicySchema = z.object({
  timeoutSeconds: z.number().int().min(30).max(3600).nullable(),
});

async function authenticate(
  auth: AuthService,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthPrincipal | null> {
  try {
    return await requirePrincipalFromCookie(auth, request.headers.cookie, "SUPER_ADMIN");
  } catch (error) {
    if (error instanceof AuthError) {
      reply.header("Cache-Control", "no-store");
      await reply.status(error.statusCode).send({ code: error.code, message: error.message });
      return null;
    }
    throw error;
  }
}

async function writeDeviceAudit(
  client: PoolClient,
  input: {
    actorAccountId: string;
    deviceId: string;
    beforeState: unknown;
    afterState: unknown;
  },
) {
  await client.query(
    `INSERT INTO attendance_adms_admin_audit_events (
       id, actor_account_id, action, device_id, mapping_id, before_state, after_state
     ) VALUES ($1, $2, 'device_updated', $3, NULL, $4::jsonb, $5::jsonb)`,
    [
      randomUUID(),
      input.actorAccountId,
      input.deviceId,
      JSON.stringify(input.beforeState),
      JSON.stringify(input.afterState),
    ],
  );
}

export async function registerAdmsWave1OpsRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  if (!config.AUTH_ENCRYPTION_KEY) throw new Error("AUTH_ENCRYPTION_KEY is required for ADMS Wave 1 ops routes");
  const auth = new AuthService(
    pool,
    config.AUTH_ENCRYPTION_KEY,
    config.AUTH_SESSION_TTL_HOURS,
    config.NODE_ENV === "production",
  );

  app.patch("/admin/attendance/adms/devices/:deviceId/connectivity-policy", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    const body = connectivityPolicySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        code: "INVALID_ADMS_CONNECTIVITY_POLICY",
        message: "Timeout connectivity harus kosong untuk adaptive mode atau 30-3600 detik.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{
        id: string;
        connectivityTimeoutSeconds: number | null;
      }>(
        `SELECT
           id,
           connectivity_timeout_seconds AS "connectivityTimeoutSeconds"
         FROM attendance_adms_devices
         WHERE id = $1
         FOR UPDATE`,
        [params.data.deviceId],
      );
      const current = found.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
      }

      const updated = await client.query<{
        id: string;
        connectivityTimeoutSeconds: number | null;
      }>(
        `UPDATE attendance_adms_devices
         SET connectivity_timeout_seconds = $2,
             updated_at = now()
         WHERE id = $1
         RETURNING id, connectivity_timeout_seconds AS "connectivityTimeoutSeconds"`,
        [current.id, body.data.timeoutSeconds],
      );
      await writeDeviceAudit(client, {
        actorAccountId: principal.id,
        deviceId: current.id,
        beforeState: current,
        afterState: updated.rows[0],
      });
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.send({ item: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/admin/attendance/adms/devices/:deviceId/telemetry", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ code: "INVALID_ADMS_DEVICE", message: "ID mesin tidak valid." });
    }

    const result = await pool.query<{
      deviceId: string;
      model: string | null;
      firmwareVersion: string | null;
      transportObserved: Record<string, unknown> | null;
      firstSeenAt: Date | null;
      lastSeenAt: Date | null;
      lastSuccessfulRequestAt: Date | null;
      lastIp: string | null;
    }>(
      `SELECT
         id AS "deviceId",
         model,
         firmware_version AS "firmwareVersion",
         metadata -> 'transportObserved' AS "transportObserved",
         first_seen_at AS "firstSeenAt",
         last_seen_at AS "lastSeenAt",
         last_successful_request_at AS "lastSuccessfulRequestAt",
         last_ip AS "lastIp"
       FROM attendance_adms_devices
       WHERE id = $1`,
      [params.data.deviceId],
    );
    const item = result.rows[0];
    if (!item) {
      return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
    }
    reply.header("Cache-Control", "no-store");
    return reply.send({ item });
  });

  app.get("/admin/attendance/adms/devices/:deviceId/reconciliation", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ code: "INVALID_ADMS_DEVICE", message: "ID mesin tidak valid." });
    }

    const exists = await pool.query<{ id: string }>(
      `SELECT id FROM attendance_adms_devices WHERE id = $1`,
      [params.data.deviceId],
    );
    if (!exists.rows[0]) {
      return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
    }

    const result = await pool.query(
      `SELECT
         c.id AS "commandId",
         c.command_number::text AS "commandNumber",
         c.status,
         c.requested_range_start AS "requestedRangeStart",
         c.requested_range_end AS "requestedRangeEnd",
         c.delivered_at AS "deliveredAt",
         c.completed_at AS "completedAt",
         c.created_at AS "createdAt",
         coverage."currentPersistedCount",
         coverage."persistedSinceDeliveryCount",
         coverage."firstOccurredAt",
         coverage."lastOccurredAt",
         journal."attlogRequestCount"
       FROM attendance_adms_commands c
       LEFT JOIN LATERAL (
         SELECT
           count(*)::int AS "currentPersistedCount",
           count(*) FILTER (
             WHERE c.delivered_at IS NOT NULL AND e.received_at >= c.delivered_at
           )::int AS "persistedSinceDeliveryCount",
           min(e.occurred_at) AS "firstOccurredAt",
           max(e.occurred_at) AS "lastOccurredAt"
         FROM attendance_adms_events e
         WHERE e.device_id = c.device_id
           AND e.occurred_at >= c.requested_range_start
           AND e.occurred_at <= c.requested_range_end
       ) coverage ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS "attlogRequestCount"
         FROM attendance_adms_request_journal r
         WHERE r.device_id = c.device_id
           AND c.delivered_at IS NOT NULL
           AND r.received_at >= c.delivered_at
           AND r.classification = 'attlog'
       ) journal ON true
       WHERE c.device_id = $1
         AND c.reason = 'admin_range_recovery'
         AND c.requested_range_start IS NOT NULL
         AND c.requested_range_end IS NOT NULL
       ORDER BY c.created_at DESC
       LIMIT 25`,
      [params.data.deviceId],
    );

    reply.header("Cache-Control", "no-store");
    return reply.send({
      coverageBasis: "persisted_range",
      expectedCount: null,
      duplicatesObserved: null,
      note: "Perangkat tidak melaporkan expected count. Ringkasan ini menunjukkan cakupan raw event yang tersimpan; duplicate yang ditolak oleh dedup tidak dapat dihitung kembali secara presisi dari tabel fakta immutable.",
      items: result.rows,
    });
  });
}
