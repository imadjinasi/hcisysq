import { describe, expect, it } from "vitest";

import { activeOrganizationEmployees, filterOrganizationEmployees, organizationEmployeeUnits } from "@/lib/organizationMemberPicker";
import type { OrganizationEmployeeOption } from "@/lib/organizationDesigner";

const employees: OrganizationEmployeeOption[] = [
  { id: "1", employeeNumber: "YSQ-001", fullName: "Aisyah Aktif", unitName: "SDIT", positionName: null, status: "active" },
  { id: "2", employeeNumber: "YSQ-002", fullName: "Budi Resigned", unitName: "SDIT", positionName: null, status: "resigned" },
  { id: "3", employeeNumber: "YSQ-103", fullName: "Citra Aktif", unitName: "SMPIT", positionName: null, status: "active" },
  { id: "4", employeeNumber: "YSQ-004", fullName: "Dina Inaktif", unitName: "SMAIT", positionName: null, status: "inactive" },
];

describe("Organization Designer member picker", () => {
  it("exposes only active employees and active legacy units", () => {
    expect(activeOrganizationEmployees(employees).map((employee) => employee.id)).toEqual(["1", "3"]);
    expect(organizationEmployeeUnits(employees)).toEqual(["SDIT", "SMPIT"]);
  });

  it("requires a search or unit filter before browsing", () => {
    expect(filterOrganizationEmployees(employees, { search: "", unit: "" })).toEqual([]);
  });

  it("searches active employees by name and employee number", () => {
    expect(filterOrganizationEmployees(employees, { search: "aisyah", unit: "" }).map((employee) => employee.id)).toEqual(["1"]);
    expect(filterOrganizationEmployees(employees, { search: "103", unit: "" }).map((employee) => employee.id)).toEqual(["3"]);
    expect(filterOrganizationEmployees(employees, { search: "budi", unit: "" })).toEqual([]);
  });

  it("combines unit and text filters", () => {
    expect(filterOrganizationEmployees(employees, { search: "aktif", unit: "SMPIT" }).map((employee) => employee.id)).toEqual(["3"]);
  });
});
