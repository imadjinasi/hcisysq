import type { EmployeeAccessRow } from "./adminOrgAccess";

export type EmployeeStatusFilter = "all" | EmployeeAccessRow["status"];
export type AccountStatusFilter = "all" | NonNullable<EmployeeAccessRow["accountStatus"]> | "none";

export function filterEmployeeAccessRows(
  employees: EmployeeAccessRow[],
  input: {
    search: string;
    employeeStatus: EmployeeStatusFilter;
    accountStatus: AccountStatusFilter;
  },
) {
  const needle = input.search.trim().toLocaleLowerCase("id-ID");
  return employees.filter((employee) => {
    if (input.employeeStatus !== "all" && employee.status !== input.employeeStatus) return false;
    if (input.accountStatus !== "all" && (employee.accountStatus ?? "none") !== input.accountStatus) {
      return false;
    }
    if (!needle) return true;
    return [
      employee.fullName,
      employee.employeeNumber,
      employee.email ?? "",
      employee.unitName ?? "",
      employee.positionName ?? "",
    ].some((value) => value.toLocaleLowerCase("id-ID").includes(needle));
  });
}

export function selectAllMatchingEmployeeIds(employees: EmployeeAccessRow[]) {
  return new Set(employees.map((employee) => employee.id));
}
