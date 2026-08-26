import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

import type { ApiConfig } from "../../config/env.js";
import { requirePrincipalFromCookie } from "../auth/authorization.js";
import {
  AuthError,
  AuthService,
  type AuthPrincipal,
} from "../auth/service.js";
import {
  calculateAnnualLeaveYearView,
  type LeaveEntitlementGroup,
} from "./domain/annual-leave-policy.js";
import { LeaveApprovalConfigurationError } from "./domain/approval-chain.js";
import { LEAVE_POLICY_CATALOG } from "./domain/policy-catalog.js";
import {
  LeaveOrganizationAuthorityError,
  resolveLeaveAuthorities,
} from "./organization-authority.js";

const employeeIdSchema = z.object({ employeeId: z.string().uuid() });
const entitlementGroupSchema = z.object({
  group: z.enum(["education", "non_education"]).nullable(),
});
const previewQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

interface LeaveEmployeeRow {
  id: string;
  fullName: string;
  employeeNumber: string;
  status: "active" | "inactive" | "resigned";
  unitId: string | null;
  unitName: string | null;
  positionName: string | null;
  leaveEntitlementGroup: LeaveEntitlementGroup | null;
}

interface LeavePreviewRow extends LeaveEmployeeRow {
  startedOn: string | null;
}

