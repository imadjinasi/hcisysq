import { describe, expect, it } from "vitest";

import { employeeMasterEditSchema, employeeMasterValidationFields } from "../src/modules/employees/employee-master-validation.js";

const sahariClassPayload = {
  fullName: "Synthetic Sahari Class",
  employeeNumber: "EMP-SAHARI-CLASS",
  status: "resigned",
  employmentStatus: "Pegawai Lepas",
  organizationalUnitId: "22222222-2222-4222-8222-222222222222",
  positionId: "33333333-3333-4333-8333-333333333333",
  employmentType: "Tenaga Kependidikan",
  functionalPosition: null,
  structuralPosition: null,
  email: null,
  phone: "0",
  education: null,
  startedOn: "2019-05-01",
  endedOn: null,
  reason: "Employee lifecycle correction based on current HC record: resigned.",
};

describe("Employee Master edit validation", () => {
  it("accepts the date-only payload produced for a Sahari-class lifecycle correction", () => {
    expect(employeeMasterEditSchema.safeParse(sahariClassPayload).success).toBe(true);
  });

  it("identifies the legacy ISO timestamp field instead of returning an opaque edit error", () => {
    const result = employeeMasterEditSchema.safeParse({
      ...sahariClassPayload,
      startedOn: "2019-05-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(employeeMasterValidationFields(result.error)).toEqual(["startedOn"]);
  });
});
