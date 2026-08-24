import { describe, expect, it } from "vitest";

import {
  buildMembershipDeltas,
  defaultMembershipIsPrimary,
} from "@/lib/organizationMembershipEditor";
import type { OrganizationMembership } from "@/lib/organizationDesigner";

const nodeA = "00000000-0000-4000-8000-000000000001";
const nodeB = "00000000-0000-4000-8000-000000000002";

function membership(
  employeeId: string,
  nodeKey: string,
  isPrimary: boolean,
): OrganizationMembership {
  return {
    employeeId,
    nodeKey,
    isPrimary,
    effectiveFrom: "2027-01-01",
    effectiveTo: null,
  };
}

describe("Organization member delta model", () => {
  it("handles a 50-employee candidate list and leaves 20 unchanged members out of review", () => {
    const current = Array.from({ length: 20 }, (_, index) =>
      membership(`employee-${index + 1}`, nodeA, index === 0),
    );
    const selected = new Set(current.map((item) => item.employeeId));

    expect(Array.from({ length: 50 })).toHaveLength(50);
    expect(buildMembershipDeltas({
      nodeKey: nodeA,
      memberships: current,
      selectedEmployeeIds: selected,
      primaryByEmployeeId: new Map(),
    })).toEqual([]);
  });

  it("defaults a first membership to primary and an additional unit to secondary", () => {
    expect(defaultMembershipIsPrimary([], nodeA, "ordinary")).toBe(true);
    expect(defaultMembershipIsPrimary([
      membership("nanda", nodeB, true),
    ], nodeA, "nanda")).toBe(false);
  });

  it("counts one semantic delta per changed employee", () => {
    const memberships = [
      membership("existing-secondary", nodeA, false),
      membership("removed", nodeA, false),
      membership("nanda", nodeB, true),
    ];
    const deltas = buildMembershipDeltas({
      nodeKey: nodeA,
      memberships,
      selectedEmployeeIds: new Set(["existing-secondary", "nanda", "ordinary"]),
      primaryByEmployeeId: new Map([
        ["existing-secondary", true],
        ["nanda", false],
        ["ordinary", true],
      ]),
    });

    expect(deltas.map((delta) => [delta.employeeId, delta.kind])).toEqual([
      ["existing-secondary", "CHANGED"],
      ["nanda", "ADDED"],
      ["ordinary", "ADDED"],
      ["removed", "REMOVED"],
    ]);
    expect(deltas).toHaveLength(4);
  });

  it("requires explicit confirmation for a primary switch and blocks removing the last primary", () => {
    const memberships = [
      membership("nanda", nodeB, true),
      membership("only-primary", nodeA, true),
    ];
    const deltas = buildMembershipDeltas({
      nodeKey: nodeA,
      memberships,
      selectedEmployeeIds: new Set(["nanda"]),
      primaryByEmployeeId: new Map([["nanda", true]]),
    });

    expect(deltas.find((delta) => delta.employeeId === "nanda")).toMatchObject({
      kind: "ADDED",
      requiresPrimarySwitchConfirmation: true,
    });
    expect(deltas.find((delta) => delta.employeeId === "only-primary")).toMatchObject({
      kind: "REMOVED",
      blocksLastPrimaryRemoval: true,
    });
  });

  it("preserves unrelated memberships when building the selected-node payload", () => {
    const memberships = [
      membership("nanda", nodeB, true),
      membership("nanda", nodeA, false),
    ];
    const deltas = buildMembershipDeltas({
      nodeKey: nodeA,
      memberships,
      selectedEmployeeIds: new Set(["nanda"]),
      primaryByEmployeeId: new Map([["nanda", false]]),
    });

    expect(deltas).toEqual([]);
    expect(memberships.find((item) => item.nodeKey === nodeB)?.isPrimary).toBe(true);
  });
});
