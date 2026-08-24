import type { OrganizationEmployeeOption } from "@/lib/organizationDesigner";

export function activeOrganizationEmployees(employees: OrganizationEmployeeOption[]) {
  return employees.filter((employee) => employee.status === "active");
}

export function organizationEmployeeUnits(employees: OrganizationEmployeeOption[]) {
  return [...new Set(activeOrganizationEmployees(employees)
    .map((employee) => employee.unitName)
    .filter((unit): unit is string => Boolean(unit)))]
    .sort((left, right) => left.localeCompare(right, "id"));
}

export function filterOrganizationEmployees(
  employees: OrganizationEmployeeOption[],
  input: { search: string; unit: string },
) {
  const search = input.search.trim().toLocaleLowerCase("id");
  if (!search && !input.unit) return [];
  return activeOrganizationEmployees(employees).filter((employee) => {
    const matchesUnit = !input.unit || employee.unitName === input.unit;
    const matchesSearch = !search
      || employee.fullName.toLocaleLowerCase("id").includes(search)
      || employee.employeeNumber.toLocaleLowerCase("id").includes(search);
    return matchesUnit && matchesSearch;
  });
}
