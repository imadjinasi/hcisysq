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

  it("does not flag exactly 14 calendar days even when working-day count differs", () => {
    const result = validateSpecialLeaveRequest({
      policyKey: "sick",
      submittedOn: "2026-08-10",
      startOn: "2026-08-10",
      endOn: "2026-08-23",
      workingDays: 10,
      hasEvidence: true,
    });
    expect(result.calendarDurationDays).toBe(14);
    expect(result.workingDays).toBe(10);
    expect(result.warnings.map((item) => item.code)).not.toContain(
      "LONG_SICK_ADMIN_FOLLOW_UP",
    );
  });

  it("flags above 14 calendar days even when fewer than 14 working days are affected", () => {
    const result = validateSpecialLeaveRequest({
      policyKey: "sick",
      submittedOn: "2026-08-10",
      startOn: "2026-08-10",
      endOn: "2026-08-24",
      workingDays: 11,
      hasEvidence: true,
    });
    expect(result.calendarDurationDays).toBe(15);
    expect(result.workingDays).toBe(11);
    expect(result.warnings.map((item) => item.code)).toContain(
      "LONG_SICK_ADMIN_FOLLOW_UP",
    );
  });

  it("allows the three-month maternity base period", () => {
    expect(() =>
      validateSpecialLeaveRequest({
        policyKey: "maternity",
        submittedOn: "2026-08-01",
        startOn: "2026-09-15",
        endOn: "2026-12-14",
        workingDays: 65,
        hasEvidence: true,
      }),
    ).not.toThrow();
  });

  it("does not grant the conditional maternity extension through the normal flow", () => {
    expect(() =>
      validateSpecialLeaveRequest({
        policyKey: "maternity",
        submittedOn: "2026-08-01",
        startOn: "2026-09-15",
        endOn: "2027-01-15",
        workingDays: 85,
        hasEvidence: true,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "DURATION_LIMIT_EXCEEDED",
        message: expect.stringContaining("alur keputusan terpisah"),
      }),
    );
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
