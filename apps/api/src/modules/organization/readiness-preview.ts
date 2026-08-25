import type {
  AuthorityEligibilityValidator,
  AuthorityReadinessReader,
  AuthorityReadinessState,
  OrganizationPosition,
  OrganizationSnapshot,
  ResolvedAuthority,
  ResolvedAuthoritySource,
} from "./domain.js";
import { OrganizationResolutionError } from "./domain.js";
import { isEffective } from "./jakarta-date.js";
import { OrganizationAuthorityResolver } from "./resolver.js";

export type AuthorityRuntimeVerdict =
  | "READY"
  | "PENDING_USER_ACTIVATION"
  | "CONFIGURATION_BLOCKED"
  | "VACANT_FALLBACK"
  | "BUSINESS_DECISION_REQUIRED";

export interface AuthorityPositionTrace {
  positionKey: string;
  positionTitle: string;
  nodeName: string;
  state: "OCCUPIED" | "VACANT";
  incumbentEmployeeId: string | null;
  incumbentEmployeeName: string | null;
  accountStatus: AuthorityReadinessState["accountStatus"] | null;
}

export interface AuthorityStructuralIntent {
  authorityType: ResolvedAuthoritySource;
  targetPositionKey: string | null;
  targetPositionTitle: string | null;
  targetNodeName: string | null;
  intendedIncumbentEmployeeId: string;
  intendedIncumbentEmployeeName: string;
  path: AuthorityPositionTrace[];
  vacancyFallback: boolean;
  readiness: AuthorityReadinessState & {
    runtimeVerdict: AuthorityRuntimeVerdict;
    runtimeEligible: boolean;
  };
}

export interface OrganizationAuthorityReadinessPreview {
  snapshot: { id: string; status: OrganizationSnapshot["changeSet"]["status"] };
  effectiveDate: string;
  workflowKey: string;
  requiredCapability: null;
  runtime: {
    authorities: ResolvedAuthority[];
    error: { code: string; message: string; details: Record<string, unknown> } | null;
  };
  structuralIntents: AuthorityStructuralIntent[];
  structuralErrors: Array<{
    authorityType: ResolvedAuthoritySource;
    code: string;
    message: string;
    details: Record<string, unknown>;
  }>;
}

type ResolverFailure = {
  authorityType: ResolvedAuthoritySource;
  error: OrganizationResolutionError;
};

/**
 * Admin-only explanation of a selected snapshot. Structural intent deliberately
 * ignores login readiness; the separate runtime pass keeps the real fail-closed
 * eligibility semantics and never feeds a Leave approval snapshot.
 */
export class OrganizationAuthorityReadinessPreviewService {
  constructor(
    private readonly eligibilityValidator: AuthorityEligibilityValidator,
    private readonly readinessReader: AuthorityReadinessReader,
  ) {}

  async preview(
    snapshot: OrganizationSnapshot,
    input: { requesterEmployeeId: string; effectiveDate: string; workflowKey: string },
  ): Promise<OrganizationAuthorityReadinessPreview> {
    const snapshotReader = { loadEffectiveSnapshot: async () => snapshot };
    const structuralResolver = new OrganizationAuthorityResolver(snapshotReader, {
      eligibilityValidator: { validate: async () => ({ eligible: true, reason: null }) },
    });
    const runtimeResolver = new OrganizationAuthorityResolver(snapshotReader, {
      eligibilityValidator: this.eligibilityValidator,
    });

    const { authorities: structuralAuthorities, failures } = await this.structuralAuthorities(
      structuralResolver,
      input,
    );
    const traceEmployeeIds = new Set<string>();
    for (const authority of structuralAuthorities) {
      traceEmployeeIds.add(authority.employeeId);
      for (const position of this.positionPath(snapshot, authority)) {
        const incumbent = this.effectiveIncumbent(snapshot, position, input.effectiveDate);
        if (incumbent?.employeeId) traceEmployeeIds.add(incumbent.employeeId);
      }
    }
    const readiness = new Map(
      (await this.readinessReader.describeAuthorityReadiness(
        [...traceEmployeeIds],
        input.effectiveDate,
      )).map((item) => [item.employeeId, item]),
    );

    let runtimeAuthorities: ResolvedAuthority[] = [];
    let runtimeError: OrganizationAuthorityReadinessPreview["runtime"]["error"] = null;
    try {
      runtimeAuthorities = (await runtimeResolver.resolveLineAuthorities({
        requesterEmployeeId: input.requesterEmployeeId,
        effectiveDate: input.effectiveDate,
        workflowKey: input.workflowKey,
      })).authorities;
    } catch (error) {
      if (!(error instanceof OrganizationResolutionError)) throw error;
      runtimeError = { code: error.code, message: error.message, details: error.details };
    }

    return {
      snapshot: { id: snapshot.changeSet.id, status: snapshot.changeSet.status },
      effectiveDate: input.effectiveDate,
      workflowKey: input.workflowKey,
      requiredCapability: null,
      runtime: { authorities: runtimeAuthorities, error: runtimeError },
      structuralIntents: structuralAuthorities.map((authority) =>
        this.intent(snapshot, authority, input, readiness)),
      structuralErrors: failures.map(({ authorityType, error }) => ({
        authorityType,
        code: error.code,
        message: error.message,
        details: error.details,
      })),
    };
  }

