import type { EmployeeDetailResponse } from "./adminOrgAccess";

type EmployeeMasterEditState = Record<string, string>;

function dateInputValue(value: unknown) {
  if (value == null || value === "") return "";
  return String(value).slice(0, 10);
}

export function employeeMasterEditState(employee: EmployeeDetailResponse["employee"]): EmployeeMasterEditState {
  return Object.fromEntries(
    Object.entries(employee).map(([key, value]) => [
      key,
      key === "startedOn" || key === "endedOn"
        ? dateInputValue(value)
        : value == null ? "" : String(value),
    ]),
  );
}

export function employeeMasterUpdatePayload(edit: EmployeeMasterEditState, reason: string) {
  return {
    fullName: edit.fullName,
    employeeNumber: edit.employeeNumber,
    status: edit.status,
    employmentStatus: edit.employmentStatus || null,
    organizationalUnitId: edit.unitId || null,
    positionId: edit.positionId || null,
    employmentType: edit.employmentType || null,
    functionalPosition: edit.functionalPosition || null,
    structuralPosition: edit.structuralPosition || null,
    email: edit.email || null,
    phone: edit.phone || null,
    education: edit.education || null,
    startedOn: dateInputValue(edit.startedOn) || null,
    endedOn: dateInputValue(edit.endedOn) || null,
    reason,
  };
}
