import { describe, expect, it } from "vitest";

import { employeeShellUser } from "@/lib/employeeIdentity";

describe("payslip employee identity", () => {
  it("uses the linked employee identity instead of a raw account fallback", () => {
    expect(
      employeeShellUser({
        id: "00000000-0000-4000-8000-000000000101",
        employeeNumber: "SYN-001",
        fullName: "Pegawai Sintetis",
        unitName: "Unit Sintetis",
        positionName: "Staf",
        leaveEntitlementGroup: "non_education",
        startedOn: "2020-01-01",
      }),
    ).toEqual({
      name: "Pegawai Sintetis",
      initials: "PS",
      position: "Staf",
      unit: "Unit Sintetis",
    });
  });
});