  private async structuralAuthorities(
    resolver: OrganizationAuthorityResolver,
    input: { requesterEmployeeId: string; effectiveDate: string; workflowKey: string },
  ): Promise<{ authorities: ResolvedAuthority[]; failures: ResolverFailure[] }> {
    const resolverInput = {
      requesterEmployeeId: input.requesterEmployeeId,
      effectiveDate: input.effectiveDate,
      workflowKey: input.workflowKey,
    };
    const governance = await capture(
      "GOVERNANCE_APPROVER",
      () => resolver.resolveGovernanceApprover(resolverInput),
    );
    if (governance.value) return { authorities: [governance.value], failures: [] };
    if (governance.failure) return { authorities: [], failures: [governance.failure] };

    const directManager = await capture(
      "DIRECT_MANAGER",
      () => resolver.resolveDirectManager(resolverInput),
    );
    const unitApprover = await capture(
      "UNIT_APPROVER",
      () => resolver.resolveUnitApprover(resolverInput),
    );
    return {
      authorities: [directManager.value, unitApprover.value].filter(
        (item): item is ResolvedAuthority => item !== null,
      ),
      failures: [directManager.failure, unitApprover.failure].filter(
        (item): item is ResolverFailure => item !== null,
      ),
    };
  }

  private intent(
    snapshot: OrganizationSnapshot,
    authority: ResolvedAuthority,
    input: { requesterEmployeeId: string; effectiveDate: string },
    readinessByEmployee: Map<string, AuthorityReadinessState>,
  ): AuthorityStructuralIntent {
    const positions = this.positionPath(snapshot, authority);
    const requesterPositionKeys = new Set(snapshot.incumbencies
      .filter((item) => item.employeeId === input.requesterEmployeeId
        && isEffective(item.effectiveFrom, item.effectiveTo, input.effectiveDate))
      .map((item) => item.positionKey));
    const authorityPath = positions[0] && requesterPositionKeys.has(positions[0].stableKey)
      ? positions.slice(1)
      : positions;
    const target = authorityPath[0] ?? positions[0] ?? null;
    const path = positions.map((position) => {
      const incumbent = this.effectiveIncumbent(snapshot, position, input.effectiveDate);
      const item = incumbent?.employeeId ? readinessByEmployee.get(incumbent.employeeId) : null;
      return {
        positionKey: position.stableKey,
        positionTitle: position.title,
        nodeName: snapshot.nodes.find((node) => node.stableKey === position.nodeKey)?.name
          ?? "Struktur tidak dikenal",
        state: incumbent ? "OCCUPIED" as const : "VACANT" as const,
        incumbentEmployeeId: incumbent?.employeeId ?? null,
        incumbentEmployeeName: item?.employeeName ?? null,
        accountStatus: item?.accountStatus ?? null,
      };
    });
    const authorityReadiness = readinessByEmployee.get(authority.employeeId) ?? {
      employeeId: authority.employeeId,
      employeeName: "Pegawai tidak ditemukan",
      employeeActive: false,
      accountStatus: "MISSING" as const,
      capabilityStatus: "NOT_REQUIRED" as const,
    };
    const vacancyFallback = path.some((item, index) =>
      item.state === "VACANT" && index < path.length - 1);
    const runtimeEligible = authorityReadiness.employeeActive
      && authorityReadiness.accountStatus === "ACTIVE"
      && authorityReadiness.capabilityStatus !== "MISSING";
    return {
      authorityType: authority.source,
      targetPositionKey: target?.stableKey ?? null,
      targetPositionTitle: target?.title ?? null,
      targetNodeName: target
        ? snapshot.nodes.find((node) => node.stableKey === target.nodeKey)?.name ?? null
        : null,
      intendedIncumbentEmployeeId: authority.employeeId,
      intendedIncumbentEmployeeName: authorityReadiness.employeeName,
      path,
      vacancyFallback,
      readiness: {
        ...authorityReadiness,
        runtimeEligible,
        runtimeVerdict: verdict(authorityReadiness, vacancyFallback),
      },
    };
  }

  private positionPath(snapshot: OrganizationSnapshot, authority: ResolvedAuthority) {
    const positions = new Map(snapshot.positions.map((item) => [item.stableKey, item]));
    return authority.path
      .map((key) => positions.get(key))
      .filter((item): item is OrganizationPosition => item !== undefined);
  }

  private effectiveIncumbent(
    snapshot: OrganizationSnapshot,
    position: OrganizationPosition,
    effectiveDate: string,
  ) {
    const effective = snapshot.incumbencies.filter((item) =>
      item.positionKey === position.stableKey
      && isEffective(item.effectiveFrom, item.effectiveTo, effectiveDate));
    return effective.find((item) => item.kind === "PRIMARY")
      ?? effective.find((item) => item.kind === "ACTING")
      ?? null;
  }
}

async function capture(
  authorityType: ResolvedAuthoritySource,
  operation: () => Promise<ResolvedAuthority | null>,
): Promise<{ value: ResolvedAuthority | null; failure: ResolverFailure | null }> {
  try {
    return { value: await operation(), failure: null };
  } catch (error) {
    if (!(error instanceof OrganizationResolutionError)) throw error;
    return { value: null, failure: { authorityType, error } };
  }
}

function verdict(
  readiness: AuthorityReadinessState,
  vacancyFallback: boolean,
): AuthorityRuntimeVerdict {
  if (!readiness.employeeActive) return "CONFIGURATION_BLOCKED";
  if (readiness.accountStatus === "INVITED") return "PENDING_USER_ACTIVATION";
  if (readiness.accountStatus !== "ACTIVE") return "CONFIGURATION_BLOCKED";
  if (readiness.capabilityStatus === "MISSING") return "CONFIGURATION_BLOCKED";
  return vacancyFallback ? "VACANT_FALLBACK" : "READY";
}
