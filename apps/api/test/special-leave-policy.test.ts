import { describe, expect, it } from "vitest";

import {
  SpecialLeavePolicyError,
  validateSpecialLeaveRequest,
} from "../src/modules/leave/domain/special-leave-policy.js";

describe("YSQ special leave policy", () => {
  it("allows emergency sick notice while deferring evidence", () => {
    const result = validateSpecialLeaveRequest({
      policyKey: "sick",
      submittedOn: "2026-08-20",
      startOn: "2026-08-20",
      endOn: "2026-08-21",
      workingDays: 2,
      hasEvidence: false,
    });

    expect(result.hcHandling).toBe("validate");
    expect(result.evidencePending).toBe(true);
    expect(result.warnings.map((item) => item.code)).toContain("EVIDENCE_DEFERRED");
  });

  it("requires maternity evidence at initial submission", () => {
    expect(() =>
      validateSpecialLeaveRequest({
        policyKey: "maternity",
        submittedOn: "2026-08-01",
        startOn: "2026-09-15",
        endOn: "2026-12-14",
        workingDays: 65,
        hasEvidence: false,
      }),
    ).toThrowError(SpecialLeavePolicyError);
  });

  it("limits menstruation rest to two working days", () => {
    expect(() =>
      validateSpecialLeaveRequest({
        policyKey: "menstruation_rest",
        submittedOn: "2026-08-20",
        startOn: "2026-08-20",
        endOn: "2026-08-24",
        workingDays: 3,
        hasEvidence: false,
      }),
    ).toThrowError(SpecialLeavePolicyError);
  });

  it("keeps spouse childbirth base-right automation at two working days", () => {
    expect(() =>
      validateSpecialLeaveRequest({
        policyKey: "spouse_childbirth",
        submittedOn: "2026-08-20",
        startOn: "2026-08-20",
        endOn: "2026-08-24",
        workingDays: 3,
        hasEvidence: true,
      }),
    ).toThrowError(SpecialLeavePolicyError);
  });
});
