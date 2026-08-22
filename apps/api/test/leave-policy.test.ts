import { describe, expect, it } from "vitest";

import {
  ANNUAL_LEAVE_ENTITLEMENT_DAYS,
  AnnualLeavePolicyError,
  assertAnnualLeaveEntitlementGroup,
  calculateAnnualLeaveYearView,
} from "../src/modules/leave/domain/annual-leave-policy.js";
import {
  AnnualLeaveRequestPolicyError,
  validateAnnualLeaveRequest,
} from "../src/modules/leave/domain/annual-leave-request.js";
import {
  LeaveApprovalConfigurationError,
  resolveLeaveLineApprovalChain,
  snapshotResolvedLeaveAuthorities,
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

describe("YSQ annual leave request validation", () => {
  it("accepts a normal request inside the active 3-day period", () => {
    const result = validateAnnualLeaveRequest({
      entitlementGroup: "non_education",
      employmentStartedOn: "2024-01-01",
      submittedOn: "2026-08-01",
      leaveStartOn: "2026-08-10",
      leaveEndOn: "2026-08-11",
      requestedWorkingDays: 2,
      usedDaysByPeriod: { JUL_SEP: 1 },
    });

    expect(result.annualEntitlementDays).toBe(12);
    expect(result.periodKey).toBe("JUL_SEP");
    expect(result.periodLimitDays).toBe(3);
    expect(result.availableDaysBeforeRequest).toBe(2);
    expect(result.availableDaysAfterRequest).toBe(0);
    expect(result.noticeDays).toBe(9);
  });

  it("blocks annual leave before the 12-month eligibility date", () => {
    expect(() =>
      validateAnnualLeaveRequest({
        entitlementGroup: "non_education",
        employmentStartedOn: "2025-10-15",
        submittedOn: "2026-09-25",
        leaveStartOn: "2026-10-10",
        leaveEndOn: "2026-10-10",
        requestedWorkingDays: 1,
      }),
    ).toThrowError(AnnualLeaveRequestPolicyError);
  });

  it("blocks a request that misses H-7", () => {
    expect(() =>
      validateAnnualLeaveRequest({
        entitlementGroup: "non_education",
        employmentStartedOn: "2024-01-01",
        submittedOn: "2026-08-05",
        leaveStartOn: "2026-08-10",
        leaveEndOn: "2026-08-10",
        requestedWorkingDays: 1,
      }),
    ).toThrowError(AnnualLeaveRequestPolicyError);
  });

  it("blocks usage beyond the current period's remaining quota", () => {
    expect(() =>
      validateAnnualLeaveRequest({
        entitlementGroup: "non_education",
        employmentStartedOn: "2024-01-01",
        submittedOn: "2026-08-01",
        leaveStartOn: "2026-08-10",
        leaveEndOn: "2026-08-12",
        requestedWorkingDays: 2,
        usedDaysByPeriod: { JUL_SEP: 2 },
      }),
    ).toThrowError(AnnualLeaveRequestPolicyError);
  });

  it("requires a split when one request crosses two quota periods", () => {
    expect(() =>
      validateAnnualLeaveRequest({
        entitlementGroup: "non_education",
        employmentStartedOn: "2024-01-01",
        submittedOn: "2026-09-20",
        leaveStartOn: "2026-09-29",
        leaveEndOn: "2026-10-02",
        requestedWorkingDays: 3,
      }),
    ).toThrowError(AnnualLeaveRequestPolicyError);
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

  it("snapshots configured governance authority without relying on a position title", () => {
    expect(
      snapshotResolvedLeaveAuthorities({
        requesterEmployeeId: "requester",
        authorities: [
          { employeeId: "secretary-incumbent", source: "GOVERNANCE_APPROVER" },
        ],
      }),
    ).toEqual([
      {
        employeeId: "secretary-incumbent",
        sources: ["GOVERNANCE_APPROVER"],
      },
    ]);
  });

  it("defensively removes self approvals and deduplicates structural authorities", () => {
    expect(
      snapshotResolvedLeaveAuthorities({
        requesterEmployeeId: "requester",
        authorities: [
          { employeeId: "requester", source: "UNIT_APPROVER" },
          { employeeId: "director", source: "DIRECT_MANAGER" },
          { employeeId: "director", source: "UNIT_APPROVER" },
        ],
      }),
    ).toEqual([
      {
        employeeId: "director",
        sources: ["DIRECT_MANAGER", "UNIT_APPROVER"],
      },
    ]);
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
