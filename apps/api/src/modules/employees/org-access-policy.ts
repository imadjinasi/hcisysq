export type AssignmentScopeType = "own" | "unit" | "organization";

export class OrgAccessPolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OrgAccessPolicyError";
  }
}

export function assertManagerAssignment(
  employeeId: string,
  managerEmployeeId: string | null,
) {
  if (managerEmployeeId && employeeId === managerEmployeeId) {
    throw new OrgAccessPolicyError(
      "SELF_MANAGER_FORBIDDEN",
      "Pegawai tidak dapat menjadi atasan langsung dirinya sendiri.",
    );
  }
}

export function assertAssignmentScope(
  scopeType: AssignmentScopeType,
  organizationalUnitId: string | null,
) {
  if (scopeType === "unit" && !organizationalUnitId) {
    throw new OrgAccessPolicyError(
      "UNIT_SCOPE_REQUIRES_UNIT",
      "Scope unit wajib menunjuk unit organisasi.",
    );
  }

  if (scopeType !== "unit" && organizationalUnitId) {
    throw new OrgAccessPolicyError(
      "NON_UNIT_SCOPE_FORBIDS_UNIT",
      "Unit organisasi hanya boleh diisi untuk scope unit.",
    );
  }
}

export function assertAssignmentDates(startsOn: string | null, endsOn: string | null) {
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new OrgAccessPolicyError(
      "INVALID_ASSIGNMENT_PERIOD",
      "Tanggal selesai assignment tidak boleh sebelum tanggal mulai.",
    );
  }
}
