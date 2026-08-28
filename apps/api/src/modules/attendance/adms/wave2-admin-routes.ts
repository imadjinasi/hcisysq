import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

import type { ApiConfig } from "../../../config/env.js";
import { requirePrincipalFromCookie } from "../../auth/authorization.js";
import { AuthError, AuthService, type AuthPrincipal } from "../../auth/service.js";
import { biometricCollectionEnabled, type BiometricModality } from "./biometric-crypto.js";

const deviceIdSchema = z.object({ deviceId: z.string().uuid() });
const biometricQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  originDeviceId: z.string().uuid().optional(),
  modality: z.enum(["fingerprint", "face", "palm", "bio_photo"]).optional(),
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

export async function registerAdmsWave2AdminRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  if (!config.AUTH_ENCRYPTION_KEY) throw new Error("AUTH_ENCRYPTION_KEY is required for ADMS Wave 2 Admin routes");
  const auth = new AuthService(
    pool,
    config.AUTH_ENCRYPTION_KEY,
    config.AUTH_SESSION_TTL_HOURS,
    config.NODE_ENV === "production",
  );

  app.get("/admin/attendance/adms/devices/:deviceId/roster", async (request, reply) => {
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
         r.id,
         r.pin,
         r.display_name AS "displayName",
         r.card_number AS "cardNumber",
         r.privilege,
         r.verify_mode AS "verifyMode",
         r.safe_metadata AS "safeMetadata",
         r.first_seen_at AS "firstSeenAt",
         r.last_seen_at AS "lastSeenAt",
         r.source_request_id AS "sourceRequestId",
         m.id AS "mappingId",
         m.employee_id AS "employeeId",
         emp.employee_number AS "employeeNumber",
         emp.full_name AS "employeeName",
         emp.status AS "employeeStatus"
       FROM attendance_adms_device_roster_entries r
       LEFT JOIN LATERAL (
         SELECT id, employee_id
         FROM attendance_adms_employee_mappings
         WHERE device_id = r.device_id
           AND pin = r.pin
           AND effective_from <= now()
           AND (effective_to IS NULL OR effective_to > now())
         ORDER BY effective_from DESC
         LIMIT 1
       ) m ON true
       LEFT JOIN employees emp ON emp.id = m.employee_id
       WHERE r.device_id = $1
       ORDER BY r.pin`,
      [params.data.deviceId],
    );

    reply.header("Cache-Control", "no-store");
    return reply.send({
      inventorySemantics: "observed_only",
      completeSnapshot: false,
      note: "Absennya PIN dari daftar ini belum membuktikan user hilang dari mesin sampai full roster query tervalidasi pada hardware.",
      items: result.rows.map((row) => ({
        ...row,
        mappingStatus: row.mappingId ? "mapped" : "unmapped",
      })),
    });
  });

  app.get("/admin/attendance/adms/biometrics", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const query = biometricQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ code: "INVALID_BIOMETRIC_QUERY", message: "Filter biometric tidak valid." });
    }

    const result = await pool.query(
      `SELECT
         c.id,
         c.employee_id AS "employeeId",
         emp.employee_number AS "employeeNumber",
         emp.full_name AS "employeeName",
         emp.status AS "employeeStatus",
         c.modality,
         c.slot_index AS "slotIndex",
         c.vendor_format AS "vendorFormat",
         c.vendor_version AS "vendorVersion",
         c.origin_device_id AS "originDeviceId",
         d.serial_number AS "originDeviceSerial",
         c.source_pin AS "sourcePin",
         c.captured_at AS "capturedAt",
         c.imported_at AS "importedAt",
         c.lifecycle,
         c.payload_byte_length AS "payloadByteLength",
         c.safe_metadata AS "safeMetadata",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt"
       FROM attendance_biometric_credentials c
       JOIN employees emp ON emp.id = c.employee_id
       LEFT JOIN attendance_adms_devices d ON d.id = c.origin_device_id
       WHERE ($1::uuid IS NULL OR c.employee_id = $1)
         AND ($2::uuid IS NULL OR c.origin_device_id = $2)
         AND ($3::text IS NULL OR c.modality = $3)
       ORDER BY emp.full_name, c.modality, c.slot_index NULLS LAST, c.created_at DESC
       LIMIT 1000`,
      [
        query.data.employeeId ?? null,
        query.data.originDeviceId ?? null,
        (query.data.modality as BiometricModality | undefined) ?? null,
      ],
    );

    reply.header("Cache-Control", "no-store");
    return reply.send({
      collectionEnabled: biometricCollectionEnabled(config),
      rawPayloadExposed: false,
      items: result.rows,
    });
  });

  app.get("/admin/attendance/adms/devices/:deviceId/biometric-inventory", async (request, reply) => {
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
         s.credential_id AS "credentialId",
         s.state,
         s.device_vendor_format AS "deviceVendorFormat",
         s.observed_at AS "observedAt",
         s.last_synced_at AS "lastSyncedAt",
         s.last_error_code AS "lastErrorCode",
         s.safe_metadata AS "safeMetadata",
         c.employee_id AS "employeeId",
         emp.employee_number AS "employeeNumber",
         emp.full_name AS "employeeName",
         c.modality,
         c.slot_index AS "slotIndex",
         c.vendor_format AS "vaultVendorFormat",
         c.vendor_version AS "vaultVendorVersion",
         c.lifecycle AS "credentialLifecycle"
       FROM attendance_biometric_device_states s
       JOIN attendance_biometric_credentials c ON c.id = s.credential_id
       JOIN employees emp ON emp.id = c.employee_id
       WHERE s.device_id = $1
       ORDER BY emp.full_name, c.modality, c.slot_index NULLS LAST`,
      [params.data.deviceId],
    );

    reply.header("Cache-Control", "no-store");
    return reply.send({
      inventorySemantics: "known_replica_state",
      rawPayloadExposed: false,
      items: result.rows,
    });
  });
}
