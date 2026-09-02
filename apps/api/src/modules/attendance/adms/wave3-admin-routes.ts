import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import type { ApiConfig } from "../../../config/env.js";
import { requirePrincipalFromCookie } from "../../auth/authorization.js";
import { AuthError, AuthService, type AuthPrincipal } from "../../auth/service.js";
import {
  ADMS_MAX_BODY_BYTES,
  attlogEventIdentity,
  bodySha256,
  parseAttlogText,
} from "./protocol.js";
import { projectAdmsAttendanceDay } from "./projection.js";

const deviceIdSchema = z.object({ deviceId: z.string().uuid() });
const workCodeParamsSchema = z.object({ deviceId: z.string().uuid(), workCodeId: z.string().uuid() });
const messageTargetParamsSchema = z.object({ deviceId: z.string().uuid(), messageId: z.string().uuid() });
const messageIdSchema = z.object({ messageId: z.string().uuid() });
const filterIdSchema = z.object({ filterId: z.string().uuid() });
const workCodeSchema = z.object({
  code: z.string().trim().regex(/^[0-9A-Za-z._-]{1,32}$/),
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
});
const targetSchema = z.object({ desiredState: z.enum(["present", "absent"]) });
const messageCreateSchema = z.object({
  audience: z.enum(["public", "private"]),
  employeeId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120),
  messageText: z.string().trim().min(1).max(500),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  active: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.audience === "private" && !value.employeeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pesan private memerlukan employeeId." });
  }
  if (value.audience === "public" && value.employeeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pesan public tidak boleh mempunyai employeeId." });
  }
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "endsAt harus setelah startsAt." });
  }
});
const messageUpdateSchema = z.object({
  active: z.boolean().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  messageText: z.string().trim().min(1).max(500).optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: "Minimal satu field harus diubah.",
});
const savedFilterSchema = z.object({
  deviceId: z.string().uuid().nullable().optional(),
  viewKey: z.enum(["transactions", "commands", "logs"]),
  name: z.string().trim().min(1).max(80),
  criteria: z.record(z.string(), z.unknown()).default({}),
});
const savedFilterQuerySchema = z.object({
  deviceId: z.string().uuid().optional(),
  viewKey: z.enum(["transactions", "commands", "logs"]).optional(),
});
const exportQuerySchema = z.object({
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional(),
  pin: z.string().regex(/^\d{1,128}$/).optional(),
});
const offlineImportSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  content: z.string().min(1),
});

type AuditAction =
  | "work_code_saved"
  | "work_code_target_updated"
  | "device_message_saved"
  | "device_message_target_updated"
  | "offline_attlog_imported"
  | "saved_filter_saved"
  | "saved_filter_deleted"
  | "pending_commands_cleared";

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

async function writeAudit(
  client: PoolClient,
  input: {
    actorAccountId: string;
    action: AuditAction;
    deviceId: string | null;
    beforeState: unknown;
    afterState: unknown;
  },
) {
  await client.query(
    `INSERT INTO attendance_adms_admin_audit_events (
       id, actor_account_id, action, device_id, mapping_id, before_state, after_state
     ) VALUES ($1, $2, $3, $4, NULL, $5::jsonb, $6::jsonb)`,
    [
      randomUUID(),
      input.actorAccountId,
      input.action,
      input.deviceId,
      input.beforeState === null ? null : JSON.stringify(input.beforeState),
      input.afterState === null ? null : JSON.stringify(input.afterState),
    ],
  );
}

