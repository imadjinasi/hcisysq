import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import type { ApiConfig } from "../../config/env.js";
import { requirePrincipalFromCookie } from "../auth/authorization.js";
import { AuthError, AuthService, type AuthPrincipal } from "../auth/service.js";
import {
  employeeMasterEditSchema,
  employeeMasterValidationFields,
} from "./employee-master-validation.js";

const employeeIdSchema = z.object({ employeeId: z.string().uuid() });
const removalSchema = z.object({
  confirmationName: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500),
});

const editableKeys = [
  "fullName",
  "employeeNumber",
  "status",
  "employmentStatus",
  "organizationalUnitId",
  "positionId",
  "employmentType",
  "functionalPosition",
  "structuralPosition",
  "email",
  "phone",
  "education",
  "startedOn",
  "endedOn",
] as const;

interface RemovalDependencyRow {
  category: string;
  count: number;
}

/**
 * Only current Organization relationships can block removal from Employee
 * Master. Legacy direct-manager/unit-approver columns are migration artifacts
 * and no longer participate in routing after the direct Organization cutover.
 */
async function currentOrganizationDependencies(
  db: Pool | PoolClient,
  employeeId: string,
): Promise<RemovalDependencyRow[]> {
  const result = await db.query<RemovalDependencyRow>(
    `WITH today AS (
       SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS d
     ), current_revision AS (
       SELECT c.id
       FROM organization_change_sets c, today
       WHERE c.status = 'PUBLISHED'
         AND c.effective_on <= today.d
       ORDER BY c.effective_on DESC, c.published_at DESC, c.created_at DESC, c.id DESC
       LIMIT 1
     )
     SELECT category, count(*)::int AS count
     FROM (
       SELECT 'Keanggotaan struktur aktif' AS category
       FROM organization_memberships x, current_revision c, today
       WHERE x.change_set_id = c.id
         AND x.employee_id = $1
         AND x.effective_from <= today.d
         AND (x.effective_to IS NULL OR x.effective_to >= today.d)

       UNION ALL

       SELECT 'Penugasan jabatan aktif'
       FROM organization_incumbencies x, current_revision c, today
       WHERE x.change_set_id = c.id
         AND x.employee_id = $1
         AND x.effective_from <= today.d
         AND (x.effective_to IS NULL OR x.effective_to >= today.d)

       UNION ALL

       SELECT 'Penugasan akun pada jabatan aktif'
       FROM organization_incumbencies x
       JOIN accounts a ON a.id = x.account_id,
            current_revision c,
            today
       WHERE x.change_set_id = c.id
         AND a.employee_id = $1
         AND a.principal_type = 'EMPLOYEE'
         AND x.effective_from <= today.d
         AND (x.effective_to IS NULL OR x.effective_to >= today.d)

       UNION ALL

       SELECT 'Aturan pelaporan pegawai aktif'
       FROM organization_reporting_overrides x, current_revision c, today
       WHERE x.change_set_id = c.id
         AND x.employee_id = $1
         AND x.effective_from <= today.d
         AND (x.effective_to IS NULL OR x.effective_to >= today.d)

       UNION ALL

       SELECT 'Aturan pelaporan sebagai atasan aktif'
       FROM organization_reporting_overrides x, current_revision c, today
       WHERE x.change_set_id = c.id
         AND x.manager_employee_id = $1
         AND x.effective_from <= today.d
         AND (x.effective_to IS NULL OR x.effective_to >= today.d)
     ) dependencies
     GROUP BY category
     ORDER BY category`,
    [employeeId],
  );
  return result.rows;
}

export async function registerEmployeeMasterAdminRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  if (!config.AUTH_ENCRYPTION_KEY) {
    throw new Error("AUTH_ENCRYPTION_KEY is required for employee master routes");
  }

  const auth = new AuthService(
    pool,
    config.AUTH_ENCRYPTION_KEY,
    config.AUTH_SESSION_TTL_HOURS,
    config.NODE_ENV === "production",
  );

  const guard = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthPrincipal | null> => {
    try {
      return await requirePrincipalFromCookie(auth, request.headers.cookie, "SUPER_ADMIN");
    } catch (error) {
      if (error instanceof AuthError) {
        await reply.status(error.statusCode).send({ code: error.code, message: error.message });
        return null;
      }
      throw error;
    }
  };

  app.get("/admin/employees/:employeeId/source-snapshots", async (request, reply) => {
    if (!await guard(request, reply)) return;
    const params = employeeIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        code: "INVALID_EMPLOYEE_ID",
        message: "Pegawai tidak valid.",
      });
    }

    const rows = await pool.query(
      `SELECT
         id,
         source_filename AS "sourceFilename",
         source_sheet AS "sourceSheet",
         imported_at AS "importedAt",
         unmodeled_source_data AS "unmodeledSourceData"
       FROM employee_import_source_snapshots
       WHERE employee_id = $1
       ORDER BY imported_at DESC`,
      [params.data.employeeId],
    );

    return reply.send({
      items: rows.rows.map((row: { importedAt: Date }) => ({
        ...row,
        importedAt: row.importedAt.toISOString(),
      })),
    });
  });

  app.patch("/admin/employees/:employeeId", async (request, reply) => {
    const actor = await guard(request, reply);
    if (!actor) return;

    const params = employeeIdSchema.safeParse(request.params);
    const body = employeeMasterEditSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        code: "INVALID_EMPLOYEE_EDIT",
        message: "Data Employee Master tidak valid.",
        fields: body.success ? [] : employeeMasterValidationFields(body.error),
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = (await client.query<Record<string, unknown>>(
        `SELECT
           full_name AS "fullName",
           employee_number AS "employeeNumber",
           status,
           employment_status AS "employmentStatus",
           organizational_unit_id AS "organizationalUnitId",
           position_id AS "positionId",
           employment_type AS "employmentType",
           functional_position AS "functionalPosition",
           structural_position AS "structuralPosition",
           email,
           phone,
           education,
           started_on::text AS "startedOn",
           ended_on::text AS "endedOn"
         FROM employees
         WHERE id = $1
         FOR UPDATE`,
        [params.data.employeeId],
      )).rows[0];
      if (!before) throw new Error("NOT_FOUND");

      const value = body.data;
      const after = {
        fullName: value.fullName,
        employeeNumber: value.employeeNumber,
        status: value.status,
        employmentStatus: value.employmentStatus,
        organizationalUnitId: value.organizationalUnitId,
        positionId: value.positionId,
        employmentType: value.employmentType,
        functionalPosition: value.functionalPosition,
        structuralPosition: value.structuralPosition,
        email: value.email?.toLowerCase() ?? null,
        phone: value.phone,
        education: value.education,
        startedOn: value.startedOn,
        endedOn: value.endedOn,
      };
      const changedFields = editableKeys.filter(
        (key) => String(before[key] ?? "") !== String(after[key] ?? ""),
      );

      await client.query(
        `UPDATE employees SET
           full_name = $2,
           employee_number = $3,
           status = $4,
           employment_status = $5,
           organizational_unit_id = $6,
           position_id = $7,
           employment_type = $8,
           functional_position = $9,
           structural_position = $10,
           email = $11,
           phone = $12,
           education = $13,
           started_on = $14,
           ended_on = $15,
           updated_at = now()
         WHERE id = $1`,
        [params.data.employeeId, ...editableKeys.map((key) => after[key])],
      );

      await client.query(
        `INSERT INTO access_audit_events (
           id, actor_account_id, action, entity_type, entity_id, payload
         ) VALUES ($1,$2,'employee.master.updated','employee',$3,$4::jsonb)`,
        [
          randomUUID(),
          actor.id,
          params.data.employeeId,
          JSON.stringify({ before, after, changedFields, reason: value.reason, source: "manual" }),
        ],
      );

      await client.query("COMMIT");
      return reply.send({ employeeId: params.data.employeeId, accountEmailChanged: false });
    } catch (error) {
      await client.query("ROLLBACK");
      return reply.status(error instanceof Error && error.message === "NOT_FOUND" ? 404 : 409).send({
        code: "EMPLOYEE_EDIT_CONFLICT",
        message: "Employee Master tidak dapat diperbarui karena konflik data.",
      });
    } finally {
      client.release();
    }
  });

  app.post("/admin/employees/:employeeId/remove-preview", async (request, reply) => {
    if (!await guard(request, reply)) return;
    const params = employeeIdSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        code: "INVALID_EMPLOYEE_ID",
        message: "Pegawai tidak valid.",
      });
    }

    const person = (await pool.query(
      `SELECT
         e.full_name AS "fullName",
         e.removed_at AS "removedAt",
         a.id AS "accountId",
         a.status AS "accountStatus"
       FROM employees e
       LEFT JOIN accounts a ON a.employee_id = e.id AND a.principal_type = 'EMPLOYEE'
       WHERE e.id = $1`,
      [params.data.employeeId],
    )).rows[0];
    if (!person) {
      return reply.status(404).send({
        code: "EMPLOYEE_NOT_FOUND",
        message: "Pegawai tidak ditemukan.",
      });
    }

    const dependencyCategories = await currentOrganizationDependencies(pool, params.data.employeeId);
    return reply.send({
      ...person,
      dependencyCategories,
      blocked: dependencyCategories.length > 0,
    });
  });

  app.post("/admin/employees/:employeeId/remove", async (request, reply) => {
    const actor = await guard(request, reply);
    if (!actor) return;
    const params = employeeIdSchema.safeParse(request.params);
    const body = removalSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        code: "INVALID_REMOVAL",
        message: "Konfirmasi pengeluaran pegawai tidak valid.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const person = (await client.query<{ full_name: string }>(
        "SELECT full_name FROM employees WHERE id = $1 AND removed_at IS NULL FOR UPDATE",
        [params.data.employeeId],
      )).rows[0];
      if (!person || person.full_name !== body.data.confirmationName) {
        throw new Error("REJECTED");
      }

      const dependencies = await currentOrganizationDependencies(client, params.data.employeeId);
      if (dependencies.length > 0) throw new Error("DEPENDENCY");

      await client.query(
        `UPDATE employees
         SET removed_at = now(),
             removed_by_account_id = $2,
             removal_reason = $3,
             updated_at = now()
         WHERE id = $1`,
        [params.data.employeeId, actor.id, body.data.reason],
      );
      await client.query(
        `UPDATE accounts
         SET status = 'inactive', updated_at = now()
         WHERE employee_id = $1 AND principal_type = 'EMPLOYEE'`,
        [params.data.employeeId],
      );
      await client.query(
        `UPDATE auth_sessions
         SET revoked_at = now()
         WHERE account_id IN (
           SELECT id FROM accounts
           WHERE employee_id = $1 AND principal_type = 'EMPLOYEE'
         )
           AND revoked_at IS NULL`,
        [params.data.employeeId],
      );
      await client.query(
        `INSERT INTO access_audit_events (
           id, actor_account_id, action, entity_type, entity_id, payload
         ) VALUES ($1,$2,'employee.master.removed','employee',$3,$4::jsonb)`,
        [
          randomUUID(),
          actor.id,
          params.data.employeeId,
          JSON.stringify({ reason: body.data.reason, source: "manual" }),
        ],
      );

      await client.query("COMMIT");
      return reply.send({ employeeId: params.data.employeeId, removed: true });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof Error && error.message === "DEPENDENCY") {
        return reply.status(409).send({
          code: "CURRENT_ORGANIZATION_DEPENDENCY",
          message: "Pegawai masih memiliki hubungan aktif pada Struktur Organisasi.",
        });
      }
      return reply.status(400).send({
        code: "REMOVAL_REJECTED",
        message: "Pegawai belum dapat dikeluarkan dari Employee Master.",
      });
    } finally {
      client.release();
    }
  });
}
