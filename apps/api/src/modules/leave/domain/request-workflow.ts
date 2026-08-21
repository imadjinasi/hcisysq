export type LeaveRequestStatus = "in_review" | "approved" | "rejected" | "cancelled";
export type LeaveApprovalStepStatus = "waiting" | "pending" | "approved" | "rejected";

export interface LeaveApprovalStepState {
  id: string;
  order: number;
  status: LeaveApprovalStepStatus;
}

export interface LeaveApprovalDecisionResult {
  requestStatus: LeaveRequestStatus;
  decidedStepStatus: "approved" | "rejected";
  nextPendingStepId: string | null;
}

export class LeaveWorkflowError extends Error {
  constructor(
    readonly code:
      | "REQUEST_NOT_REVIEWABLE"
      | "STEP_NOT_PENDING"
      | "STEP_ORDER_INVALID"
      | "APPROVAL_STATE_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "LeaveWorkflowError";
  }
}

function sortedSteps(steps: readonly LeaveApprovalStepState[]) {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const seen = new Set<number>();
  for (const step of sorted) {
    if (seen.has(step.order)) {
      throw new LeaveWorkflowError(
        "STEP_ORDER_INVALID",
        "Urutan approval tidak boleh duplikat.",
      );
    }
    seen.add(step.order);
  }
  return sorted;
}

function assertSequentialSnapshotState(steps: readonly LeaveApprovalStepState[]) {
  const pendingSteps = steps.filter((step) => step.status === "pending");
  if (pendingSteps.length !== 1) {
    throw new LeaveWorkflowError(
      "APPROVAL_STATE_INVALID",
      "Snapshot approval harus memiliki tepat satu tahap aktif selama pengajuan masih diproses.",
    );
  }

  const pending = pendingSteps[0]!;
  for (const step of steps) {
    if (step.order < pending.order && step.status !== "approved") {
      throw new LeaveWorkflowError(
        "APPROVAL_STATE_INVALID",
        "Tahap sebelum approver aktif harus sudah disetujui.",
      );
    }
    if (step.order > pending.order && step.status !== "waiting") {
      throw new LeaveWorkflowError(
        "APPROVAL_STATE_INVALID",
        "Tahap setelah approver aktif harus tetap menunggu.",
      );
    }
  }
}

export function decideLeaveApprovalStep(input: {
  requestStatus: LeaveRequestStatus;
  stepId: string;
  decision: "approve" | "reject";
  steps: readonly LeaveApprovalStepState[];
}): LeaveApprovalDecisionResult {
  if (input.requestStatus !== "in_review") {
    throw new LeaveWorkflowError(
      "REQUEST_NOT_REVIEWABLE",
      "Pengajuan tidak lagi dalam proses approval.",
    );
  }

  const steps = sortedSteps(input.steps);
  assertSequentialSnapshotState(steps);

  const current = steps.find((step) => step.id === input.stepId);
  if (!current || current.status !== "pending") {
    throw new LeaveWorkflowError(
      "STEP_NOT_PENDING",
      "Tahap approval ini bukan tahap aktif.",
    );
  }

  if (input.decision === "reject") {
    return {
      requestStatus: "rejected",
      decidedStepStatus: "rejected",
      nextPendingStepId: null,
    };
  }

  const next = steps.find(
    (step) => step.order > current.order && step.status === "waiting",
  );
  return {
    requestStatus: next ? "in_review" : "approved",
    decidedStepStatus: "approved",
    nextPendingStepId: next?.id ?? null,
  };
}
