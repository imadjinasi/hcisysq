import { describe, expect, it } from "vitest";

import { employeeMasterEditState, employeeMasterUpdatePayload } from "./employeeMasterEdit";

describe("Employee Master edit serialization", () => {
  it("preserves a legacy PostgreSQL date while producing the canonical date-only update payload", () => {
    const state = employeeMasterEditState({
      id: "11111111-1111-4111-8111-111111111111",
      employeeNumber: "EMP-SAHARI-CLASS",
      fullName: "Synthetic Sahari Class",
      status: "active",
      employmentStatus: "Pegawai Lepas",
      unitId: "22222222-2222-4222-8222-222222222222",
      unitName: "Synthetic Unit",
      positionId: "33333333-3333-4333-8333-333333333333",
      positionName: "Synthetic Position",
      email: null,
      phone: "0",
      education: null,
      startedOn: "2019-05-01T00:00:00.000Z",
      endedOn: null,
      employmentType: "Tenaga Kependidikan",
      functionalPosition: null,
      structuralPosition: null,
      removedAt: null,
      removalReason: null,
      managerEmployeeId: null,
      managerEmployeeNumber: null,
      managerFullName: null,
      accountId: null,
      accountEmail: null,
      accountStatus: null,
    });

    state.status = "resigned";
    const payload = employeeMasterUpdatePayload(
      state,
      "Employee lifecycle correction based on current HC record: resigned.",
    );

    expect(state.startedOn).toBe("2019-05-01");
    expect(payload).toMatchObject({
      status: "resigned",
      startedOn: "2019-05-01",
      endedOn: null,
      reason: "Employee lifecycle correction based on current HC record: resigned.",
    });
  });
});
