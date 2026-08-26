import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import {
  OrganizationAuthorityResolver,
  OrganizationResolutionError,
  OrganizationRolloutService,
  PostgresOrganizationRepository,
  type ResolvedAuthority,
  type RolloutAuthorityResult,
} from "../organization/index.js";
import {
  LeaveApprovalConfigurationError,
  snapshotResolvedLeaveAuthorities,
  type LeaveApprovalStep,
  type LeaveApprovalSource,
} from "./domain/approval-chain.js";

type Queryable = Pool | PoolClient;

export class LeaveOrganizationAuthorityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LeaveOrganizationAuthorityError";
  }
}

export interface LeaveAuthorityResolution {
  approvalChain: LeaveApprovalStep[];
  context: {
    authoritativeSource: RolloutAuthorityResult["authoritativeSource"];
    authorities: Array<{
      employeeId: string;
      source: LeaveApprovalSource;
      sources?: LeaveApprovalSource[] | undefined;
      path: string[];
      incumbentKind: string;
    }>;
  };
}

export interface ResolveLeaveAuthoritiesInput {
  workflowKey: string;
  requesterEmployeeId: string;
  effectiveDate: string;
  policyChain: "LINE_AND_UNIT" | "UNIT_ONLY";
}

function organizationServices(db: Queryable) {
  const repository = new PostgresOrganizationRepository(db);
  const resolver = new OrganizationAuthorityResolver(repository);
  return {
    resolver,
    rollout: new OrganizationRolloutService(resolver),
  };
}

export async function resolveLeaveAuthorities(
  db: Queryable,
  input: ResolveLeaveAuthoritiesInput,
): Promise<LeaveAuthorityResolution> {
  const { rollout } = organizationServices(db);
  let result: RolloutAuthorityResult;
  try {
    result = await rollout.resolveAuthorities({
      workflowKey: input.workflowKey,
      requesterEmployeeId: input.requesterEmployeeId,
      effectiveDate: input.effectiveDate,
      authorityRequirement: input.policyChain,
    });
  } catch (error) {
    if (error instanceof OrganizationResolutionError) {
      throw new LeaveOrganizationAuthorityError(error.code, error.message);
    }
    throw error;
  }

  return snapshotLeaveRolloutAuthorities(result, input);
}

export function snapshotLeaveRolloutAuthorities(
  result: RolloutAuthorityResult,
  input: Pick<ResolveLeaveAuthoritiesInput, "requesterEmployeeId" | "policyChain">,
): LeaveAuthorityResolution {

  const sourcesOf = (authority: ResolvedAuthority): LeaveApprovalSource[] =>
    (authority.sources ?? [authority.source]).filter(
      (source): source is LeaveApprovalSource => source !== "OVERSIGHT_PARENT",
    );
  const hasGovernanceAuthority = result.authorities.some((authority) =>
    sourcesOf(authority).includes("GOVERNANCE_APPROVER"),
  );
  const policyAuthorities = result.authorities.filter(
    (authority): authority is ResolvedAuthority & { source: LeaveApprovalSource } =>
      authority.source !== "OVERSIGHT_PARENT" &&
      (input.policyChain === "LINE_AND_UNIT" ||
        hasGovernanceAuthority ||
        sourcesOf(authority).includes("UNIT_APPROVER")),
  );
  const policySources = new Set(policyAuthorities.flatMap(sourcesOf));
  if (!hasGovernanceAuthority && input.policyChain === "LINE_AND_UNIT") {
    if (!policySources.has("DIRECT_MANAGER")) {
      throw new LeaveApprovalConfigurationError(
        "DIRECT_MANAGER_MISSING",
        "Atasan langsung belum dikonfigurasi.",
      );
    }
    if (!policySources.has("UNIT_APPROVER")) {
      throw new LeaveApprovalConfigurationError(
        "UNIT_APPROVER_MISSING",
        "Approver unit belum dikonfigurasi.",
      );
    }
  } else if (!hasGovernanceAuthority && !policySources.has("UNIT_APPROVER")) {
    throw new LeaveApprovalConfigurationError(
      "UNIT_APPROVER_MISSING",
      "Approver unit belum dikonfigurasi.",
    );
  }
  const approvalChain = snapshotResolvedLeaveAuthorities({
    requesterEmployeeId: input.requesterEmployeeId,
    authorities: policyAuthorities.flatMap((authority) =>
      sourcesOf(authority).map((source) => ({ employeeId: authority.employeeId, source })),
    ),
  });

  return {
    approvalChain,
    context: {
      authoritativeSource: result.authoritativeSource,
      authorities: policyAuthorities.map((authority) => ({
        employeeId: authority.employeeId,
        source: authority.source,
        sources: sourcesOf(authority),
        path: authority.path,
        incumbentKind: authority.incumbentKind,
      })),
    },
  };
}

