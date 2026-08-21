import { describe, expect, it } from "vitest";

import { validatePlannedLeaveRequest } from "../src/modules/leave/domain/planned-leave-policy.js";

describe("YSQ planned and unpaid leave policy", () => {
  it("enforces three working days and H-7 for employee marriage", () => {
    const result = validatePlannedLeaveRequest({
      policyKey: "employee_marriage",
      submittedOn: "2026-08-01",
      startOn: "2026-08-10",
      endOn: "2026-08-12",
      workingDays: 3,
      hasEvidence: true,
    });
    expect(result.minimumNoticeDays).toBe(7);
    expect(result.hcHandling).toBe("validate");
    expect(result.unpaid).toBe(false);

    expect(() =>
      validatePlannedLeaveRequest({
        policyKey: "employee_marriage",
        submittedOn: "2026-08-01",
        startOn: "2026-08-10",
        endOn: "2026-08-13",
        workingDays: 4,
        hasEvidence: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "DURATION_LIMIT_EXCEEDED" }));
  });

  it("requires evidence for child marriage and circumcision", () => {
    for (const policyKey of ["child_marriage", "child_circumcision"] as const) {
      expect(() =>
        validatePlannedLeaveRequest({
          policyKey,
          submittedOn: "2026-08-01",
          startOn: "2026-08-10",
          endOn: "2026-08-11",
          workingDays: 2,
          hasEvidence: false,
        }),
      ).toThrowError(expect.objectContaining({ code: "EVIDENCE_REQUIRED" }));
    }
  });

  it("keeps Hajj to one approved occurrence during employment", () => {
    expect(() =>
      validatePlannedLeaveRequest({
        policyKey: "hajj",
        submittedOn: "2026-08-01",
        startOn: "2026-08-10",
        endOn: "2026-08-20",
        workingDays: 9,
        hasEvidence: true,
        priorApprovedHajjCount: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: "HAJJ_ALREADY_USED" }));
  });

  it("uses H-7 for unpaid leave of three days or less", () => {
    const result = validatePlannedLeaveRequest({
      policyKey: "unpaid",
      submittedOn: "2026-08-01",
      startOn: "2026-08-08",
      endOn: "2026-08-10",
      workingDays: 3,
      hasEvidence: false,
    });
    expect(result.minimumNoticeDays).toBe(7);
    expect(result.hcHandling).toBe("approve");
    expect(result.unpaid).toBe(true);
  });

  it("uses H-30 for unpaid leave above three working days", () => {
    expect(() =>
      validatePlannedLeaveRequest({
        policyKey: "unpaid",
        submittedOn: "2026-08-01",
        startOn: "2026-08-20",
        endOn: "2026-08-25",
        workingDays: 4,
        hasEvidence: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "MINIMUM_NOTICE_NOT_MET" }));

    const result = validatePlannedLeaveRequest({
      policyKey: "unpaid",
      submittedOn: "2026-08-01",
      startOn: "2026-08-31",
      endOn: "2026-09-03",
      workingDays: 4,
      hasEvidence: false,
    });
    expect(result.minimumNoticeDays).toBe(30);
    expect(result.unpaid).toBe(true);
  });
});
