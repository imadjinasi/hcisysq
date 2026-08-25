import { describe, expect, it } from "vitest";

import {
  OrganizationAuthorityResolver,
  type OrganizationSnapshot,
} from "../src/modules/organization/index.js";

const effectiveDate = "2026-08-25";

function organizationMatrix() {
  const nodes: OrganizationSnapshot["nodes"] = [];
  const positions: OrganizationSnapshot["positions"] = [];
  const memberships: OrganizationSnapshot["memberships"] = [];
  const incumbencies: OrganizationSnapshot["incumbencies"] = [];
  const authorityBindings: OrganizationSnapshot["authorityBindings"] = [];

  const addNode = (key: string, parent: string | null = "root") => nodes.push({
    id: `row-${key}`, stableKey: key, name: key, nodeType: "TEAM", parentNodeKey: parent,
    active: true, effectiveFrom: effectiveDate, effectiveTo: null, visualRankOffset: 0,
    integrationCode: null,
  });
  const addPosition = (
    key: string,
    nodeKey: string,
    employeeId: string | null,
    parentPositionKey: string | null,
    kind: "PRIMARY" | "ACTING" = "PRIMARY",
    isPrimaryStructural = false,
  ) => {
    positions.push({ id: `row-${key}`, stableKey: key, nodeKey, title: key,
      parentPositionKey, singleIncumbent: true, vacancyPolicy: "CLIMB_TO_PARENT",
      active: true, effectiveFrom: effectiveDate, effectiveTo: null, visualRankOffset: 0 });
    if (employeeId) incumbencies.push({ id: `inc-${key}`, positionKey: key, employeeId,
      kind, isPrimaryStructural, reason: kind === "ACTING" ? "Synthetic acting mandate" : null,
      effectiveFrom: effectiveDate, effectiveTo: null });
  };
  const addTeam = (key: string, managerPosition: string, unitPosition?: string) => {
    addNode(key);
    const employeeId = `employee-${key}`;
    memberships.push({ id: `membership-${key}`, employeeId, nodeKey: key,
      jobProfileKey: null, isPrimary: true, effectiveFrom: effectiveDate, effectiveTo: null });
    authorityBindings.push({ id: `leader-${key}`, subjectKind: "NODE", subjectKey: key,
      bindingType: "LEADER", targetPositionKey: managerPosition, vacancyPolicy: "CLIMB_TO_PARENT",
      effectiveFrom: effectiveDate, effectiveTo: null });
    if (unitPosition) authorityBindings.push({ id: `unit-${key}`, subjectKind: "NODE", subjectKey: key,
      bindingType: "UNIT_APPROVER", targetPositionKey: unitPosition, vacancyPolicy: "CLIMB_TO_PARENT",
      effectiveFrom: effectiveDate, effectiveTo: null });
    return employeeId;
  };

  addNode("root", null);
  addNode("education");
  addNode("sdit");
  addNode("smpit");
  addNode("pesantren");
  addNode("operations");
  addPosition("director", "root", "authority-director", null, "PRIMARY", true);
  addPosition("education-head", "education", "authority-education", "director", "PRIMARY", true);
  addPosition("sdit-head", "sdit", "authority-sdit", "education-head", "PRIMARY", true);
  addPosition("smpit-head", "smpit", "authority-zaky", "mudir", "PRIMARY", false);
  addPosition("mudir", "pesantren", "authority-zaky", "director", "PRIMARY", true);
  addPosition("operations-head", "operations", null, "director");
  addPosition("ga-head", "operations", "authority-ga", "operations-head", "PRIMARY", true);

  const cases: Array<[string, string, string]> = [];
  const ordinary = (key: string, manager: string, unit: string) => {
    const employee = addTeam(key, manager, unit);
    cases.push([employee, manager, unit]);
  };
  const namedPosition = (key: string, nodeKey: string, parent: string, kind: "PRIMARY" | "ACTING" = "PRIMARY") =>
    addPosition(`${key}-position`, nodeKey, `${key}-authority`, parent, kind, true);

  namedPosition("sdit-curriculum", "sdit", "sdit-head");
  namedPosition("sdit-diniyyah", "sdit", "sdit-head");
  namedPosition("sdit-student", "sdit", "sdit-head");
  namedPosition("sdit-tahfizh", "sdit", "sdit-head");
  namedPosition("sdit-akhwat-coordinator", "sdit", "sdit-tahfizh-position");
  namedPosition("smpit-curriculum", "smpit", "smpit-head");
  namedPosition("smpit-student", "smpit", "smpit-head");
  namedPosition("pkbm-head", "pesantren", "mudir");
  namedPosition("kesantrian-head", "pesantren", "mudir");
  namedPosition("pesantren-tahfizh", "pesantren", "mudir");
  namedPosition("taman-head", "education", "education-head");
  namedPosition("hcm-head", "operations", "operations-head");
  namedPosition("dapur-coordinator", "operations", "ga-head");
  namedPosition("markom-head", "operations", "operations-head", "ACTING");

  ordinary("sdit-curriculum-team", "sdit-curriculum-position", "sdit-head");
  ordinary("sdit-diniyyah-team", "sdit-diniyyah-position", "sdit-head");
  ordinary("sdit-student-team", "sdit-student-position", "sdit-head");
  ordinary("sdit-tahfizh-ikhwan-team", "sdit-tahfizh-position", "sdit-head");
  ordinary("sdit-tahfizh-akhwat-team", "sdit-akhwat-coordinator-position", "sdit-head");
  ordinary("smpit-curriculum-team", "smpit-curriculum-position", "smpit-head");
  ordinary("smpit-student-team", "smpit-student-position", "smpit-head");
  const pkbm = addTeam("pkbm-team", "pkbm-head-position");
  const kesantrian = addTeam("kesantrian-team", "kesantrian-head-position");
  const pesantrenTahfizh = addTeam("pesantren-tahfizh-team", "pesantren-tahfizh-position");
  ordinary("taman-team", "taman-head-position", "education-head");
  ordinary("hcm-team", "hcm-head-position", "operations-head");
  ordinary("ga-team", "ga-head", "operations-head");
  ordinary("dapur-team", "dapur-coordinator-position", "ga-head");
  ordinary("markom-team", "markom-head-position", "operations-head");

  const snapshot: OrganizationSnapshot = {
    changeSet: { id: "matrix", name: "Synthetic authority matrix", effectiveOn: effectiveDate,
      status: "VALIDATED", baseChangeSetId: null, validationReport: { valid: true, issues: [] },
      createdByAccountId: "admin", createdAt: `${effectiveDate}T00:00:00.000Z`,
      validatedAt: `${effectiveDate}T00:00:00.000Z`, publishedAt: null },
    nodes, positions, memberships, incumbencies, authorityBindings,
    jobProfiles: [], reportingOverrides: [],
  };
  return { snapshot, cases, intentionallyUnresolved: [pkbm, kesantrian, pesantrenTahfizh] };
}

