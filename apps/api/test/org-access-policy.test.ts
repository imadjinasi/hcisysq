import { describe, expect, it } from "vitest";

import {
  assertAssignmentDates,
  assertAssignmentScope,
  assertManagerAssignment,
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
});
