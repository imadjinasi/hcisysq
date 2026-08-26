import { describe, expect, it } from "vitest";

import {
  assertAssignmentDates,
  assertAssignmentScope,
  assertManagerAssignment,
  assertPrincipalRoleCompatibility,
  OrgAccessPolicyError,
} from "../src/modules/employees/org-access-policy.js";

describe("organization access policy", () => {
  it("forbids self reporting", () => {
    expect(() => assertManagerAssignment("employee-1", "employee-1")).toThrowError(
      OrgAccessPolicyError,
    );
    expect(() => assertManagerAssignment("employee-1", "employee-2")).not.toThrow();
    expect(() => assertManagerAssignment("employee-1", null)).not.toThrow();
  });

  it("requires an organization unit only for unit scope", () => {
    expect(() => assertAssignmentScope("unit", null)).toThrowError(OrgAccessPolicyError);
    expect(() => assertAssignmentScope("unit", "unit-1")).not.toThrow();
    expect(() => assertAssignmentScope("organization", null)).not.toThrow();
    expect(() => assertAssignmentScope("organization", "unit-1")).toThrowError(
      OrgAccessPolicyError,
    );
  });

  it("rejects inverted temporary assignment dates", () => {
    expect(() => assertAssignmentDates("2026-08-20", "2026-08-19")).toThrowError(
      OrgAccessPolicyError,
    );
    expect(() => assertAssignmentDates("2026-08-20", "2026-08-20")).not.toThrow();
    expect(() => assertAssignmentDates(null, null)).not.toThrow();
  });

  it("allows only the organization-wide governance role for Foundation Board", () => {
    expect(() => assertPrincipalRoleCompatibility({
      principalType: "FOUNDATION_BOARD",
      roleKey: "governance_leave_approver",
      scopeType: "organization",
    })).not.toThrow();

    expect(() => assertPrincipalRoleCompatibility({
      principalType: "FOUNDATION_BOARD",
      roleKey: "human_capital",
      scopeType: "organization",
    })).toThrowError(expect.objectContaining({ code: "FOUNDATION_BOARD_ROLE_FORBIDDEN" }));

    expect(() => assertPrincipalRoleCompatibility({
      principalType: "FOUNDATION_BOARD",
      roleKey: "governance_leave_approver",
      scopeType: "unit",
    })).toThrowError(expect.objectContaining({ code: "GOVERNANCE_ROLE_REQUIRES_ORGANIZATION_SCOPE" }));
  });

  it("rejects the governance role for Employee and protects Super Admin", () => {
    expect(() => assertPrincipalRoleCompatibility({
      principalType: "EMPLOYEE",
      roleKey: "governance_leave_approver",
      scopeType: "organization",
    })).toThrowError(expect.objectContaining({ code: "GOVERNANCE_ROLE_FOUNDATION_BOARD_ONLY" }));

    expect(() => assertPrincipalRoleCompatibility({
      principalType: "EMPLOYEE",
      roleKey: "human_capital",
      scopeType: "unit",
    })).not.toThrow();

    expect(() => assertPrincipalRoleCompatibility({
      principalType: "SUPER_ADMIN",
      roleKey: "human_capital",
      scopeType: "organization",
    })).toThrowError(expect.objectContaining({ code: "SUPER_ADMIN_ROLE_ASSIGNMENT_PROTECTED" }));
  });
});
