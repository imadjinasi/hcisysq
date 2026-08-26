import { describe, expect, it, vi } from "vitest";

import {
  jakartaBusinessDate,
  deleteOrganizationSubtree,
  OrganizationAuthorityResolver,
  OrganizationDraftService,
  OrganizationResolutionError,
  OrganizationRolloutService,
  PostgresOrganizationRepository,
  type AuthorityEligibilityResult,
  type OrganizationSnapshot,
} from "../src/modules/organization/index.js";

const effectiveFrom = "2026-01-01";
const employeeIds = {
  staff: "employee-staff",
  staffTwo: "employee-staff-two",
  head: "employee-head",
  director: "employee-director",
  acting: "employee-acting",
  secretary: "employee-secretary",
  chair: "employee-chair",
  nanda: "employee-nanda",
};

function snapshot(
  overrides: Partial<OrganizationSnapshot> = {},
  id = "change-set-current",
): OrganizationSnapshot {
  return {
    changeSet: {
      id,
      name: "Synthetic structure",
      effectiveOn: effectiveFrom,
      status: "PUBLISHED",
      baseChangeSetId: null,
      validationReport: { valid: true, issues: [] },
      createdByAccountId: "admin",
      createdAt: "2026-01-01T00:00:00.000Z",
      validatedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: "2026-01-01T00:00:00.000Z",
    },
    nodes: [
      node("node-root", null, 0),
      node("node-team", "node-root", 0),
    ],
    jobProfiles: [],
    positions: [
      position("position-director", "node-root", null),
      position("position-head", "node-team", "position-director"),
    ],
    memberships: [
      membership("membership-staff", employeeIds.staff),
      membership("membership-staff-two", employeeIds.staffTwo),
    ],
    incumbencies: [
      incumbency("incumbency-head", "position-head", employeeIds.head, "PRIMARY"),
      incumbency("incumbency-director", "position-director", employeeIds.director, "PRIMARY"),
    ],
    authorityBindings: [
      binding("binding-leader", "NODE", "node-team", "LEADER", "position-head"),
      binding("binding-unit", "NODE", "node-team", "UNIT_APPROVER", "position-director"),
    ],
    reportingOverrides: [],
    ...overrides,
  };
}

function node(stableKey: string, parentNodeKey: string | null, visualRankOffset: number) {
  return {
    id: `row-${stableKey}`,
    stableKey,
    name: stableKey,
    nodeType: "team",
    parentNodeKey,
    active: true,
    effectiveFrom,
    effectiveTo: null,
    visualRankOffset,
    integrationCode: null,
  };
}

function position(
  stableKey: string,
  nodeKey: string,
  parentPositionKey: string | null,
  visualRankOffset = 0,
) {
  return {
    id: `row-${stableKey}`,
    stableKey,
    nodeKey,
    title: stableKey,
    parentPositionKey,
    singleIncumbent: true,
    vacancyPolicy: "CLIMB_TO_PARENT" as const,
    active: true,
    effectiveFrom,
    effectiveTo: null,
    visualRankOffset,
  };
}

function membership(id: string, employeeId: string, nodeKey = "node-team", isPrimary = true) {
  return {
    id,
    employeeId,
    nodeKey,
    jobProfileKey: null,
    isPrimary,
    effectiveFrom,
    effectiveTo: null,
  };
}

function incumbency(
  id: string,
  positionKey: string,
  employeeId: string,
  kind: "PRIMARY" | "ACTING",
  from = effectiveFrom,
  to: string | null = null,
) {
  return {
    id,
    positionKey,
    employeeId,
    kind,
    effectiveFrom: from,
    effectiveTo: to,
    reason: kind === "ACTING" ? "Synthetic acting mandate" : null,
  };
}

function binding(
  id: string,
  subjectKind: "NODE" | "POSITION",
  subjectKey: string,
  bindingType: "SUPERVISORY_PARENT" | "LEADER" | "UNIT_APPROVER" | "GOVERNANCE_APPROVER" | "OVERSIGHT_PARENT",
  targetPositionKey: string,
) {
  return {
    id,
    subjectKind,
    subjectKey,
    bindingType,
    targetPositionKey,
    vacancyPolicy: "CLIMB_TO_PARENT" as const,
    effectiveFrom,
    effectiveTo: null,
  };
}

