import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

import type { ApiConfig } from "../../../config/env.js";
import { requirePrincipalFromCookie } from "../../auth/authorization.js";
import { AuthError, AuthService, type AuthPrincipal } from "../../auth/service.js";
import { userInfoQueryWireCommand } from "./protocol.js";

const deviceIdSchema = z.object({ deviceId: z.string().uuid() });
const singlePinUserInfoSchema = z.object({
  pin: z.string().regex(/^\d{1,128}$/),
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

export async function registerAdmsWave2UserInfoRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  if (!config.AUTH_ENCRYPTION_KEY) {
    throw new Error("AUTH_ENCRYPTION_KEY is required for ADMS Wave 2 USERINFO routes");
  }
  const auth = new AuthService(
    pool,
    config.AUTH_ENCRYPTION_KEY,
    config.AUTH_SESSION_TTL_HOURS,
    config.NODE_ENV === "production",
  );

  app.post("/admin/attendance/adms/devices/:deviceId/commands/query-user-info", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;

    const params = deviceIdSchema.safeParse(request.params);
    const body = singlePinUserInfoSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        code: "INVALID_ADMS_USERINFO_QUERY",
        message: "Query USERINFO membutuhkan satu PIN numerik 1-128 digit.",
      });
    }

    const wireCommand = userInfoQueryWireCommand(body.data.pin);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const device = await client.query<{ id: string; lifecycle: string }>(
        `SELECT id, lifecycle
         FROM attendance_adms_devices
         WHERE id = $1
         FOR UPDATE`,
        [params.data.deviceId],
      );
      const target = device.rows[0];
      if (!target) {
        await client.query("ROLLBACK");
        return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
      }
      if (target.lifecycle !== "active") {
        await client.query("ROLLBACK");
        return reply.status(409).send({
          code: "ADMS_DEVICE_NOT_ACTIVE",
          message: "USERINFO hanya dapat diminta ke mesin lifecycle active.",
        });
      }

      const observedPin = await client.query<{ observed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM attendance_adms_events e
           WHERE e.device_id = $1 AND e.pin = $2
           UNION ALL
           SELECT 1
           FROM attendance_adms_device_roster_entries r
           WHERE r.device_id = $1 AND r.pin = $2
         ) AS observed`,
        [target.id, body.data.pin],
      );
      if (observedPin.rows[0]?.observed !== true) {
        await client.query("ROLLBACK");
        return reply.status(409).send({
          code: "ADMS_PIN_NOT_OBSERVED",
          message: "Canary USERINFO hanya boleh memakai PIN yang sudah pernah terobservasi pada mesin ini.",
        });
      }

      const active = await client.query<{
        id: string;
        commandNumber: string;
        status: string;
      }>(
        `SELECT id, command_number::text AS "commandNumber", status
         FROM attendance_adms_commands
         WHERE device_id = $1
           AND status IN ('pending', 'delivered', 'acknowledged')
         ORDER BY created_at, command_number
         LIMIT 1`,
        [target.id],
      );
      if (active.rows[0]) {
        await client.query("ROLLBACK");
        return reply.status(409).send({
          code: "ADMS_COMMAND_ACTIVE",
          message: "Masih ada command aktif untuk mesin ini. Tunggu terminal status sebelum query USERINFO.",
          command: active.rows[0],
        });
      }

      const commandId = randomUUID();
      const inserted = await client.query<{
        id: string;
        commandNumber: string;
        commandType: string;
        reason: string;
        status: string;
        createdAt: Date;
        expiresAt: Date;
      }>(
        `INSERT INTO attendance_adms_commands (
           id, device_id, command_type, wire_command, reason, status,
           requested_by_account_id, requested_range_start, requested_range_end, expires_at
         ) VALUES (
           $1, $2, 'query_user_info', $3, 'admin_query_user_info', 'pending',
           $4, NULL, NULL, now() + interval '15 minutes'
         )
         RETURNING
           id,
           command_number::text AS "commandNumber",
           command_type AS "commandType",
           reason,
           status,
           created_at AS "createdAt",
           expires_at AS "expiresAt"`,
        [commandId, target.id, wireCommand, principal.id],
      );
      const item = inserted.rows[0]!;

      await client.query(
        `INSERT INTO attendance_adms_command_events (
           id, command_id, event_type, actor_account_id, metadata
         ) VALUES ($1, $2, 'queued', $3, $4::jsonb)`,
        [
          randomUUID(),
          commandId,
          principal.id,
          JSON.stringify({
            reason: "admin_query_user_info",
            pin: body.data.pin,
            capability: "single_pin_userinfo",
            fullRoster: false,
            pinPreviouslyObserved: true,
          }),
        ],
      );

      await client.query(
        `INSERT INTO attendance_adms_admin_audit_events (
           id, actor_account_id, action, device_id, mapping_id, before_state, after_state
         ) VALUES ($1, $2, 'command_requested', $3, NULL, NULL, $4::jsonb)`,
        [
          randomUUID(),
          principal.id,
          target.id,
          JSON.stringify({
            commandId,
            commandNumber: item.commandNumber,
            commandType: "query_user_info",
            reason: "admin_query_user_info",
            pin: body.data.pin,
            fullRoster: false,
            pinPreviouslyObserved: true,
          }),
        ],
      );

      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.status(202).send({
        item: {
          ...item,
          pin: body.data.pin,
          fullRoster: false,
          verificationRequired: "command_success_and_new_safe_roster_observation",
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      const databaseError = error as Error & { code?: string };
      if (databaseError.code === "23505") {
        return reply.status(409).send({
          code: "ADMS_COMMAND_ACTIVE",
          message: "Command lain menjadi aktif untuk mesin ini. Muat ulang sebelum mencoba lagi.",
        });
      }
      throw error;
    } finally {
      client.release();
    }
  });
}
