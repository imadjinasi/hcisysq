import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";

import {
  AccountActivationError,
  AccountActivationService,
} from "../auth/account-activation.js";

export const BULK_EMPLOYEE_ACCESS_MAX_ITEMS = 200;

export type EmployeeStatus = "active" | "inactive" | "resigned";
export type EmployeeAccountStatus = "invited" | "active" | "suspended" | "inactive";

export type BulkEmployeeAccessCategory =
  | "ALREADY_ACTIVE"
  | "INVITATION_REQUIRED"
  | "ACCOUNT_PREPARATION_REQUIRED"
  | "SAFE_REACTIVATION"
  | "SKIPPED_EMPLOYEE_NOT_ACTIVE"
  | "SUSPENDED_UNCHANGED"
  | "REQUIRES_REVIEW";

export type BulkEmployeeAccessAction =
  | "ALREADY_ACTIVE"
  | "INVITATION_ISSUED"
  | "ACCOUNT_PREPARED_AND_INVITATION_ISSUED"
  | "ACCOUNT_REACTIVATED"
  | "SKIPPED_EMPLOYEE_NOT_ACTIVE"
  | "SUSPENDED_UNCHANGED"
  | "REQUIRES_REVIEW"
  | "FAILED";

export interface EmployeeAccessCandidate {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeStatus: EmployeeStatus;
  employeeEmail: string | null;
  employeeEmailCount: number;
  conflictingAccountEmailCount: number;
  employeeAccountCount: number;
  accountId: string | null;
  accountStatus: EmployeeAccountStatus | null;
  accountPasswordSet: boolean;
}

export interface BulkEmployeeAccessPreviewItem {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeStatus: EmployeeStatus;
  accountId: string | null;
  accountStatus: EmployeeAccountStatus | null;
  category: BulkEmployeeAccessCategory;
  reasonCode: string | null;
  message: string;
}

export interface BulkEmployeeAccessResultItem extends BulkEmployeeAccessPreviewItem {
  action: BulkEmployeeAccessAction;
  resultingAccountStatus: EmployeeAccountStatus | null;
  activationPath?: string;
  activationExpiresAt?: string;
}

interface CandidateRow extends QueryResultRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeStatus: EmployeeStatus;
  employeeEmail: string | null;
  employeeEmailCount: number;
  conflictingAccountEmailCount: number;
  employeeAccountCount: number;
  accountId: string | null;
  accountStatus: EmployeeAccountStatus | null;
  accountPasswordSet: boolean;
}

interface EmployeeRow extends QueryResultRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employeeStatus: EmployeeStatus;
  employeeEmail: string | null;
  removedAt?: Date | null;
}

interface AccountRow extends QueryResultRow {
  accountId: string;
  accountStatus: EmployeeAccountStatus;
  accountPasswordSet: boolean;
}

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

const emailSchema = z.string().trim().email().max(254);

function normalizedEmail(email: string | null) {
  const parsed = emailSchema.safeParse(email?.trim().toLowerCase() ?? "");
  return parsed.success ? parsed.data : null;
}