function resolver(
  structure: OrganizationSnapshot,
  ineligible = new Set<string>(),
): OrganizationAuthorityResolver {
  return new OrganizationAuthorityResolver(
    { loadEffectiveSnapshot: async () => structure },
    {
      eligibilityValidator: {
        validate: async (employeeId): Promise<AuthorityEligibilityResult> => ineligible.has(employeeId)
          ? { eligible: false, reason: "EMPLOYEE_NOT_ACTIVE" }
          : { eligible: true, reason: null },
      },
    },
  );
}

function resolverWithActionability(
  structure: OrganizationSnapshot,
  failure: AuthorityEligibilityResult,
): OrganizationAuthorityResolver {
  return new OrganizationAuthorityResolver(
    { loadEffectiveSnapshot: async () => structure },
    {
      eligibilityValidator: { validate: async () => ({ eligible: true, reason: null }) },
      actionabilityValidator: {
        validateEmployeeAuthority: async (employeeId) => employeeId === employeeIds.head
          ? failure : { eligible: true, reason: null },
        validateAccountAuthority: async () => failure,
      },
    },
  );
}

describe("ORG-004 authority resolver", () => {
  it("keeps Nanda's SMPIT primary while allowing a concurrent SDIT secondary membership", async () => {
    const structure = snapshot({
      nodes: [node("node-smpit", null, 0), node("node-sdit", null, 0)],
      positions: [
        position("position-smpit-head", "node-smpit", null),
        position("position-sdit-head", "node-sdit", null),
      ],
      memberships: [
        membership("nanda-smpit", employeeIds.nanda, "node-smpit", true),
        membership("nanda-sdit", employeeIds.nanda, "node-sdit", false),
      ],
      incumbencies: [
        incumbency("smpit-head", "position-smpit-head", employeeIds.head, "PRIMARY"),
        incumbency("sdit-head", "position-sdit-head", employeeIds.director, "PRIMARY"),
      ],
      authorityBindings: [
        binding("smpit-leader", "NODE", "node-smpit", "LEADER", "position-smpit-head"),
        binding("sdit-leader", "NODE", "node-sdit", "LEADER", "position-sdit-head"),
      ],
    });

    await expect(resolver(structure).resolveDirectManager({
      requesterEmployeeId: employeeIds.nanda,
      effectiveDate: "2026-08-22",
    })).resolves.toMatchObject({ employeeId: employeeIds.head });
    expect(structure.memberships.filter((item) => item.employeeId === employeeIds.nanda && item.isPrimary))
      .toHaveLength(1);
  });

  it("switches Nanda's primary membership deliberately and rejects two concurrent primaries", async () => {
    const structure = snapshot({
      nodes: [node("node-smpit", null, 0), node("node-sdit", null, 0)],
      positions: [
        position("position-smpit-head", "node-smpit", null),
        position("position-sdit-head", "node-sdit", null),
      ],
      memberships: [
        membership("nanda-smpit", employeeIds.nanda, "node-smpit", false),
        membership("nanda-sdit", employeeIds.nanda, "node-sdit", true),
      ],
      incumbencies: [
        incumbency("smpit-head", "position-smpit-head", employeeIds.head, "PRIMARY"),
        incumbency("sdit-head", "position-sdit-head", employeeIds.director, "PRIMARY"),
      ],
      authorityBindings: [
        binding("smpit-leader", "NODE", "node-smpit", "LEADER", "position-smpit-head"),
        binding("sdit-leader", "NODE", "node-sdit", "LEADER", "position-sdit-head"),
      ],
    });
    await expect(resolver(structure).resolveDirectManager({
      requesterEmployeeId: employeeIds.nanda,
      effectiveDate: "2026-08-22",
    })).resolves.toMatchObject({ employeeId: employeeIds.director });

    structure.memberships[0] = { ...structure.memberships[0]!, isPrimary: true };
    await expect(resolver(structure).resolveDirectManager({
      requesterEmployeeId: employeeIds.nanda,
      effectiveDate: "2026-08-22",
    })).rejects.toMatchObject({ code: "AMBIGUOUS_MEMBERSHIP" });
  });
  it("uses the explicit primary structural position for requester reporting while retaining rangkap positions", async () => {
    const structure = snapshot({
      positions: [
        position("position-director", "node-root", null),
        position("position-head", "node-team", "position-director"),
        position("position-coordinator", "node-team", "position-director"),
      ],
      incumbencies: [
        { ...incumbency("head", "position-head", employeeIds.head, "PRIMARY"), isPrimaryStructural: true },
        incumbency("coordinator", "position-coordinator", employeeIds.head, "PRIMARY"),
        incumbency("director", "position-director", employeeIds.director, "PRIMARY"),
      ],
    });
    await expect(resolver(structure).resolveDirectManager({ requesterEmployeeId: employeeIds.head, effectiveDate: "2026-08-22" }))
      .resolves.toMatchObject({ employeeId: employeeIds.director, path: ["position-head", "position-director"] });
  });

  it("fails closed when multiple effective structural positions have no explicit primary", async () => {
    const structure = snapshot({
      positions: [position("position-director", "node-root", null), position("position-head", "node-team", "position-director"), position("position-coordinator", "node-team", "position-director")],
      incumbencies: [
        incumbency("head", "position-head", employeeIds.head, "PRIMARY"),
        incumbency("coordinator", "position-coordinator", employeeIds.head, "PRIMARY"),
        incumbency("director", "position-director", employeeIds.director, "PRIMARY"),
      ],
    });
    await expect(resolver(structure).resolveDirectManager({ requesterEmployeeId: employeeIds.head, effectiveDate: "2026-08-22" }))
      .rejects.toMatchObject({ code: "PRIMARY_STRUCTURAL_POSITION_NOT_CONFIGURED" });
  });

  it("resolves one structural team leader for many members", async () => {
    const subject = resolver(snapshot());
    await expect(subject.resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-08-22" }))
      .resolves.toMatchObject({ employeeId: employeeIds.head, source: "DIRECT_MANAGER" });
    await expect(subject.resolveDirectManager({ requesterEmployeeId: employeeIds.staffTwo, effectiveDate: "2026-08-22" }))
      .resolves.toMatchObject({ employeeId: employeeIds.head });
  });

  it("gives an effective employee reporting override precedence", async () => {
    const structure = snapshot({
      reportingOverrides: [{
        id: "override", employeeId: employeeIds.staff,
        managerPositionKey: null, managerEmployeeId: employeeIds.director,
        reason: "Documented exception", effectiveFrom, effectiveTo: null,
      }],
    });
    await expect(resolver(structure).resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-08-22" }))
      .resolves.toMatchObject({ employeeId: employeeIds.director, incumbentKind: "OVERRIDE" });
  });

  it("climbs past one or two vacant positions", async () => {
    const oneVacancy = snapshot({
      incumbencies: [incumbency("director", "position-director", employeeIds.director, "PRIMARY")],
    });
    await expect(resolver(oneVacancy).resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-08-22" }))
      .resolves.toMatchObject({ employeeId: employeeIds.director });

    const twoVacancies = snapshot({
      positions: [
        position("position-director", "node-root", null),
        position("position-affairs", "node-root", "position-director"),
        position("position-head", "node-team", "position-affairs"),
      ],
      incumbencies: [incumbency("director", "position-director", employeeIds.director, "PRIMARY")],
    });
    await expect(resolver(twoVacancies).resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-08-22" }))
      .resolves.toMatchObject({ employeeId: employeeIds.director });
  });

  it("uses an effective acting incumbent and ignores an expired acting period", async () => {
    const structure = snapshot({
      incumbencies: [
        incumbency("acting", "position-head", employeeIds.acting, "ACTING", "2026-05-01", "2026-06-30"),
        incumbency("director", "position-director", employeeIds.director, "PRIMARY"),
      ],
    });
    await expect(resolver(structure).resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-06-01" }))
      .resolves.toMatchObject({ employeeId: employeeIds.acting, incumbentKind: "ACTING" });
    await expect(resolver(structure).resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-07-01" }))
      .resolves.toMatchObject({ employeeId: employeeIds.director });
  });

  it("detects cycles and bounded traversal safely", async () => {
    const structure = snapshot({
      positions: [
        position("position-director", "node-root", "position-head"),
        position("position-head", "node-team", "position-director"),
      ],
      incumbencies: [],
    });
    await expect(resolver(structure).resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-08-22" }))
      .rejects.toMatchObject({ code: "AUTHORITY_CYCLE" });
  });

  it("skips an inactive incumbent only when vacancy climbing permits it", async () => {
    const structure = snapshot();
    await expect(resolver(structure, new Set([employeeIds.head])).resolveDirectManager({
      requesterEmployeeId: employeeIds.staff,
      effectiveDate: "2026-08-22",
    })).resolves.toMatchObject({ employeeId: employeeIds.director });

    structure.positions[1] = { ...structure.positions[1]!, vacancyPolicy: "BLOCK" };
    structure.authorityBindings[0] = { ...structure.authorityBindings[0]!, vacancyPolicy: "BLOCK" };
    await expect(resolver(structure, new Set([employeeIds.head])).resolveDirectManager({
      requesterEmployeeId: employeeIds.staff,
      effectiveDate: "2026-08-22",
    })).rejects.toMatchObject({ code: "AUTHORITY_INELIGIBLE" });
  });

  it("deduplicates a concrete approver while preserving both semantic sources", async () => {
    const structure = snapshot({
      authorityBindings: [
        binding("leader", "NODE", "node-team", "LEADER", "position-director"),
        binding("unit", "NODE", "node-team", "UNIT_APPROVER", "position-director"),
      ],
    });
    const result = await resolver(structure).resolveLineAuthorities({
      requesterEmployeeId: employeeIds.staff,
      effectiveDate: "2026-08-22",
    });
    expect(result.authorities).toHaveLength(1);
    expect(result.authorities[0]).toMatchObject({
      employeeId: employeeIds.director,
      source: "DIRECT_MANAGER",
      sources: ["DIRECT_MANAGER", "UNIT_APPROVER"],
    });
  });

  it("never uses node or position visual offsets in resolution", async () => {
    const normal = snapshot();
    const offset = snapshot({
      nodes: [node("node-root", null, 0), node("node-team", "node-root", 2)],
      positions: [
        position("position-director", "node-root", null, 4),
        position("position-head", "node-team", "position-director", 3),
      ],
    });
    const input = { requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-08-22" };
    const first = await resolver(normal).resolveLineAuthorities(input);
    const second = await resolver(offset).resolveLineAuthorities(input);
    expect(second.authorities).toEqual(first.authorities);
  });

  it("resolves historical incumbents and does not activate a future snapshot early", async () => {
    const historical = snapshot({
      incumbencies: [
        incumbency("old", "position-head", employeeIds.head, "PRIMARY"),
        incumbency("director", "position-director", employeeIds.director, "PRIMARY"),
      ],
    }, "historical");
    const future = snapshot({
      incumbencies: [
        incumbency("new", "position-head", employeeIds.acting, "PRIMARY"),
        incumbency("director", "position-director", employeeIds.director, "PRIMARY"),
      ],
    }, "future");
    const subject = new OrganizationAuthorityResolver(
      { loadEffectiveSnapshot: async (date) => date < "2027-01-01" ? historical : future },
      { eligibilityValidator: { validate: async () => ({ eligible: true, reason: null }) } },
    );
    await expect(subject.resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2026-12-31" }))
      .resolves.toMatchObject({ employeeId: employeeIds.head });
    await expect(subject.resolveDirectManager({ requesterEmployeeId: employeeIds.staff, effectiveDate: "2027-01-01" }))
      .resolves.toMatchObject({ employeeId: employeeIds.acting });
  });

  it("uses governance and oversight bindings without title checks", async () => {
    const structure = snapshot({
      positions: [
        position("position-director", "node-root", null),
        position("position-secretary", "node-root", null),
        position("position-chair", "node-root", null),
      ],
      memberships: [membership("director-membership", employeeIds.director)],
      incumbencies: [
        incumbency("director", "position-director", employeeIds.director, "PRIMARY"),
        incumbency("secretary", "position-secretary", employeeIds.secretary, "PRIMARY"),
        incumbency("chair", "position-chair", employeeIds.chair, "PRIMARY"),
      ],
      authorityBindings: [
        binding("governance", "POSITION", "position-director", "GOVERNANCE_APPROVER", "position-secretary"),
        binding("oversight", "POSITION", "position-secretary", "OVERSIGHT_PARENT", "position-chair"),
      ],
    });
    const subject = resolver(structure);
    const line = await subject.resolveLineAuthorities({
      requesterEmployeeId: employeeIds.director,
      effectiveDate: "2026-08-22",
    });
    expect(line.governanceApplied).toBe(true);
    expect(line.authorities).toEqual([
      expect.objectContaining({ employeeId: employeeIds.secretary, source: "GOVERNANCE_APPROVER" }),
    ]);
    await expect(subject.resolveOversightAbove({
      approverEmployeeId: employeeIds.secretary,
      effectiveDate: "2026-08-22",
    })).resolves.toMatchObject({ employeeId: employeeIds.chair, source: "OVERSIGHT_PARENT" });
  });

  it("resolves account-held Secretary and Chair only for governance semantics", async () => {
    const structure = snapshot({
      positions: [
        position("position-director", "node-root", null),
        { ...position("position-secretary", "node-root", null), holderSource: "ACCOUNT" as const },
        { ...position("position-chair", "node-root", null), holderSource: "ACCOUNT" as const },
      ],
      memberships: [membership("director-membership", employeeIds.director)],
      incumbencies: [
        incumbency("director", "position-director", employeeIds.director, "PRIMARY"),
        { ...incumbency("secretary", "position-secretary", employeeIds.secretary, "PRIMARY"), employeeId: null, accountId: "secretary-account" },
        { ...incumbency("chair", "position-chair", employeeIds.chair, "PRIMARY"), employeeId: null, accountId: "chair-account" },
      ],
      authorityBindings: [
        binding("governance", "POSITION", "position-director", "GOVERNANCE_APPROVER", "position-secretary"),
        binding("oversight", "POSITION", "position-secretary", "OVERSIGHT_PARENT", "position-chair"),
      ],
    });
    const subject = new OrganizationAuthorityResolver(
      { loadEffectiveSnapshot: async () => structure },
      {
        eligibilityValidator: { validate: async () => ({ eligible: true, reason: null }) },
        actionabilityValidator: {
          validateEmployeeAuthority: async () => ({ eligible: true, reason: null }),
          validateAccountAuthority: async () => ({ eligible: true, reason: null }),
        },
      },
    );
    await expect(subject.resolveGovernanceApprover({
      requesterEmployeeId: employeeIds.director, effectiveDate: "2026-08-22",
    })).resolves.toMatchObject({ principalType: "ACCOUNT", accountId: "secretary-account", employeeId: null });
    await expect(subject.resolveOversightAbove({
      approverAccountId: "secretary-account", effectiveDate: "2026-08-22",
    })).resolves.toMatchObject({ principalType: "ACCOUNT", accountId: "chair-account", source: "OVERSIGHT_PARENT" });
  });

  it("rejects self resolution", async () => {
    const structure = snapshot({
      reportingOverrides: [{
        id: "invalid-self-override", employeeId: employeeIds.staff,
        managerPositionKey: null, managerEmployeeId: employeeIds.staff,
        reason: "Invalid synthetic override", effectiveFrom, effectiveTo: null,
      }],
    });
    await expect(resolver(structure).resolveDirectManager({
      requesterEmployeeId: employeeIds.staff,
      effectiveDate: "2026-08-22",
    })).rejects.toBeInstanceOf(OrganizationResolutionError);
  });

  it("uses Asia/Jakarta when deriving the business date", () => {
    expect(jakartaBusinessDate(new Date("2026-08-21T17:00:00.000Z"))).toBe("2026-08-22");
  });
});

describe("Organization direct approval service", () => {
  function organizationAuthority(structure = snapshot()) {
    return new OrganizationRolloutService(resolver(structure));
  }
  const input = {
    workflowKey: "leave.annual",
    requesterEmployeeId: employeeIds.staff,
    effectiveDate: "2026-08-22",
  };

  it("uses the published structure authoritatively and fails closed without configuration", async () => {
    const result = await organizationAuthority().resolveAuthorities(input);
    expect(result.authoritativeSource).toBe("STRUCTURE");
    expect(result.authorities[0]?.employeeId).toBe(employeeIds.head);

    const missing = snapshot({ authorityBindings: [] });
    await expect(organizationAuthority(missing).resolveAuthorities(input))
      .rejects.toMatchObject({ code: "AUTHORITY_NOT_CONFIGURED" });
  });

  it("allows UNIT_ONLY workflows without a Direct Manager", async () => {
    const structure = snapshot({
      authorityBindings: [binding("unit", "NODE", "node-team", "UNIT_APPROVER", "position-director")],
    });
    const result = await organizationAuthority(structure).resolveAuthorities({
      ...input,
      authorityRequirement: "UNIT_ONLY",
    });
    expect(result.authorities).toEqual([
      expect.objectContaining({ employeeId: employeeIds.director, source: "UNIT_APPROVER" }),
    ]);
  });

  it.each([
    ["invited account", { eligible: false, reason: "ACCOUNT_NOT_ACTIVE" } as const, "AUTHORITY_ACCOUNT_NOT_ACTIVE"],
    ["missing account", { eligible: false, reason: "ACCOUNT_MISSING" } as const, "AUTHORITY_ACCOUNT_MISSING"],
    ["missing capability", { eligible: false, reason: "CAPABILITY_MISSING" } as const, "AUTHORITY_CAPABILITY_MISSING"],
  ])("does not substitute the parent when the selected manager has %s", async (_label, failure, code) => {
    await expect(resolverWithActionability(snapshot(), failure).resolveDirectManager({
      requesterEmployeeId: employeeIds.staff,
      effectiveDate: "2026-08-22",
    })).rejects.toMatchObject({
      code,
      details: { employeeId: employeeIds.head, positionKey: "position-head" },
    });
  });

  it("fails closed when an ACCOUNT-only governance holder is used as an actionable authority", async () => {
    const structure = snapshot();
    structure.positions = structure.positions.map((item) => item.stableKey === "position-head"
      ? { ...item, holderSource: "ACCOUNT" as const }
      : item);
    structure.incumbencies = structure.incumbencies.map((item) => item.positionKey === "position-head"
      ? { ...item, employeeId: null, accountId: "foundation-board-account" }
      : item);

    await expect(resolver(structure).resolveDirectManager({
      requesterEmployeeId: employeeIds.staff,
      effectiveDate: "2026-08-22",
      requiredCapability: "leave.approve",
    })).rejects.toMatchObject({ code: "INVALID_AUTHORITY_PRINCIPAL" });
  });

});

describe("ORG-004 draft validation and impact", () => {
  it("deletes a draft subtree and every dependent reference without orphan stable keys", () => {
    const draft = snapshot({
      nodes: [node("node-root", null, 0), node("node-team", "node-root", 0), node("node-child", "node-team", 0)],
      positions: [
        position("position-director", "node-root", null),
        position("position-head", "node-team", "position-director"),
        position("position-child", "node-child", "position-head"),
      ],
      reportingOverrides: [{
        id: "override", employeeId: employeeIds.staffTwo, managerPositionKey: "position-head",
        managerEmployeeId: null, reason: "Synthetic dependency", effectiveFrom, effectiveTo: null,
      }],
    });
    const selectedId = draft.nodes.find((item) => item.stableKey === "node-team")!.id;

    const deleted = deleteOrganizationSubtree(draft, selectedId);

    expect(deleted?.counts).toMatchObject({ childGroups: 1, positions: 2, memberships: 2, incumbencies: 1, reportingOverrides: 1 });
    expect(draft.nodes.map((item) => item.stableKey)).toEqual(["node-root"]);
    expect(draft.positions.map((item) => item.stableKey)).toEqual(["position-director"]);
    expect(draft.memberships).toEqual([]);
    expect(draft.authorityBindings).toEqual([]);
    expect(draft.reportingOverrides).toEqual([]);
  });

  it("separates active structural employment from login eligibility", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT (status = 'active' AND removed_at IS NULL)")) {
        return { rows: [{ employeeActive: true }], rowCount: 1 };
      }
      if (sql.includes("(e.status = 'active' AND e.removed_at IS NULL)")) {
        return {
          rows: [{ employeeActive: true, accountActive: false, capabilityValid: false }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected eligibility SQL: ${sql}`);
    });
    const repository = new PostgresOrganizationRepository({ query } as never);

    await expect(repository.validateStructuralIncumbent(employeeIds.head))
      .resolves.toEqual({ eligible: true, reason: null });
    await expect(repository.validate(employeeIds.head, {
      effectiveDate: "2026-08-22",
      requiredCapability: "leave.approve",
    })).resolves.toEqual({ eligible: false, reason: "ACCOUNT_MISSING" });
  });

  it("allows an active employee without a login account to be published as an incumbent", async () => {
    const draft = snapshot();
    draft.changeSet.status = "DRAFT";
    draft.changeSet.validatedAt = null;
    draft.changeSet.publishedAt = null;
    const fakeRepository = {
      loadChangeSetSnapshotForUpdate: async () => draft,
      validateStructuralIncumbent: async () => ({ eligible: true, reason: null }),
      markValidated: async (_id: string, _actor: string, report: { valid: boolean }) => {
        draft.changeSet.status = report.valid ? "VALIDATED" : "DRAFT";
        draft.changeSet.validationReport = { valid: report.valid, issues: [] };
      },
      publishValidated: async () => {
        draft.changeSet.status = "PUBLISHED";
      },
    } as unknown as PostgresOrganizationRepository;
    const service = new OrganizationDraftService(fakeRepository);

    await expect(service.validateDraft(draft.changeSet.id, "admin"))
      .resolves.toMatchObject({ valid: true });
    await expect(service.publish(draft.changeSet.id, "admin")).resolves.toBeUndefined();
    expect(draft.changeSet.status).toBe("PUBLISHED");
  });

  it("treats a removed employee as inactive for authority and structural eligibility", async () => {
    const query=vi.fn(async(sql:string)=> sql.includes("SELECT (status = 'active' AND removed_at IS NULL)")
      ? {rows:[{employeeActive:false}],rowCount:1}
      : {rows:[{employeeActive:false,accountActive:true,capabilityValid:true}],rowCount:1});
    const repository=new PostgresOrganizationRepository({query} as never);
    await expect(repository.validateStructuralIncumbent(employeeIds.head)).resolves.toEqual({eligible:false,reason:"EMPLOYEE_NOT_ACTIVE"});
    await expect(repository.validate(employeeIds.head,{effectiveDate:"2026-08-22"})).resolves.toEqual({eligible:false,reason:"EMPLOYEE_NOT_ACTIVE"});
  });

  it("reopens the same validated revision without changing its snapshot, then validates it again", async () => {
    const draft = snapshot({
      reportingOverrides: [{
        id: "override-staff", employeeId: employeeIds.staff, managerPositionKey: "position-head",
        managerEmployeeId: null, reason: "Synthetic exception", effectiveFrom, effectiveTo: null,
      }],
    });
    draft.changeSet.status = "VALIDATED";
    draft.changeSet.publishedAt = null;
    draft.changeSet.validationReport = { valid: true, issues: [], checkedAt: "2026-08-25T00:00:00.000Z" };
    const snapshotRows = structuredClone({
      nodes: draft.nodes, positions: draft.positions, memberships: draft.memberships,
      incumbencies: draft.incumbencies, authorityBindings: draft.authorityBindings,
      reportingOverrides: draft.reportingOverrides,
    });
    let reopenCalls = 0;
    const fakeRepository = {
      loadChangeSetSnapshotForUpdate: async () => draft,
      reopenValidated: async () => {
        reopenCalls += 1;
        draft.changeSet.status = "DRAFT";
        draft.changeSet.validatedAt = null;
        draft.changeSet.validationReport = { valid: false, issues: [] };
      },
      validateStructuralIncumbent: async () => ({ eligible: true, reason: null }),
      markValidated: async (_id: string, _actor: string, report: OrganizationSnapshot["changeSet"]["validationReport"]) => {
        draft.changeSet.status = report.valid ? "VALIDATED" : "DRAFT";
        draft.changeSet.validationReport = report;
      },
    } as unknown as PostgresOrganizationRepository;
    const service = new OrganizationDraftService(fakeRepository);

    await expect(service.reopenForCorrection(draft.changeSet.id)).resolves.toBeUndefined();
    expect(reopenCalls).toBe(1);
    expect(draft.changeSet).toMatchObject({ status: "DRAFT", validatedAt: null, validationReport: { valid: false, issues: [] } });
    expect({ nodes: draft.nodes, positions: draft.positions, memberships: draft.memberships,
      incumbencies: draft.incumbencies, authorityBindings: draft.authorityBindings,
      reportingOverrides: draft.reportingOverrides }).toEqual(snapshotRows);

    await expect(service.validateDraft(draft.changeSet.id, "admin")).resolves.toMatchObject({ valid: true });
    expect(draft.changeSet.status).toBe("VALIDATED");
  });

  it("rejects reopening a published revision", async () => {
    const published = snapshot();
    const fakeRepository = {
      loadChangeSetSnapshotForUpdate: async () => published,
      reopenValidated: vi.fn(),
    } as unknown as PostgresOrganizationRepository;

    await expect(new OrganizationDraftService(fakeRepository).reopenForCorrection(published.changeSet.id))
      .rejects.toMatchObject({ code: "CHANGE_SET_NOT_VALIDATED" });
    expect(fakeRepository.reopenValidated).not.toHaveBeenCalled();
  });

  it("fails closed when a structural Leave approver has no eligible account", async () => {
    const structure = snapshot();
    structure.positions[1] = { ...structure.positions[1]!, vacancyPolicy: "BLOCK" };
    structure.authorityBindings[0] = {
      ...structure.authorityBindings[0]!,
      vacancyPolicy: "BLOCK",
    };
    let accountReady = false;
    const subject = new OrganizationRolloutService(
      new OrganizationAuthorityResolver(
        { loadEffectiveSnapshot: async () => structure },
        {
          eligibilityValidator: {
            validate: async () => accountReady
              ? { eligible: true, reason: null }
              : { eligible: false, reason: "ACCOUNT_NOT_ACTIVE" },
          },
        },
      ),
    );
    const input = {
      workflowKey: "leave.annual",
      requesterEmployeeId: employeeIds.staff,
      effectiveDate: "2026-08-22",
      requiredCapability: "leave.approve",
    };

    await expect(subject.resolveAuthorities(input)).rejects.toMatchObject({
      code: "AUTHORITY_INELIGIBLE",
      details: expect.objectContaining({ lastIneligibility: "ACCOUNT_NOT_ACTIVE" }),
    });
    accountReady = true;
    await expect(subject.resolveAuthorities(input)).resolves.toMatchObject({
      authoritativeSource: "STRUCTURE",
      authorities: expect.arrayContaining([
        expect.objectContaining({ employeeId: employeeIds.head }),
      ]),
    });
  });

  it("keeps an inactive employee invalid as an active incumbent", async () => {
    const draft = snapshot();
    draft.changeSet.status = "DRAFT";
    draft.changeSet.validatedAt = null;
    draft.changeSet.publishedAt = null;
    const fakeRepository = {
      loadChangeSetSnapshotForUpdate: async () => draft,
      validateStructuralIncumbent: async (employeeId: string) => employeeId === employeeIds.head
        ? { eligible: false, reason: "EMPLOYEE_NOT_ACTIVE" }
        : { eligible: true, reason: null },
      markValidated: async () => undefined,
    } as unknown as PostgresOrganizationRepository;

    const report = await new OrganizationDraftService(fakeRepository)
      .validateDraft(draft.changeSet.id, "admin");
    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "INACTIVE_INCUMBENT",
      entityId: "incumbency-head",
    }));
  });

  it("rejects overlapping primary incumbencies during draft validation", async () => {
    const draft = snapshot({
      incumbencies: [
        incumbency("first", "position-head", employeeIds.head, "PRIMARY", "2026-01-01", "2026-12-31"),
        incumbency("second", "position-head", employeeIds.acting, "PRIMARY", "2026-06-01", null),
        incumbency("director", "position-director", employeeIds.director, "PRIMARY"),
      ],
    });
    draft.changeSet.status = "DRAFT";
    draft.changeSet.validatedAt = null;
    draft.changeSet.publishedAt = null;
    let persistedValid: boolean | null = null;
    const fakeRepository = {
      loadChangeSetSnapshotForUpdate: async () => draft,
      validateStructuralIncumbent: async () => ({ eligible: true, reason: null }),
      markValidated: async (_id: string, _actor: string, report: { valid: boolean }) => {
        persistedValid = report.valid;
      },
    } as unknown as PostgresOrganizationRepository;
    const report = await new OrganizationDraftService(fakeRepository).validateDraft(draft.changeSet.id, "admin");
    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PRIMARY_INCUMBENCY_OVERLAP" }));
    expect(persistedValid).toBe(false);
  });

  it("reports a pure visual-offset edit as having no routing impact", async () => {
    const before = snapshot({}, "base");
    const draft = snapshot({
      nodes: [node("node-root", null, 0), node("node-team", "node-root", 2)],
      positions: [
        position("position-director", "node-root", null, 1),
        position("position-head", "node-team", "position-director", 3),
      ],
    }, "draft");
    draft.changeSet.status = "DRAFT";
    draft.changeSet.baseChangeSetId = before.changeSet.id;
    draft.changeSet.validatedAt = null;
    draft.changeSet.publishedAt = null;
    const fakeRepository = {
      loadChangeSetSnapshot: async (id: string) => id === draft.changeSet.id ? draft : before,
      validate: async () => ({ eligible: true, reason: null }),
      validateStructuralIncumbent: async () => ({ eligible: true, reason: null }),
    } as unknown as PostgresOrganizationRepository;
    const impact = await new OrganizationDraftService(fakeRepository).previewImpact(draft.changeSet.id);
    expect(impact.visualOnly).toBe(true);
    expect(impact.routingImpact).toBe(false);
    expect(impact.directManagerChanges).toEqual([]);
    expect(impact.unitApproverChanges).toEqual([]);
  });
});
