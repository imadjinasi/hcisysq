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
    expect(result.workingDays).toBe(3);
    expect(result.calendarDurationDays).toBe(3);
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

  it("keeps working-day limits independent from calendar duration for planned rights", () => {
    const result = validatePlannedLeaveRequest({
      policyKey: "child_marriage",
      submittedOn: "2026-08-13",
      startOn: "2026-08-21",
      endOn: "2026-08-24",
      workingDays: 2,
      hasEvidence: true,
    });
    expect(result.workingDays).toBe(2);
    expect(result.calendarDurationDays).toBe(4);
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

  it("uses H-7 for unpaid leave of three calendar days or less", () => {
    const result = validatePlannedLeaveRequest({
      policyKey: "unpaid",
      submittedOn: "2026-08-13",
      startOn: "2026-08-21",
      endOn: "2026-08-23",
      workingDays: 1,
      hasEvidence: false,
    });
    expect(result.calendarDurationDays).toBe(3);
    expect(result.workingDays).toBe(1);
    expect(result.minimumNoticeDays).toBe(7);
    expect(result.hcHandling).toBe("approve");
    expect(result.unpaid).toBe(true);
  });

  it("uses H-30 above three calendar days even when only two working days are affected", () => {
    expect(() =>
      validatePlannedLeaveRequest({
        policyKey: "unpaid",
        submittedOn: "2026-08-01",
        startOn: "2026-08-21",
        endOn: "2026-08-24",
        workingDays: 2,
        hasEvidence: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "MINIMUM_NOTICE_NOT_MET" }));

    const result = validatePlannedLeaveRequest({
      policyKey: "unpaid",
      submittedOn: "2026-07-22",
      startOn: "2026-08-21",
      endOn: "2026-08-24",
      workingDays: 2,
      hasEvidence: false,
    });
    expect(result.calendarDurationDays).toBe(4);
    expect(result.workingDays).toBe(2);
    expect(result.minimumNoticeDays).toBe(30);
    expect(result.unpaid).toBe(true);
  });
});