export function classifyBulkEmployeeAccess(
  candidate: EmployeeAccessCandidate,
): BulkEmployeeAccessPreviewItem {
  const base = {
    employeeId: candidate.employeeId,
    employeeNumber: candidate.employeeNumber,
    employeeName: candidate.employeeName,
    employeeStatus: candidate.employeeStatus,
    accountId: candidate.accountId,
    accountStatus: candidate.accountStatus,
  };

  if (candidate.employeeStatus !== "active") {
    return {
      ...base,
      category: "SKIPPED_EMPLOYEE_NOT_ACTIVE",
      reasonCode: "EMPLOYEE_NOT_ACTIVE",
      message: "Pegawai nonaktif/resign tidak diubah oleh operasi ini.",
    };
  }
  if (candidate.employeeAccountCount > 1) {
    return {
      ...base,
      category: "REQUIRES_REVIEW",
      reasonCode: "DUPLICATE_EMPLOYEE_ACCOUNT",
      message: "Terdapat lebih dari satu account pegawai dan perlu ditinjau.",
    };
  }
  if (candidate.accountStatus === "active") {
    return {
      ...base,
      category: "ALREADY_ACTIVE",
      reasonCode: null,
      message: "Akses account sudah aktif.",
    };
  }
  if (candidate.accountStatus === "invited") {
    if (candidate.accountPasswordSet) {
      return {
        ...base,
        category: "REQUIRES_REVIEW",
        reasonCode: "INVITED_ACCOUNT_HAS_CREDENTIAL",
        message: "Status undangan tidak konsisten dengan riwayat kredensial dan perlu ditinjau.",
      };
    }
    return {
      ...base,
      category: "INVITATION_REQUIRED",
      reasonCode: null,
      message: "Undangan aktivasi akan diterbitkan atau diperbarui.",
    };
  }
  if (candidate.accountStatus === "suspended") {
    return {
      ...base,
      category: "SUSPENDED_UNCHANGED",
      reasonCode: "ACCOUNT_SUSPENDED",
      message: "Account ditangguhkan dan tidak diaktifkan otomatis.",
    };
  }
  if (candidate.accountStatus === "inactive") {
    if (candidate.accountPasswordSet) {
      return {
        ...base,
        category: "SAFE_REACTIVATION",
        reasonCode: null,
        message: "Account yang pernah diaktifkan dapat diaktifkan kembali secara aman.",
      };
    }
    return {
      ...base,
      category: "REQUIRES_REVIEW",
      reasonCode: "INACTIVE_ACCOUNT_WITHOUT_CREDENTIAL",
      message: "Account nonaktif belum pernah diaktivasi dan perlu ditinjau.",
    };
  }

  if (!normalizedEmail(candidate.employeeEmail)) {
    return {
      ...base,
      category: "REQUIRES_REVIEW",
      reasonCode: "EMPLOYEE_EMAIL_REQUIRED",
      message: "Email pegawai yang valid diperlukan sebelum account dapat disiapkan.",
    };
  }
  if (candidate.employeeEmailCount > 1) {
    return {
      ...base,
      category: "REQUIRES_REVIEW",
      reasonCode: "EMPLOYEE_EMAIL_DUPLICATE",
      message: "Email tercatat pada lebih dari satu pegawai dan perlu ditinjau.",
    };
  }
  if (candidate.conflictingAccountEmailCount > 0) {
    return {
      ...base,
      category: "REQUIRES_REVIEW",
      reasonCode: "ACCOUNT_EMAIL_CONFLICT",
      message: "Email sudah digunakan oleh account lain dan perlu ditinjau.",
    };
  }
  return {
    ...base,
    category: "ACCOUNT_PREPARATION_REQUIRED",
    reasonCode: null,
    message: "Account pegawai akan disiapkan dan undangan aktivasi diterbitkan.",
  };
}

function previewSummary(items: BulkEmployeeAccessPreviewItem[]) {
  return {
    selected: items.length,
    alreadyActive: items.filter((item) => item.category === "ALREADY_ACTIVE").length,
    invitationRequired: items.filter((item) => item.category === "INVITATION_REQUIRED").length,
    accountPreparationRequired: items.filter(
      (item) => item.category === "ACCOUNT_PREPARATION_REQUIRED",
    ).length,
    safeReactivation: items.filter((item) => item.category === "SAFE_REACTIVATION").length,
    skippedInactiveOrResigned: items.filter(
      (item) => item.category === "SKIPPED_EMPLOYEE_NOT_ACTIVE",
    ).length,
    suspendedUnchanged: items.filter((item) => item.category === "SUSPENDED_UNCHANGED").length,
    requiresReview: items.filter((item) => item.category === "REQUIRES_REVIEW").length,
  };
}