function resolver(snapshot: OrganizationSnapshot) {
  return new OrganizationAuthorityResolver(
    { loadEffectiveSnapshot: async () => snapshot },
    { eligibilityValidator: { validate: async () => ({ eligible: true, reason: null }) } },
  );
}

describe("ORG-007 representative structural matrix", () => {
  it("resolves every confirmed ordinary Leave route without inventing a third step", async () => {
    const matrix = organizationMatrix();
    const incumbentFor = (positionKey: string): string | null => {
      const incumbent = matrix.snapshot.incumbencies.find((item) => item.positionKey === positionKey);
      if (incumbent?.employeeId) return incumbent.employeeId;
      const parent = matrix.snapshot.positions.find((item) => item.stableKey === positionKey)?.parentPositionKey;
      return parent ? incumbentFor(parent) : null;
    };
    for (const [employeeId, expectedManagerPosition, expectedUnitPosition] of matrix.cases) {
      const result = await resolver(matrix.snapshot).resolveLineAuthorities({
        requesterEmployeeId: employeeId,
        effectiveDate,
      });
      expect(result.authorities.map((item) => item.employeeId), employeeId).toEqual([
        incumbentFor(expectedManagerPosition),
        incumbentFor(expectedUnitPosition),
      ]);
      expect(result.authorities, employeeId).toHaveLength(2);
    }
  });

  it("keeps Pesantren Unit Approver intentionally unresolved while preserving its direct manager", async () => {
    const matrix = organizationMatrix();
    for (const employeeId of matrix.intentionallyUnresolved) {
      await expect(resolver(matrix.snapshot).resolveDirectManager({ requesterEmployeeId: employeeId, effectiveDate }))
        .resolves.toMatchObject({ source: "DIRECT_MANAGER" });
      await expect(resolver(matrix.snapshot).resolveUnitApprover({ requesterEmployeeId: employeeId, effectiveDate }))
        .rejects.toMatchObject({ code: "AUTHORITY_NOT_CONFIGURED" });
    }
  });

  it("uses Zaky's explicit Mudir primary while retaining Kepala SMPIT as secondary", async () => {
    const matrix = organizationMatrix();
    await expect(resolver(matrix.snapshot).resolveDirectManager({
      requesterEmployeeId: "authority-zaky",
      effectiveDate,
    })).resolves.toMatchObject({
      employeeId: "authority-director",
      path: ["mudir", "director"],
    });
  });

  it("deduplicates vacancy fallback and removes self approval", async () => {
    const matrix = organizationMatrix();
    const hcm = await resolver(matrix.snapshot).resolveLineAuthorities({
      requesterEmployeeId: "employee-hcm-team",
      effectiveDate,
    });
    expect(hcm.authorities.map((item) => item.employeeId)).toEqual([
      "hcm-head-authority", "authority-director",
    ]);

    matrix.snapshot.authorityBindings.push({ id: "self-unit", subjectKind: "NODE",
      subjectKey: "smpit", bindingType: "UNIT_APPROVER", targetPositionKey: "smpit-head",
      vacancyPolicy: "CLIMB_TO_PARENT", effectiveFrom: effectiveDate, effectiveTo: null });
    matrix.snapshot.memberships.push({ id: "zaky-membership", employeeId: "authority-zaky",
      nodeKey: "smpit", jobProfileKey: null, isPrimary: true, effectiveFrom: effectiveDate, effectiveTo: null });
    const zaky = await resolver(matrix.snapshot).resolveLineAuthorities({
      requesterEmployeeId: "authority-zaky", effectiveDate,
    });
    expect(zaky.authorities.map((item) => item.employeeId)).toEqual(["authority-director"]);
  });
});
