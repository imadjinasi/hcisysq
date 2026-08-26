export type AssignmentScopeType = "own" | "unit" | "organization";
export type AssignablePrincipalType = "EMPLOYEE" | "FOUNDATION_BOARD" | "SUPER_ADMIN";

export const GOVERNANCE_LEAVE_APPROVER_ROLE_KEY = "governance_leave_approver";

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

export function assertPrincipalRoleCompatibility(input: {
  principalType: AssignablePrincipalType;
  roleKey: string;
  scopeType: AssignmentScopeType;
}) {
  if (input.principalType === "SUPER_ADMIN") {
    throw new OrgAccessPolicyError(
      "SUPER_ADMIN_ROLE_ASSIGNMENT_PROTECTED",
      "Kewenangan Super Admin tidak diubah melalui administrasi akses ini.",
    );
  }

  if (input.principalType === "FOUNDATION_BOARD") {
    if (input.roleKey !== GOVERNANCE_LEAVE_APPROVER_ROLE_KEY) {
      throw new OrgAccessPolicyError(
        "FOUNDATION_BOARD_ROLE_FORBIDDEN",
        "Akun Organ Yayasan hanya dapat menerima kewenangan persetujuan cuti Pengurus Yayasan melalui administrasi akses ini.",
      );
    }
    if (input.scopeType !== "organization") {
      throw new OrgAccessPolicyError(
        "GOVERNANCE_ROLE_REQUIRES_ORGANIZATION_SCOPE",
        "Kewenangan persetujuan cuti Pengurus Yayasan selalu berlaku untuk seluruh organisasi.",
      );
    }
    return;
  }

  if (input.roleKey === GOVERNANCE_LEAVE_APPROVER_ROLE_KEY) {
    throw new OrgAccessPolicyError(
      "GOVERNANCE_ROLE_FOUNDATION_BOARD_ONLY",
      "Kewenangan persetujuan cuti Pengurus Yayasan hanya dapat diberikan kepada akun Organ Yayasan.",
    );
  }
}
