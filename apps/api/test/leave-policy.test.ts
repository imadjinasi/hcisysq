import { describe, expect, it } from "vitest";

import {
  ANNUAL_LEAVE_ENTITLEMENT_DAYS,
  AnnualLeavePolicyError,
  assertAnnualLeaveEntitlementGroup,
  calculateAnnualLeaveYearView,
} from "../src/modules/leave/domain/annual-leave-policy.js";
import {
  LeaveApprovalConfigurationError,
  resolveLeaveLineApprovalChain,
} from "../src/modules/leave/domain/approval-chain.js";
import { getLeavePolicy } from "../src/modules/leave/domain/policy-catalog.js";

describe("YSQ annual leave policy", () => {
  it("keeps the annual right at 12 days while only Q4 is usable when eligibility starts in October", () => {
    const view = calculateAnnualLeaveYearView({
      employmentStartedOn: "2025-10-15",
      referenceDate: "2026-10-15",
    });

    expect(view.annualEntitlementDays).toBe(ANNUAL_LEAVE_ENTITLEMENT_DAYS);
    expect(view.annualEntitlementDays).toBe(12);
    expect(view.eligibleFrom).toBe("2026-10-15");
    expect(view.eligible).toBe(true);
    expect(view.currentPeriodKey).toBe("OCT_DEC");
    expect(view.availableNowDays).toBe(3);
    expect(view.eligiblePeriodAllocationDaysInYear).toBe(3);
    expect(view.carryForwardEnabled).toBe(false);

    expect(view.periods.map((period) => [period.key, period.status])).toEqual([
      ["JAN_MAR", "not_eligible"],
      ["APR_JUN", "not_eligible"],
      ["JUL_SEP", "not_eligible"],
      ["OCT_DEC", "current"],
    ]);
  });

  it("shows 12 days/year before eligibility but makes zero days available now", () => {
    const view = calculateAnnualLeaveYearView({
      employmentStartedOn: "2026-10-15",
      referenceDate: "2026-12-01",
    });

    expect(view.annualEntitlementDays).toBe(12);
    expect(view.eligibleFrom).toBe("2027-10-15");
    expect(view.eligible).toBe(false);
    expect(view.availableNowDays).toBe(0);
    expect(view.eligiblePeriodAllocationDaysInYear).toBe(0);
  });

  it("limits the current period to the remaining part of its 3-day bucket", () => {
    const view = calculateAnnualLeaveYearView({
      employmentStartedOn: "2024-01-01",
      referenceDate: "2026-08-20",
      usedDaysByPeriod: { JUL_SEP: 2 },
    });

    expect(view.currentPeriodKey).toBe("JUL_SEP");
    expect(view.availableNowDays).toBe(1);
    expect(view.periods.find((period) => period.key === "JUL_SEP")?.remainingDays).toBe(1);
  });

  it("does not carry unused previous-period quota into the current period", () => {
    const view = calculateAnnualLeaveYearView({
      employmentStartedOn: "2024-01-01",
      referenceDate: "2026-05-10",
      usedDaysByPeriod: { JAN_MAR: 0, APR_JUN: 0 },
    });

    expect(view.availableNowDays).toBe(3);
    expect(view.carryForwardEnabled).toBe(false);
  });

  it("clamps a leap-day employment anniversary to the last valid day of February", () => {
    const view = calculateAnnualLeaveYearView({
      employmentStartedOn: "2024-02-29",
      referenceDate: "2025-02-28",
    });

    expect(view.eligibleFrom).toBe("2025-02-28");
    expect(view.eligible).toBe(true);
  });

  it("rejects individual annual leave for the education entitlement group", () => {
    expect(() => assertAnnualLeaveEntitlementGroup("education")).toThrowError(
      AnnualLeavePolicyError,
    );
    expect(() => assertAnnualLeaveEntitlementGroup("non_education")).not.toThrow();
  });
});

describe("YSQ line approval resolution", () => {
  it("routes a layered employee through direct manager then unit approver", () => {
    expect(
      resolveLeaveLineApprovalChain({
        requesterEmployeeId: "guru",
        directManagerEmployeeId: "wakasek-kurikulum",
        unitApproverEmployeeId: "kepala-sdit",
      }),
    ).toEqual([
      { employeeId: "wakasek-kurikulum", sources: ["DIRECT_MANAGER"] },
      { employeeId: "kepala-sdit", sources: ["UNIT_APPROVER"] },
    ]);
  });

  it("deduplicates when direct manager is already the unit approver", () => {
    expect(
      resolveLeaveLineApprovalChain({
        requesterEmployeeId: "guru",
        directManagerEmployeeId: "kepala-sdit",
        unitApproverEmployeeId: "kepala-sdit",
      }),
    ).toEqual([
      {
        employeeId: "kepala-sdit",
        sources: ["DIRECT_MANAGER", "UNIT_APPROVER"],
      },
    ]);
  });

  it("removes requester self-approval for a unit head and keeps the direct manager", () => {
    expect(
      resolveLeaveLineApprovalChain({
        requesterEmployeeId: "kepala-sdit",
        directManagerEmployeeId: "kabid-pendidikan",
        unitApproverEmployeeId: "kepala-sdit",
      }),
    ).toEqual([{ employeeId: "kabid-pendidikan", sources: ["DIRECT_MANAGER"] }]);
  });

  it("fails closed when vacancy has no explicitly configured unit approver", () => {
    expect(() =>
      resolveLeaveLineApprovalChain({
        requesterEmployeeId: "staff",
        directManagerEmployeeId: "koordinator",
        unitApproverEmployeeId: null,
      }),
    ).toThrowError(LeaveApprovalConfigurationError);
  });

  it("fails closed when direct manager is missing", () => {
    expect(() =>
      resolveLeaveLineApprovalChain({
        requesterEmployeeId: "staff",
        directManagerEmployeeId: null,
        unitApproverEmployeeId: "direktur",
      }),
    ).toThrowError(LeaveApprovalConfigurationError);
  });
});

describe("YSQ leave policy catalog", () => {
  it("treats HC as notified for annual leave and approver for unpaid leave", () => {
    expect(getLeavePolicy("annual").hcHandling).toBe("notify");
    expect(getLeavePolicy("annual").lineHandling).toBe("approval");
    expect(getLeavePolicy("unpaid").hcHandling).toBe("approve");
    expect(getLeavePolicy("unpaid").lineHandling).toBe("approval");
  });

  it("does not model collective leave as an individual request", () => {
    expect(getLeavePolicy("foundation_collective").requestMode).toBe(
      "organization_event",
    );
    expect(getLeavePolicy("academic_break").requestMode).toBe("organization_event");
  });
});