function resultSummary(items: BulkEmployeeAccessResultItem[]) {
  return {
    selected: items.length,
    alreadyActive: items.filter((item) => item.action === "ALREADY_ACTIVE").length,
    accountsPrepared: items.filter(
      (item) => item.action === "ACCOUNT_PREPARED_AND_INVITATION_ISSUED",
    ).length,
    activationInvitationsIssuedOrReissued: items.filter((item) =>
      item.action === "INVITATION_ISSUED"
      || item.action === "ACCOUNT_PREPARED_AND_INVITATION_ISSUED"
    ).length,
    accountsSafelyReactivated: items.filter((item) => item.action === "ACCOUNT_REACTIVATED").length,
    skippedInactiveOrResigned: items.filter(
      (item) => item.action === "SKIPPED_EMPLOYEE_NOT_ACTIVE",
    ).length,
    suspendedUnchanged: items.filter((item) => item.action === "SUSPENDED_UNCHANGED").length,
    requiresReview: items.filter((item) => item.action === "REQUIRES_REVIEW").length,
    failed: items.filter((item) => item.action === "FAILED").length,
  };
}

async function insertAudit(
  db: Queryable,
  actorAccountId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  payload: Record<string, unknown>,
) {
  await db.query(
    `INSERT INTO access_audit_events (
      id, actor_account_id, action, entity_type, entity_id, payload
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [randomUUID(), actorAccountId, action, entityType, entityId, JSON.stringify(payload)],
  );
}

function candidateFromRow(row: CandidateRow): EmployeeAccessCandidate {
  return {
    ...row,
    employeeEmailCount: Number(row.employeeEmailCount),
    conflictingAccountEmailCount: Number(row.conflictingAccountEmailCount),
    employeeAccountCount: Number(row.employeeAccountCount),
  };
}

async function loadPreviewCandidates(pool: Pool, employeeIds: string[]) {
  const result = await pool.query<CandidateRow>(
    `SELECT
       e.id AS "employeeId",
       e.employee_number AS "employeeNumber",
       e.full_name AS "employeeName",
       e.status AS "employeeStatus",
       e.email AS "employeeEmail",
       (SELECT count(*)::int FROM employees other
        WHERE lower(btrim(other.email)) = lower(btrim(e.email))) AS "employeeEmailCount",
       (SELECT count(*)::int FROM accounts other
        WHERE lower(other.email) = lower(btrim(e.email))
          AND other.employee_id IS DISTINCT FROM e.id) AS "conflictingAccountEmailCount",
       (SELECT count(*)::int FROM accounts own
        WHERE own.employee_id = e.id AND own.principal_type = 'EMPLOYEE') AS "employeeAccountCount",
       a.id AS "accountId",
       a.status AS "accountStatus",
       (a.password_hash IS NOT NULL) AS "accountPasswordSet"
     FROM employees e
     LEFT JOIN accounts a ON a.employee_id = e.id AND a.principal_type = 'EMPLOYEE'
     WHERE e.id = ANY($1::uuid[]) AND e.removed_at IS NULL
     ORDER BY e.full_name, e.id`,
    [employeeIds],
  );
  return result.rows.map(candidateFromRow);
}

async function loadLockedCandidate(
  client: PoolClient,
  employeeId: string,
): Promise<EmployeeAccessCandidate | null> {
  const employeeResult = await client.query<EmployeeRow>(
    `SELECT id AS "employeeId", employee_number AS "employeeNumber",
            full_name AS "employeeName", status AS "employeeStatus", email AS "employeeEmail", removed_at AS "removedAt"
     FROM employees WHERE id = $1 FOR UPDATE`,
    [employeeId],
  );
  const employee = employeeResult.rows[0];
  if (!employee) return null;

  const accountResult = await client.query<AccountRow>(
    `SELECT id AS "accountId", status AS "accountStatus",
            (password_hash IS NOT NULL) AS "accountPasswordSet"
     FROM accounts
     WHERE employee_id = $1 AND principal_type = 'EMPLOYEE'
     FOR UPDATE`,
    [employeeId],
  );
  const account = accountResult.rows[0];
  const counts = await client.query<{
    employeeEmailCount: number;
    conflictingAccountEmailCount: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM employees other
        WHERE lower(btrim(other.email)) = lower(btrim($1::text))) AS "employeeEmailCount",
       (SELECT count(*)::int FROM accounts other
        WHERE lower(other.email) = lower(btrim($1::text))
          AND other.employee_id IS DISTINCT FROM $2::uuid) AS "conflictingAccountEmailCount"`,
    [employee.employeeEmail, employeeId],
  );
  if (employee.removedAt) return null;
  return {
    ...employee,
    employeeEmailCount: Number(counts.rows[0]?.employeeEmailCount ?? 0),
    conflictingAccountEmailCount: Number(counts.rows[0]?.conflictingAccountEmailCount ?? 0),
    employeeAccountCount: accountResult.rows.length,
    accountId: account?.accountId ?? null,
    accountStatus: account?.accountStatus ?? null,
    accountPasswordSet: account?.accountPasswordSet ?? false,
  };
}

