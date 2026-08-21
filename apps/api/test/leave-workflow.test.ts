import { describe, expect, it } from "vitest";

import {
  decideLeaveApprovalStep,
  LeaveWorkflowError,
} from "../src/modules/leave/domain/request-workflow.js";

describe("leave approval snapshot workflow", () => {
  it("activates the next snapshotted step without recomputing hierarchy", () => {
    const result = decideLeaveApprovalStep({
      requestStatus: "in_review",
      stepId: "step-1",
      decision: "approve",
      steps: [
        { id: "step-1", order: 1, status: "pending" },
        { id: "step-2", order: 2, status: "waiting" },
      ],
    });
    expect(result.requestStatus).toBe("in_review");
    expect(result.nextPendingStepId).toBe("step-2");
  });

  it("finalizes when the last pending step is approved", () => {
    const result = decideLeaveApprovalStep({
      requestStatus: "in_review",
      stepId: "step-2",
      decision: "approve",
      steps: [
        { id: "step-1", order: 1, status: "approved" },
        { id: "step-2", order: 2, status: "pending" },
      ],
    });
    expect(result.requestStatus).toBe("approved");
    expect(result.nextPendingStepId).toBeNull();
  });

  it("rejects from the active step", () => {
    const result = decideLeaveApprovalStep({
      requestStatus: "in_review",
      stepId: "step-1",
      decision: "reject",
      steps: [
        { id: "step-1", order: 1, status: "pending" },
        { id: "step-2", order: 2, status: "waiting" },
      ],
    });
    expect(result.requestStatus).toBe("rejected");
  });

  it("does not allow acting on a waiting step", () => {
    expect(() =>
      decideLeaveApprovalStep({
        requestStatus: "in_review",
        stepId: "step-2",
        decision: "approve",
        steps: [
          { id: "step-1", order: 1, status: "pending" },
          { id: "step-2", order: 2, status: "waiting" },
        ],
      }),
    ).toThrowError(LeaveWorkflowError);
  });

  it("fails closed when more than one approval step is active", () => {
    expect(() =>
      decideLeaveApprovalStep({
        requestStatus: "in_review",
        stepId: "step-1",
        decision: "approve",
        steps: [
          { id: "step-1", order: 1, status: "pending" },
          { id: "step-2", order: 2, status: "pending" },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "APPROVAL_STATE_INVALID" }));
  });

  it("fails closed when an earlier snapshotted step was not approved", () => {
    expect(() =>
      decideLeaveApprovalStep({
        requestStatus: "in_review",
        stepId: "step-2",
        decision: "approve",
        steps: [
          { id: "step-1", order: 1, status: "waiting" },
          { id: "step-2", order: 2, status: "pending" },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "APPROVAL_STATE_INVALID" }));
  });
});