async function audit(
  pool: Pool,
  principal: AuthPrincipal,
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown>,
) {
  await pool.query(
    `INSERT INTO access_audit_events (
      id, actor_account_id, action, entity_type, entity_id, payload
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [randomUUID(), principal.id, action, entityType, entityId, JSON.stringify(payload)],
  );
}

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function registerLeaveAdminRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: ApiConfig,
) {
  if (!config.AUTH_ENCRYPTION_KEY) {
    throw new Error("AUTH_ENCRYPTION_KEY is required for leave admin routes");
  }

  const auth = new AuthService(
    pool,
    config.AUTH_ENCRYPTION_KEY,
    config.AUTH_SESSION_TTL_HOURS,
    config.NODE_ENV === "production",
  );

  async function authenticateAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthPrincipal | null> {
    try {
      return await requirePrincipalFromCookie(
        auth,
        request.headers.cookie,
        "SUPER_ADMIN",
      );
    } catch (error) {
      if (error instanceof AuthError) {
        reply.header("Cache-Control", "no-store");
        await reply.status(error.statusCode).send({
          code: error.code,
          message: error.message,
        });
        return null;
      }
      throw error;
    }
  }

  app.get("/admin/leave/configuration", async (request, reply) => {
    const principal = await authenticateAdmin(request, reply);
    if (!principal) return;

    const employees = await pool.query<LeaveEmployeeRow>(
      `SELECT
         e.id,
         e.full_name AS "fullName",
         e.employee_number AS "employeeNumber",
         e.status,
         u.id AS "unitId",
         u.name AS "unitName",
         p.name AS "positionName",
         e.leave_entitlement_group AS "leaveEntitlementGroup"
       FROM employees e
       LEFT JOIN organizational_units u ON u.id = e.organizational_unit_id
       LEFT JOIN positions p ON p.id = e.position_id
       WHERE e.status = 'active'
         AND e.removed_at IS NULL
       ORDER BY e.full_name ASC`,
    );

    const entitlementGroupConfigured = employees.rows.filter(
      (employee) => employee.leaveEntitlementGroup !== null,
    ).length;

    reply.header("Cache-Control", "no-store");
    return reply.send({
      policies: LEAVE_POLICY_CATALOG,
      employees: employees.rows,
      summary: {
        activeEmployees: employees.rows.length,
        entitlementGroupConfigured,
      },
      approvalSource: "organization_structure",
    });
  });

  app.patch(
    "/admin/leave/employees/:employeeId/entitlement-group",
    async (request, reply) => {
      const principal = await authenticateAdmin(request, reply);
      if (!principal) return;

      const params = employeeIdSchema.safeParse(request.params);
      const body = entitlementGroupSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({
          code: "INVALID_LEAVE_ENTITLEMENT_GROUP",
          message: "Kelompok hak cuti tidak valid.",
        });
      }

      const employee = await pool.query<{ id: string }>(
        "SELECT id FROM employees WHERE id = $1 AND removed_at IS NULL",
        [params.data.employeeId],
      );
      if (!employee.rows[0]) {
        return reply.status(404).send({
          code: "EMPLOYEE_NOT_FOUND",
          message: "Pegawai tidak ditemukan.",
        });
      }

      await pool.query(
        `UPDATE employees
         SET leave_entitlement_group = $2, updated_at = now()
         WHERE id = $1`,
        [params.data.employeeId, body.data.group],
      );
      await audit(
        pool,
        principal,
        "leave.entitlement_group.changed",
        "employee",
        params.data.employeeId,
        { group: body.data.group },
      );

      return reply.send({
        employeeId: params.data.employeeId,
        leaveEntitlementGroup: body.data.group,
      });
    },
  );

  app.get("/admin/leave/employees/:employeeId/preview", async (request, reply) => {
    const principal = await authenticateAdmin(request, reply);
    if (!principal) return;

    const params = employeeIdSchema.safeParse(request.params);
    const query = previewQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({
        code: "INVALID_LEAVE_PREVIEW",
        message: "Parameter pratinjau cuti tidak valid.",
      });
    }

    const result = await pool.query<LeavePreviewRow>(
      `SELECT
         e.id,
         e.full_name AS "fullName",
         e.employee_number AS "employeeNumber",
         e.status,
         e.started_on::text AS "startedOn",
         u.id AS "unitId",
         u.name AS "unitName",
         p.name AS "positionName",
         e.leave_entitlement_group AS "leaveEntitlementGroup"
       FROM employees e
       LEFT JOIN organizational_units u ON u.id = e.organizational_unit_id
       LEFT JOIN positions p ON p.id = e.position_id
       WHERE e.id = $1
         AND e.removed_at IS NULL
       LIMIT 1`,
      [params.data.employeeId],
    );

    const employee = result.rows[0];
    if (!employee) {
      return reply.status(404).send({
        code: "EMPLOYEE_NOT_FOUND",
        message: "Pegawai tidak ditemukan.",
      });
    }

    const warnings: Array<{ code: string; message: string }> = [];
    let approvalChain: Awaited<ReturnType<typeof resolveLeaveAuthorities>>["approvalChain"] = [];

    try {
      const authorityResolution = await resolveLeaveAuthorities(pool, {
        workflowKey: "leave.annual",
        requesterEmployeeId: employee.id,
        effectiveDate: query.data.date ?? jakartaToday(),
        // Kept only for the compatibility shape of the resolver input. The
        // direct-cutover service ignores these migration-era values.
        legacy: {
          directManagerEmployeeId: null,
          unitApproverEmployeeId: null,
        },
        policyChain: "LINE_AND_UNIT",
      });
      approvalChain = authorityResolution.approvalChain;
    } catch (error) {
      if (
        error instanceof LeaveApprovalConfigurationError ||
        error instanceof LeaveOrganizationAuthorityError
      ) {
        warnings.push({ code: error.code, message: error.message });
      } else {
        throw error;
      }
    }

    const referenceDate = query.data.date ?? jakartaToday();
    const annualLeave = employee.startedOn
      ? calculateAnnualLeaveYearView({
          employmentStartedOn: employee.startedOn,
          referenceDate,
        })
      : null;

    if (!employee.leaveEntitlementGroup) {
      warnings.push({
        code: "ENTITLEMENT_GROUP_MISSING",
        message: "Kelompok hak cuti tenaga pendidikan/non-pendidikan belum dikonfigurasi.",
      });
    }

    reply.header("Cache-Control", "no-store");
    return reply.send({
      employee,
      referenceDate,
      approvalChain,
      approvalSource: "organization_structure",
      annualLeave,
      warnings,
    });
  });
}
