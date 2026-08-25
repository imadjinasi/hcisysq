import { describe, expect, it } from "vitest";

import type { EmployeeAccessRow } from "./adminOrgAccess";
import { filterEmployeeAccessRows, selectAllMatchingEmployeeIds } from "./bulkEmployeeAccess";

const rows: EmployeeAccessRow[] = [
  {
    id: "1",
    employeeNumber: "EMP-001",
    fullName: "Aisyah Aktif",
    status: "active",
    email: "aisyah@example.invalid",
    unitName: "SDIT",
    positionName: "Guru",
    accountId: null,
    accountStatus: null,
  },
  {
    id: "2",
    employeeNumber: "EMP-002",
    fullName: "Budi Menunggu",
    status: "active",
    email: "budi@example.invalid",
    unitName: "SMPIT",
    positionName: "Guru",
    accountId: "account-2",
    accountStatus: "invited",
  },
  {
    id: "3",
    employeeNumber: "EMP-003",
    fullName: "Citra Resign",
    status: "resigned",
    email: null,
    unitName: "Operasional",
    positionName: "Staf",
    accountId: null,
    accountStatus: null,
  },
];

describe("bulk employee access filtering and selection", () => {
  it("selects every row matching the current filters and no hidden rows", () => {
    const filtered = filterEmployeeAccessRows(rows, {
      search: "guru",
      employeeStatus: "active",
      accountStatus: "all",
    });
    expect([...selectAllMatchingEmployeeIds(filtered)]).toEqual(["1", "2"]);
  });

  it("distinguishes missing accounts from invited activation-pending accounts", () => {
    expect(filterEmployeeAccessRows(rows, {
      search: "",
      employeeStatus: "active",
      accountStatus: "none",
    }).map((row) => row.id)).toEqual(["1"]);
    expect(filterEmployeeAccessRows(rows, {
      search: "",
      employeeStatus: "active",
      accountStatus: "invited",
    }).map((row) => row.id)).toEqual(["2"]);
  });
});