function failedItem(employeeId: string, reasonCode: string): BulkEmployeeAccessResultItem {
  return {
    employeeId,
    employeeNumber: "—",
    employeeName: "Pegawai tidak ditemukan",
    employeeStatus: "inactive",
    accountId: null,
    accountStatus: null,
    category: "REQUIRES_REVIEW",
    reasonCode,
    message: "Item gagal diproses dan tidak mengubah item lain.",
    action: "FAILED",
    resultingAccountStatus: null,
  };
}

function missingPreviewItem(employeeId: string): BulkEmployeeAccessPreviewItem {
  return {
    employeeId,
    employeeNumber: "—",
    employeeName: "Pegawai tidak ditemukan",
    employeeStatus: "inactive",
    accountId: null,
    accountStatus: null,
    category: "REQUIRES_REVIEW",
    reasonCode: "EMPLOYEE_NOT_FOUND",
    message: "Pegawai tidak ditemukan dan perlu ditinjau.",
  };
}

export class BulkEmployeeAccessService {
  private readonly activation: AccountActivationService;

  constructor(private readonly pool: Pool) {
    this.activation = new AccountActivationService(pool);
  }

  async preview(employeeIds: string[]) {
    const candidates = await loadPreviewCandidates(this.pool, employeeIds);
    const byId = new Map(candidates.map((candidate) => [candidate.employeeId, candidate]));
    const items = employeeIds.map((employeeId) => {
      const candidate = byId.get(employeeId);
      return candidate
        ? classifyBulkEmployeeAccess(candidate)
        : missingPreviewItem(employeeId);
    });
    return { items, summary: previewSummary(items) };
  }

