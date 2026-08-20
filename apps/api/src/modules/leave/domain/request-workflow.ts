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
      | "STEP_ORDER_INVALID",
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