async function loadDevice(db: Pool | PoolClient, deviceId: string) {
  const result = await db.query<{
    id: string;
    serialNumber: string;
    displayName: string | null;
    lifecycle: "active" | "disabled" | "quarantined";
    timezone: string;
    model: string | null;
    firmwareVersion: string | null;
    lastSuccessfulRequestAt: Date | null;
  }>(
    `SELECT
       id,
       serial_number AS "serialNumber",
       display_name AS "displayName",
       lifecycle,
       timezone,
       model,
       firmware_version AS "firmwareVersion",
       last_successful_request_at AS "lastSuccessfulRequestAt"
     FROM attendance_adms_devices
     WHERE id = $1`,
    [deviceId],
  );
  return result.rows[0] ?? null;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function operationsCapabilities() {
  return [
    { key: "read_information", label: "Baca informasi mesin", state: "available", execution: "device", reason: "Command INFO sudah diverifikasi pada firmware produksi." },
    { key: "transaction_recovery", label: "Recovery transaksi", state: "available", execution: "device", reason: "LOG dan bounded ATTLOG range sudah diverifikasi." },
    { key: "cancel_pending_commands", label: "Bersihkan command pending", state: "available", execution: "hcis_only", reason: "Hanya command yang belum pernah delivered yang dibatalkan di HCIS." },
    { key: "transaction_export", label: "Export transaksi CSV", state: "available", execution: "hcis_only", reason: "Export membaca fakta raw yang sudah durable." },
    { key: "offline_attlog_import", label: "Import ATTLOG offline", state: "available", execution: "hcis_only", reason: "Parser, dedupe, quarantine, provenance, dan projection memakai invariant ingress yang sama." },
    { key: "work_code_catalog", label: "Katalog Work Code", state: "available", execution: "hcis_only", reason: "Work Code bersifat policy-neutral dan dapat dikelola di HCIS." },
    { key: "work_code_delivery", label: "Distribusi Work Code ke mesin", state: "not_verified", execution: "blocked", reason: "Wire command belum dibuktikan aman pada firmware produksi." },
    { key: "message_catalog", label: "Katalog pesan perangkat", state: "available", execution: "hcis_only", reason: "Pesan dapat direncanakan di HCIS tanpa mengirim command." },
    { key: "message_delivery", label: "Kirim/hapus pesan di mesin", state: "not_verified", execution: "blocked", reason: "Wire command message belum dibuktikan pada perangkat fisik." },
    { key: "time_sync", label: "Sinkron waktu/timezone", state: "not_verified", execution: "blocked", reason: "Belum ada command fisik terverifikasi." },
    { key: "duplicate_punch_period", label: "Duplicate-punch period", state: "not_verified", execution: "blocked", reason: "Belum ada config write terverifikasi." },
    { key: "reboot", label: "Reboot mesin", state: "not_verified", execution: "blocked", reason: "Belum ada reboot wire command terverifikasi." },
    { key: "firmware_upgrade", label: "Upgrade firmware", state: "not_verified", execution: "blocked", reason: "Butuh package/model preflight dan protocol proof terpisah." },
    { key: "clear_attendance", label: "Hapus attendance di mesin", state: "blocked", execution: "blocked", reason: "Break-glass destructive command belum diverifikasi dan tidak boleh menghapus raw HCIS." },
    { key: "clear_photo_cache", label: "Hapus photo/cache di mesin", state: "blocked", execution: "blocked", reason: "Break-glass destructive command belum diverifikasi." },
    { key: "selected_biometric_delete", label: "Hapus biometrik terpilih di mesin", state: "blocked", execution: "blocked", reason: "Device delete terpisah dari HCIS master dan belum diverifikasi." },
    { key: "clear_all_data", label: "Hapus seluruh data mesin", state: "blocked", execution: "blocked", reason: "Destructive all-data command tidak tersedia tanpa physical proof dan break-glass review." },
  ] as const;
}

export async function registerAdmsWave3AdminRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  if (!config.AUTH_ENCRYPTION_KEY) throw new Error("AUTH_ENCRYPTION_KEY is required for ADMS Wave 3 Admin routes");
  const auth = new AuthService(
    pool,
    config.AUTH_ENCRYPTION_KEY,
    config.AUTH_SESSION_TTL_HOURS,
    config.NODE_ENV === "production",
  );

  app.get("/admin/attendance/adms/devices/:deviceId/operations", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ code: "INVALID_ADMS_DEVICE", message: "ID mesin tidak valid." });
    const device = await loadDevice(pool, params.data.deviceId);
    if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
    const pending = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM attendance_adms_commands WHERE device_id = $1 AND status = 'pending'`,
      [device.id],
    );
    reply.header("Cache-Control", "no-store");
    return reply.send({
      item: {
        device,
        pendingCommandCount: pending.rows[0]?.count ?? 0,
        rawPayloadExposed: false,
        arbitraryCommandEnabled: false,
        userInfoReadsRetired: true,
        destructiveExecutionEnabled: false,
        operationalRetention: {
          deletionEnabled: false,
          state: "policy_required",
          note: "Retention cleanup belum mengeksekusi DELETE sampai kebijakan retention HCIS disetujui.",
        },
        capabilities: operationsCapabilities(),
      },
    });
  });

  app.get("/admin/attendance/adms/devices/:deviceId/work-codes", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ code: "INVALID_ADMS_DEVICE", message: "ID mesin tidak valid." });
    const device = await loadDevice(pool, params.data.deviceId);
    if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
    const result = await pool.query(
      `SELECT
         w.id, w.code, w.name, w.active,
         t.desired_state AS "desiredState",
         COALESCE(t.delivery_state, 'not_verified') AS "deliveryState",
         w.created_at AS "createdAt", w.updated_at AS "updatedAt"
       FROM attendance_adms_work_codes w
       LEFT JOIN attendance_adms_work_code_targets t
         ON t.work_code_id = w.id AND t.device_id = $1
       ORDER BY w.active DESC, w.code`,
      [device.id],
    );
    reply.header("Cache-Control", "no-store");
    return reply.send({
      deliveryCapability: "not_verified",
      note: "Katalog HCIS aktif. Target device adalah desired state saja; tidak ada command Work Code dikirim sampai protocol dibuktikan.",
      items: result.rows,
    });
  });

  app.post("/admin/attendance/adms/work-codes", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const body = workCodeSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ code: "INVALID_WORK_CODE", message: "Work Code tidak valid." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query(`SELECT id, code, name, active FROM attendance_adms_work_codes WHERE code = $1 FOR UPDATE`, [body.data.code]);
      const result = await client.query(
        `INSERT INTO attendance_adms_work_codes (id, code, name, active, created_by_account_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, active = EXCLUDED.active, updated_at = now()
         RETURNING id, code, name, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [randomUUID(), body.data.code, body.data.name, body.data.active, principal.id],
      );
      await writeAudit(client, { actorAccountId: principal.id, action: "work_code_saved", deviceId: null, beforeState: before.rows[0] ?? null, afterState: result.rows[0] });
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.status(before.rows[0] ? 200 : 201).send({ item: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.put("/admin/attendance/adms/devices/:deviceId/work-codes/:workCodeId", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = workCodeParamsSchema.safeParse(request.params);
    const body = targetSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ code: "INVALID_WORK_CODE_TARGET", message: "Target Work Code tidak valid." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const device = await loadDevice(client, params.data.deviceId);
      if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
      const workCode = await client.query(`SELECT id, code, name FROM attendance_adms_work_codes WHERE id = $1`, [params.data.workCodeId]);
      if (!workCode.rows[0]) return reply.status(404).send({ code: "WORK_CODE_NOT_FOUND", message: "Work Code tidak ditemukan." });
      const before = await client.query(`SELECT desired_state AS "desiredState", delivery_state AS "deliveryState" FROM attendance_adms_work_code_targets WHERE work_code_id = $1 AND device_id = $2 FOR UPDATE`, [params.data.workCodeId, params.data.deviceId]);
      const result = await client.query(
        `INSERT INTO attendance_adms_work_code_targets (
           work_code_id, device_id, desired_state, delivery_state, updated_by_account_id
         ) VALUES ($1, $2, $3, 'not_verified', $4)
         ON CONFLICT (work_code_id, device_id) DO UPDATE
         SET desired_state = EXCLUDED.desired_state,
             delivery_state = 'not_verified',
             updated_by_account_id = EXCLUDED.updated_by_account_id,
             updated_at = now()
         RETURNING desired_state AS "desiredState", delivery_state AS "deliveryState", updated_at AS "updatedAt"`,
        [params.data.workCodeId, params.data.deviceId, body.data.desiredState, principal.id],
      );
      await writeAudit(client, { actorAccountId: principal.id, action: "work_code_target_updated", deviceId: device.id, beforeState: before.rows[0] ?? null, afterState: { workCodeId: params.data.workCodeId, ...result.rows[0] } });
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.send({ item: result.rows[0], commandCreated: false });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/admin/attendance/adms/devices/:deviceId/messages", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ code: "INVALID_ADMS_DEVICE", message: "ID mesin tidak valid." });
    const device = await loadDevice(pool, params.data.deviceId);
    if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
    const result = await pool.query(
      `SELECT
         m.id, m.audience, m.employee_id AS "employeeId",
         e.employee_number AS "employeeNumber", e.full_name AS "employeeName",
         m.title, m.message_text AS "messageText",
         m.starts_at AS "startsAt", m.ends_at AS "endsAt", m.active,
         t.desired_state AS "desiredState",
         COALESCE(t.delivery_state, 'not_verified') AS "deliveryState",
         m.created_at AS "createdAt", m.updated_at AS "updatedAt"
       FROM attendance_adms_device_messages m
       LEFT JOIN employees e ON e.id = m.employee_id
       LEFT JOIN attendance_adms_device_message_targets t
         ON t.message_id = m.id AND t.device_id = $1
       ORDER BY m.active DESC, m.created_at DESC`,
      [device.id],
    );
    reply.header("Cache-Control", "no-store");
    return reply.send({
      deliveryCapability: "not_verified",
      note: "Pesan dapat disiapkan di HCIS, tetapi belum dikirim ke mesin sampai wire protocol message terverifikasi.",
      items: result.rows,
    });
  });

  app.post("/admin/attendance/adms/messages", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const body = messageCreateSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ code: "INVALID_DEVICE_MESSAGE", message: "Pesan perangkat tidak valid." });
    if (body.data.employeeId) {
      const employee = await pool.query(`SELECT id FROM employees WHERE id = $1`, [body.data.employeeId]);
      if (!employee.rows[0]) return reply.status(404).send({ code: "EMPLOYEE_NOT_FOUND", message: "Pegawai tidak ditemukan." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO attendance_adms_device_messages (
           id, audience, employee_id, title, message_text, starts_at, ends_at, active, created_by_account_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, audience, employee_id AS "employeeId", title, message_text AS "messageText",
           starts_at AS "startsAt", ends_at AS "endsAt", active, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [randomUUID(), body.data.audience, body.data.employeeId ?? null, body.data.title, body.data.messageText, body.data.startsAt ?? null, body.data.endsAt ?? null, body.data.active, principal.id],
      );
      await writeAudit(client, { actorAccountId: principal.id, action: "device_message_saved", deviceId: null, beforeState: null, afterState: result.rows[0] });
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.status(201).send({ item: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch("/admin/attendance/adms/messages/:messageId", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = messageIdSchema.safeParse(request.params);
    const body = messageUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ code: "INVALID_DEVICE_MESSAGE", message: "Perubahan pesan tidak valid." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query(`SELECT id, title, message_text AS "messageText", starts_at AS "startsAt", ends_at AS "endsAt", active FROM attendance_adms_device_messages WHERE id = $1 FOR UPDATE`, [params.data.messageId]);
      if (!before.rows[0]) return reply.status(404).send({ code: "DEVICE_MESSAGE_NOT_FOUND", message: "Pesan tidak ditemukan." });
      const startsAt = body.data.startsAt === undefined ? before.rows[0].startsAt : body.data.startsAt;
      const endsAt = body.data.endsAt === undefined ? before.rows[0].endsAt : body.data.endsAt;
      if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return reply.status(400).send({ code: "INVALID_DEVICE_MESSAGE_RANGE", message: "Waktu selesai harus setelah waktu mulai." });
      const result = await client.query(
        `UPDATE attendance_adms_device_messages
         SET title = COALESCE($2, title),
             message_text = COALESCE($3, message_text),
             starts_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE starts_at END,
             ends_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE ends_at END,
             active = COALESCE($8::boolean, active),
             updated_at = now()
         WHERE id = $1
         RETURNING id, audience, employee_id AS "employeeId", title, message_text AS "messageText",
           starts_at AS "startsAt", ends_at AS "endsAt", active, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [params.data.messageId, body.data.title ?? null, body.data.messageText ?? null, body.data.startsAt !== undefined, body.data.startsAt ?? null, body.data.endsAt !== undefined, body.data.endsAt ?? null, body.data.active ?? null],
      );
      await writeAudit(client, { actorAccountId: principal.id, action: "device_message_saved", deviceId: null, beforeState: before.rows[0], afterState: result.rows[0] });
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.send({ item: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.put("/admin/attendance/adms/devices/:deviceId/messages/:messageId", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = messageTargetParamsSchema.safeParse(request.params);
    const body = targetSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ code: "INVALID_DEVICE_MESSAGE_TARGET", message: "Target pesan tidak valid." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const device = await loadDevice(client, params.data.deviceId);
      if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
      const message = await client.query(`SELECT id, title FROM attendance_adms_device_messages WHERE id = $1`, [params.data.messageId]);
      if (!message.rows[0]) return reply.status(404).send({ code: "DEVICE_MESSAGE_NOT_FOUND", message: "Pesan tidak ditemukan." });
      const before = await client.query(`SELECT desired_state AS "desiredState", delivery_state AS "deliveryState" FROM attendance_adms_device_message_targets WHERE message_id = $1 AND device_id = $2 FOR UPDATE`, [params.data.messageId, params.data.deviceId]);
      const result = await client.query(
        `INSERT INTO attendance_adms_device_message_targets (
           message_id, device_id, desired_state, delivery_state, updated_by_account_id
         ) VALUES ($1, $2, $3, 'not_verified', $4)
         ON CONFLICT (message_id, device_id) DO UPDATE
         SET desired_state = EXCLUDED.desired_state,
             delivery_state = 'not_verified',
             updated_by_account_id = EXCLUDED.updated_by_account_id,
             updated_at = now()
         RETURNING desired_state AS "desiredState", delivery_state AS "deliveryState", updated_at AS "updatedAt"`,
        [params.data.messageId, params.data.deviceId, body.data.desiredState, principal.id],
      );
      await writeAudit(client, { actorAccountId: principal.id, action: "device_message_target_updated", deviceId: device.id, beforeState: before.rows[0] ?? null, afterState: { messageId: params.data.messageId, ...result.rows[0] } });
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.send({ item: result.rows[0], commandCreated: false });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/admin/attendance/adms/saved-filters", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const query = savedFilterQuerySchema.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ code: "INVALID_SAVED_FILTER_QUERY", message: "Filter tersimpan tidak valid." });
    const result = await pool.query(
      `SELECT id, device_id AS "deviceId", view_key AS "viewKey", name, criteria,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM attendance_adms_saved_filters
       WHERE owner_account_id = $1
         AND ($2::uuid IS NULL OR device_id = $2)
         AND ($3::text IS NULL OR view_key = $3)
       ORDER BY updated_at DESC, name`,
      [principal.id, query.data.deviceId ?? null, query.data.viewKey ?? null],
    );
    reply.header("Cache-Control", "no-store");
    return reply.send({ items: result.rows });
  });

  app.post("/admin/attendance/adms/saved-filters", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const body = savedFilterSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ code: "INVALID_SAVED_FILTER", message: "Filter tersimpan tidak valid." });
    if (body.data.deviceId) {
      const device = await loadDevice(pool, body.data.deviceId);
      if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO attendance_adms_saved_filters (
           id, owner_account_id, device_id, view_key, name, criteria
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (owner_account_id, device_id, view_key, name) DO UPDATE
         SET criteria = EXCLUDED.criteria, updated_at = now()
         RETURNING id, device_id AS "deviceId", view_key AS "viewKey", name, criteria,
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [randomUUID(), principal.id, body.data.deviceId ?? null, body.data.viewKey, body.data.name, JSON.stringify(body.data.criteria)],
      );
      await writeAudit(client, { actorAccountId: principal.id, action: "saved_filter_saved", deviceId: body.data.deviceId ?? null, beforeState: null, afterState: { filterId: result.rows[0].id, viewKey: body.data.viewKey, name: body.data.name } });
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.send({ item: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete("/admin/attendance/adms/saved-filters/:filterId", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = filterIdSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ code: "INVALID_SAVED_FILTER", message: "ID filter tidak valid." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const deleted = await client.query<{ id: string; deviceId: string | null; viewKey: string; name: string }>(
        `DELETE FROM attendance_adms_saved_filters
         WHERE id = $1 AND owner_account_id = $2
         RETURNING id, device_id AS "deviceId", view_key AS "viewKey", name`,
        [params.data.filterId, principal.id],
      );
      if (!deleted.rows[0]) return reply.status(404).send({ code: "SAVED_FILTER_NOT_FOUND", message: "Filter tidak ditemukan." });
      await writeAudit(client, { actorAccountId: principal.id, action: "saved_filter_deleted", deviceId: deleted.rows[0].deviceId, beforeState: deleted.rows[0], afterState: null });
      await client.query("COMMIT");
      return reply.status(204).send();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/admin/attendance/adms/devices/:deviceId/commands/clear-pending", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ code: "INVALID_ADMS_DEVICE", message: "ID mesin tidak valid." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const device = await loadDevice(client, params.data.deviceId);
      if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
      const cancelled = await client.query<{ id: string; commandNumber: string }>(
        `UPDATE attendance_adms_commands
         SET status = 'cancelled', completed_at = now(), updated_at = now()
         WHERE device_id = $1 AND status = 'pending'
         RETURNING id, command_number::text AS "commandNumber"`,
        [device.id],
      );
      for (const command of cancelled.rows) {
        await client.query(
          `INSERT INTO attendance_adms_command_events (
             id, command_id, event_type, actor_account_id, metadata
           ) VALUES ($1, $2, 'cancelled', $3, $4::jsonb)`,
          [randomUUID(), command.id, principal.id, JSON.stringify({ reason: "admin_clear_pending" })],
        );
      }
      await writeAudit(client, { actorAccountId: principal.id, action: "pending_commands_cleared", deviceId: device.id, beforeState: { pendingCount: cancelled.rows.length }, afterState: { cancelledCommandNumbers: cancelled.rows.map((item) => item.commandNumber) } });
      await client.query("COMMIT");
      reply.header("Cache-Control", "no-store");
      return reply.send({ cancelledCount: cancelled.rows.length, deliveredOrAcknowledgedCommandsUntouched: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/admin/attendance/adms/devices/:deviceId/transactions/export.csv", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    const query = exportQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) return reply.status(400).send({ code: "INVALID_TRANSACTION_EXPORT", message: "Parameter export tidak valid." });
    const device = await loadDevice(pool, params.data.deviceId);
    if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
    const startAt = query.data.startAt ? new Date(query.data.startAt) : null;
    const endAt = query.data.endAt ? new Date(query.data.endAt) : null;
    if (startAt && endAt && endAt < startAt) return reply.status(400).send({ code: "INVALID_TRANSACTION_EXPORT_RANGE", message: "Waktu selesai tidak boleh sebelum waktu mulai." });
    const result = await pool.query(
      `SELECT
         e.occurred_at_raw AS "occurredAtRaw",
         e.occurred_at AS "occurredAt",
         e.received_at AS "receivedAt",
         e.pin,
         e.raw_fields ->> 4 AS "workCode",
         r.classification AS source,
         m.employee_number AS "employeeNumber",
         m.employee_name AS "employeeName"
       FROM attendance_adms_events e
       JOIN attendance_adms_request_journal r ON r.id = e.source_request_id
       LEFT JOIN LATERAL (
         SELECT emp.employee_number, emp.full_name AS employee_name
         FROM attendance_adms_employee_mappings map
         JOIN employees emp ON emp.id = map.employee_id
         WHERE map.device_id = e.device_id
           AND map.pin = e.pin
           AND e.occurred_at >= map.effective_from
           AND (map.effective_to IS NULL OR e.occurred_at < map.effective_to)
         ORDER BY map.effective_from DESC
         LIMIT 1
       ) m ON true
       WHERE e.device_id = $1
         AND ($2::timestamptz IS NULL OR e.occurred_at >= $2)
         AND ($3::timestamptz IS NULL OR e.occurred_at <= $3)
         AND ($4::text IS NULL OR e.pin = $4)
       ORDER BY e.occurred_at, e.id
       LIMIT 50000`,
      [device.id, startAt, endAt, query.data.pin ?? null],
    );
    const header = ["device_serial", "occurred_at_raw", "occurred_at", "received_at", "pin", "work_code", "employee_number", "employee_name", "source"];
    const rows = result.rows.map((row) => [
      device.serialNumber,
      row.occurredAtRaw,
      row.occurredAt instanceof Date ? row.occurredAt.toISOString() : row.occurredAt,
      row.receivedAt instanceof Date ? row.receivedAt.toISOString() : row.receivedAt,
      row.pin,
      row.workCode,
      row.employeeNumber,
      row.employeeName,
      row.source,
    ].map(csvCell).join(","));
    const csv = `${header.map(csvCell).join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
    reply.header("Cache-Control", "no-store");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="attendance-${device.serialNumber}.csv"`);
    return reply.send(csv);
  });

  app.post("/admin/attendance/adms/devices/:deviceId/offline-attlog-imports", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    const body = offlineImportSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ code: "INVALID_OFFLINE_ATTLOG_IMPORT", message: "File ATTLOG offline tidak valid." });
    const payload = Buffer.from(body.data.content, "utf8");
    if (payload.byteLength > ADMS_MAX_BODY_BYTES) return reply.status(413).send({ code: "OFFLINE_ATTLOG_IMPORT_TOO_LARGE", message: "File ATTLOG maksimal 512 KiB per import." });
    const payloadHash = bodySha256(payload);
    const receivedAt = new Date();
    const client = await pool.connect();
    const insertedEventIds: string[] = [];
    let summary: { id: string; parsedEventCount: number; insertedEventCount: number; duplicateEventCount: number; quarantineCount: number } | null = null;
    try {
      await client.query("BEGIN");
      const device = await loadDevice(client, params.data.deviceId);
      if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
      if (device.lifecycle !== "active") return reply.status(409).send({ code: "ADMS_DEVICE_NOT_ACTIVE", message: "Import offline hanya untuk mesin lifecycle active." });
      const duplicateFile = await client.query(`SELECT id FROM attendance_adms_offline_imports WHERE device_id = $1 AND source_sha256 = $2`, [device.id, payloadHash]);
      if (duplicateFile.rows[0]) return reply.status(409).send({ code: "OFFLINE_ATTLOG_IMPORT_DUPLICATE_FILE", message: "File identik sudah pernah diimport untuk mesin ini." });

      const parsed = parseAttlogText(body.data.content, device.timezone, receivedAt);
      const requestId = randomUUID();
      await client.query(
        `INSERT INTO attendance_adms_request_journal (
           id, device_id, serial_candidate_hash, method, path, raw_query, content_type,
           source_ip, safe_metadata, body, body_sha256, body_byte_length, body_captured,
           classification, response_status, response_body, received_at
         ) VALUES ($1, $2, NULL, 'OFFLINE', '/admin/offline-attlog-import', '', 'text/plain',
           NULL, $3::jsonb, $4, $5, $6, true, 'offline_attlog_import', 201, NULL, $7)`,
        [requestId, device.id, JSON.stringify({ source: "admin_offline_import", filename: body.data.filename }), payload, payloadHash, payload.byteLength, receivedAt],
      );

      let duplicateCount = 0;
      for (const quarantine of parsed.quarantines) {
        await client.query(
          `INSERT INTO attendance_adms_quarantines (id, request_id, device_id, reason, raw_line, details)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
          [randomUUID(), requestId, device.id, `OFFLINE_IMPORT_${quarantine.reason}`, quarantine.rawLine, JSON.stringify(quarantine.details)],
        );
      }
      for (const event of parsed.events) {
        const eventId = randomUUID();
        const identity = attlogEventIdentity(device.serialNumber, event);
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO attendance_adms_events (
             id, device_id, source_request_id, event_identity_hash, pin,
             occurred_at_raw, occurred_at, raw_line, raw_fields, raw_line_sha256, received_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
           ON CONFLICT (event_identity_hash) DO NOTHING
           RETURNING id`,
          [eventId, device.id, requestId, identity, event.pin, event.occurredAtRaw, event.occurredAt, event.rawLine, JSON.stringify(event.rawFields), event.rawLineSha256, receivedAt],
        );
        if (inserted.rows[0]) {
          insertedEventIds.push(eventId);
        } else {
          duplicateCount += 1;
          await client.query(
            `INSERT INTO attendance_adms_quarantines (id, request_id, device_id, reason, raw_line, details)
             VALUES ($1, $2, $3, 'DUPLICATE_EXACT', $4, $5::jsonb)`,
            [randomUUID(), requestId, device.id, event.rawLine, JSON.stringify({ source: "offline_import", eventIdentityHash: identity })],
          );
        }
      }
      const importId = randomUUID();
      const quarantineCount = parsed.quarantines.length + duplicateCount;
      await client.query(
        `INSERT INTO attendance_adms_offline_imports (
           id, device_id, source_request_id, source_filename, source_sha256,
           parsed_event_count, inserted_event_count, duplicate_event_count, quarantine_count,
           created_by_account_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [importId, device.id, requestId, body.data.filename, payloadHash, parsed.events.length, insertedEventIds.length, duplicateCount, quarantineCount, principal.id],
      );
      summary = {
        id: importId,
        parsedEventCount: parsed.events.length,
        insertedEventCount: insertedEventIds.length,
        duplicateEventCount: duplicateCount,
        quarantineCount,
      };
      await writeAudit(client, { actorAccountId: principal.id, action: "offline_attlog_imported", deviceId: device.id, beforeState: null, afterState: summary });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const projection = [] as unknown[];
    if (insertedEventIds.length > 0) {
      const targets = await pool.query<{ employeeId: string; attendanceDate: string }>(
        `SELECT DISTINCT
           m.employee_id AS "employeeId",
           ((e.occurred_at AT TIME ZONE 'Asia/Jakarta')::date)::text AS "attendanceDate"
         FROM attendance_adms_events e
         JOIN attendance_adms_employee_mappings m
           ON m.device_id = e.device_id
          AND m.pin = e.pin
          AND e.occurred_at >= m.effective_from
          AND (m.effective_to IS NULL OR e.occurred_at < m.effective_to)
         WHERE e.id = ANY($1::uuid[])
         ORDER BY "attendanceDate", "employeeId"`,
        [insertedEventIds],
      );
      for (const target of targets.rows) {
        try {
          projection.push(await projectAdmsAttendanceDay(pool, target.employeeId, target.attendanceDate));
        } catch (error) {
          request.log.error({ err: error, employeeId: target.employeeId, attendanceDate: target.attendanceDate }, "offline ATTLOG projection failed");
        }
      }
    }
    reply.header("Cache-Control", "no-store");
    return reply.status(201).send({ item: summary, projection, deviceCommandsRequested: 0 });
  });

  app.get("/admin/attendance/adms/devices/:deviceId/offline-attlog-imports", async (request, reply) => {
    const principal = await authenticate(auth, request, reply);
    if (!principal) return;
    const params = deviceIdSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ code: "INVALID_ADMS_DEVICE", message: "ID mesin tidak valid." });
    const device = await loadDevice(pool, params.data.deviceId);
    if (!device) return reply.status(404).send({ code: "ADMS_DEVICE_NOT_FOUND", message: "Mesin tidak ditemukan." });
    const result = await pool.query(
      `SELECT
         id, source_filename AS "sourceFilename",
         parsed_event_count AS "parsedEventCount",
         inserted_event_count AS "insertedEventCount",
         duplicate_event_count AS "duplicateEventCount",
         quarantine_count AS "quarantineCount",
         created_at AS "createdAt"
       FROM attendance_adms_offline_imports
       WHERE device_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [device.id],
    );
    reply.header("Cache-Control", "no-store");
    return reply.send({ items: result.rows });
  });
}