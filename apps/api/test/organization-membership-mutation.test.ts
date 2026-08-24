import { describe, expect, it } from "vitest";

import { primaryMembershipRemovalsWithoutReplacement } from "../src/modules/organization/admin-routes.js";

const period = { effectiveFrom: "2027-01-01", effectiveTo: null };

function membership(employeeId: string, nodeKey: string, isPrimary: boolean) {
  return { employeeId, nodeKey, isPrimary, ...period };
}

describe("Organization membership mutation safety", () => {
  it("rejects removal or demotion of the last effective primary membership", () => {
    const memberships = [membership("employee-1", "node-a", true)];

    expect(primaryMembershipRemovalsWithoutReplacement({
      memberships,
      nodeKey: "node-a",
      submitted: new Map(),
      period,
    })).toEqual(["employee-1"]);
    expect(primaryMembershipRemovalsWithoutReplacement({
      memberships,
      nodeKey: "node-a",
      submitted: new Map([["employee-1", { isPrimary: false }]]),
      period,
    })).toEqual(["employee-1"]);
  });

  it("allows secondary removal after an explicit primary switch has demoted the old unit", () => {
    const memberships = [
      membership("employee-1", "node-a", false),
      membership("employee-1", "node-b", true),
      membership("employee-2", "node-a", false),
    ];

    expect(primaryMembershipRemovalsWithoutReplacement({
      memberships,
      nodeKey: "node-a",
      submitted: new Map(),
      period,
    })).toEqual([]);
  });
});