  async prepare(employeeIds: string[], actorAccountId: string) {
    const bulkOperationId = randomUUID();
    const items: BulkEmployeeAccessResultItem[] = [];

    for (const employeeId of employeeIds) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const candidate = await loadLockedCandidate(client, employeeId);
        if (!candidate) {
          throw new AccountActivationError(404, "EMPLOYEE_NOT_FOUND", "Pegawai tidak ditemukan.");
        }
        const preview = classifyBulkEmployeeAccess(candidate);
        const auditBase = {
          bulkOperationId,
          employeeId,
          accountId: candidate.accountId,
          previousStatus: candidate.accountStatus,
        };
        let item: BulkEmployeeAccessResultItem;

        if (preview.category === "ALREADY_ACTIVE") {
          item = { ...preview, action: "ALREADY_ACTIVE", resultingAccountStatus: "active" };
        } else if (preview.category === "INVITATION_REQUIRED") {
          const issued = await this.activation.issueInTransaction(
            client,
            candidate.accountId!,
            actorAccountId,
          );
          await insertAudit(client, actorAccountId, "account.activation.issued", "account", candidate.accountId, {
            ...auditBase,
            expiresAt: issued.expiresAt,
            invitationIssued: true,
          });
          item = {
            ...preview,
            action: "INVITATION_ISSUED",
            resultingAccountStatus: "invited",
            activationPath: `/activate#token=${issued.token}`,
            activationExpiresAt: issued.expiresAt,
          };
        } else if (preview.category === "ACCOUNT_PREPARATION_REQUIRED") {
          const accountId = randomUUID();
          const email = normalizedEmail(candidate.employeeEmail)!;
          await client.query(
            `INSERT INTO accounts (id, employee_id, email, principal_type, status)
             VALUES ($1, $2, $3, 'EMPLOYEE', 'invited')`,
            [accountId, employeeId, email],
          );
          await insertAudit(client, actorAccountId, "employee.account.prepared", "account", accountId, {
            ...auditBase,
            accountId,
            resultingStatus: "invited",
          });
          const issued = await this.activation.issueInTransaction(client, accountId, actorAccountId);
          await insertAudit(client, actorAccountId, "account.activation.issued", "account", accountId, {
            ...auditBase,
            accountId,
            expiresAt: issued.expiresAt,
            invitationIssued: true,
          });
          item = {
            ...preview,
            accountId,
            accountStatus: "invited",
            action: "ACCOUNT_PREPARED_AND_INVITATION_ISSUED",
            resultingAccountStatus: "invited",
            activationPath: `/activate#token=${issued.token}`,
            activationExpiresAt: issued.expiresAt,
          };
        } else if (preview.category === "SAFE_REACTIVATION") {
          await client.query(
            `UPDATE accounts SET status = 'active', updated_at = now()
             WHERE id = $1 AND status = 'inactive' AND password_hash IS NOT NULL`,
            [candidate.accountId],
          );
          await insertAudit(client, actorAccountId, "account.status.updated", "account", candidate.accountId, {
            ...auditBase,
            resultingStatus: "active",
          });
          item = { ...preview, action: "ACCOUNT_REACTIVATED", resultingAccountStatus: "active" };
        } else if (preview.category === "SKIPPED_EMPLOYEE_NOT_ACTIVE") {
          item = {
            ...preview,
            action: "SKIPPED_EMPLOYEE_NOT_ACTIVE",
            resultingAccountStatus: candidate.accountStatus,
          };
        } else if (preview.category === "SUSPENDED_UNCHANGED") {
          item = { ...preview, action: "SUSPENDED_UNCHANGED", resultingAccountStatus: "suspended" };
        } else {
          item = {
            ...preview,
            action: "REQUIRES_REVIEW",
            resultingAccountStatus: candidate.accountStatus,
          };
        }

        await insertAudit(client, actorAccountId, "employee.access.bulk.item", "employee", employeeId, {
          ...auditBase,
          accountId: item.accountId,
          action: item.action,
          resultingStatus: item.resultingAccountStatus,
          invitationIssued: Boolean(item.activationPath),
          reasonCode: item.reasonCode,
        });
        await client.query("COMMIT");
        items.push(item);
      } catch (error) {
        await client.query("ROLLBACK");
        const reasonCode = error instanceof AccountActivationError
          ? error.code
          : (error as { code?: string }).code ?? "BULK_ITEM_FAILED";
        items.push(failedItem(employeeId, reasonCode));
        try {
          await insertAudit(
            this.pool,
            actorAccountId,
            "employee.access.bulk.item.failed",
            "employee",
            employeeId,
            { bulkOperationId, employeeId, reasonCode },
          );
        } catch {
          // The item result remains failed; never expose database details or secrets.
        }
      } finally {
        client.release();
      }
    }

    const summary = resultSummary(items);
    await insertAudit(
      this.pool,
      actorAccountId,
      "employee.access.bulk.completed",
      "bulk_operation",
      bulkOperationId,
      { bulkOperationId, ...summary },
    );
    return { bulkOperationId, items, summary };
  }
}
