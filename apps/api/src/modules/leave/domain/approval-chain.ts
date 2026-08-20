export type LeaveApprovalSource = "DIRECT_MANAGER" | "UNIT_APPROVER";

export interface LeaveApprovalStep {
  employeeId: string;
  sources: LeaveApprovalSource[];
}

export interface LeaveLineApprovalInput {
  requesterEmployeeId: string;
  directManagerEmployeeId: string | null | undefined;
  unitApproverEmployeeId: string | null | undefined;
}

export class LeaveApprovalConfigurationError extends Error {
  constructor(
    readonly code:
      | "DIRECT_MANAGER_MISSING"
      | "DIRECT_MANAGER_SELF"
      | "UNIT_APPROVER_MISSING"
      | "APPROVAL_CHAIN_EMPTY",
    message: string,
  ) {
    super(message);
    this.name = "LeaveApprovalConfigurationError";
  }
}

function addStep(
  steps: LeaveApprovalStep[],
  employeeId: string,
  source: LeaveApprovalSource,
) {
  const existing = steps.find((step) => step.employeeId === employeeId);
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
    return;
  }

  steps.push({ employeeId, sources: [source] });
}

export function resolveLeaveLineApprovalChain(
  input: LeaveLineApprovalInput,
): LeaveApprovalStep[] {
  if (!input.directManagerEmployeeId) {
    throw new LeaveApprovalConfigurationError(
      "DIRECT_MANAGER_MISSING",
      "Atasan langsung belum dikonfigurasi.",
    );
  }

  if (input.directManagerEmployeeId === input.requesterEmployeeId) {
    throw new LeaveApprovalConfigurationError(
      "DIRECT_MANAGER_SELF",
      "Atasan langsung tidak boleh menunjuk pegawai yang sama.",
    );
  }

  if (!input.unitApproverEmployeeId) {
    throw new LeaveApprovalConfigurationError(
      "UNIT_APPROVER_MISSING",
      "Approver unit belum dikonfigurasi.",
    );
  }

  const steps: LeaveApprovalStep[] = [];
  addStep(steps, input.directManagerEmployeeId, "DIRECT_MANAGER");

  if (input.unitApproverEmployeeId !== input.requesterEmployeeId) {
    addStep(steps, input.unitApproverEmployeeId, "UNIT_APPROVER");
  }

  if (steps.length === 0) {
    throw new LeaveApprovalConfigurationError(
      "APPROVAL_CHAIN_EMPTY",
      "Rantai approval tidak memiliki approver yang valid.",
    );
  }

  return steps;
}