async function finalLineOrGovernanceApprover(
  db: PoolClient,
  requestId: string,
): Promise<string | null> {
  const result = await db.query<{ employeeId: string }>(
    `SELECT approver_employee_id AS "employeeId"
     FROM leave_request_approval_steps
     WHERE leave_request_id = $1
       AND sources && ARRAY[
         'DIRECT_MANAGER', 'UNIT_APPROVER', 'GOVERNANCE_APPROVER'
       ]::text[]
     ORDER BY step_order DESC
     LIMIT 1`,
    [requestId],
  );
  return result.rows[0]?.employeeId ?? null;
}

async function hasSnapshottedOrganizationAuthority(
  db: PoolClient,
  requestId: string,
): Promise<boolean> {
  const result = await db.query<{ source: string | null; mode: string | null }>(
    `SELECT
       validation_summary #>> '{authorityResolution,authoritativeSource}' AS source,
       validation_summary #>> '{authorityResolution,mode}' AS mode
     FROM leave_requests
     WHERE id = $1`,
    [requestId],
  );
  const snapshot = result.rows[0];
  return snapshot?.source === "STRUCTURE" || snapshot?.mode === "STRUCTURE";
}

/**
 * Adds the informational ORG-004 oversight intent without making it an
 * approval step. A savepoint deliberately isolates resolver/outbox failures
 * so this non-blocking notification can never undo the final Leave decision.
 */
export async function enqueueFinalApprovalOversight(
  db: PoolClient,
  input: {
    requestId: string;
    workflowKey: string;
    effectiveDate: string;
    finalApproverEmployeeId?: string;
  },
  dependencies: {
    resolver?: Pick<OrganizationAuthorityResolver, "resolveOversightAbove">;
  } = {},
): Promise<void> {
  let savepointCreated = false;
  try {
    await db.query("SAVEPOINT leave_oversight_notification");
    savepointCreated = true;
    // New submissions snapshot their Organization authority. Historic requests
    // without that snapshot remain side-effect safe and are never re-resolved.
    if (!(await hasSnapshottedOrganizationAuthority(db, input.requestId))) {
      await db.query("RELEASE SAVEPOINT leave_oversight_notification");
      return;
    }
    const finalApproverEmployeeId =
      input.finalApproverEmployeeId ??
      (await finalLineOrGovernanceApprover(db, input.requestId));
    if (!finalApproverEmployeeId) {
      await db.query("RELEASE SAVEPOINT leave_oversight_notification");
      return;
    }

    const resolver = dependencies.resolver ?? organizationServices(db).resolver;
    const recipient = await resolver.resolveOversightAbove({
      approverEmployeeId: finalApproverEmployeeId,
      effectiveDate: input.effectiveDate,
      workflowKey: input.workflowKey,
    });
    if (recipient) {
      await db.query(
        `INSERT INTO leave_notification_outbox (
          id, leave_request_id, event_type, target_type, target_key, payload
        )
        SELECT $1, $2, 'leave.oversight.approved', 'employee', $3, $4::jsonb
        WHERE NOT EXISTS (
          SELECT 1
          FROM leave_notification_outbox
          WHERE leave_request_id = $2
            AND event_type = 'leave.oversight.approved'
        )`,
        [
          randomUUID(),
          input.requestId,
          recipient.employeeId,
          JSON.stringify({
            finalLineApproverEmployeeId: finalApproverEmployeeId,
            resolutionSource: recipient.source,
            resolutionPath: recipient.path,
            incumbentKind: recipient.incumbentKind,
          }),
        ],
      );
    }
    await db.query("RELEASE SAVEPOINT leave_oversight_notification");
  } catch {
    if (savepointCreated) {
      await db.query("ROLLBACK TO SAVEPOINT leave_oversight_notification");
      await db.query("RELEASE SAVEPOINT leave_oversight_notification");
    }
  }
}
