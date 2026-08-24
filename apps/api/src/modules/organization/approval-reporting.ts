import { randomUUID } from "node:crypto";

import type {
  AuthorityBindingType,
  OrganizationSnapshot,
} from "./domain.js";

export interface GuidedApprovalReportingInput {
  sourceType: "NODE" | "POSITION";
  sourceKey: string;
  leaderPositionKey?: string | null | undefined;
  reportsToPositionKey?: string | null | undefined;
  unitApproverPositionKey?: string | null | undefined;
  governanceApproverPositionKey?: string | null | undefined;
  oversightParentPositionKey?: string | null | undefined;
  effectiveFrom: string;
}

export class GuidedApprovalReportingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function applyGuidedApprovalReporting(
  snapshot: OrganizationSnapshot,
  input: GuidedApprovalReportingInput,
) {
  const changedRelationships: string[] = [];
  const position = (stableKey: string) => {
    const item = snapshot.positions.find((candidate) => candidate.stableKey === stableKey);
    if (!item) {
      throw new GuidedApprovalReportingError(
        "ORGANIZATION_POSITION_NOT_FOUND",
        "The selected organization position was not found in this draft.",
      );
    }
    return item;
  };
  const replaceBinding = (
    subjectKind: "NODE" | "POSITION",
    subjectKey: string,
    bindingType: AuthorityBindingType,
    targetPositionKey: string | null | undefined,
  ) => {
    if (targetPositionKey === undefined) return;
    const existing = snapshot.authorityBindings.find((binding) =>
      binding.subjectKind === subjectKind &&
      binding.subjectKey === subjectKey &&
      binding.bindingType === bindingType,
    );
    snapshot.authorityBindings = snapshot.authorityBindings.filter((binding) =>
      !(
        binding.subjectKind === subjectKind &&
        binding.subjectKey === subjectKey &&
        binding.bindingType === bindingType
      ),
    );
    if (targetPositionKey) {
      if (subjectKind === "POSITION" && subjectKey === targetPositionKey) {
        throw new GuidedApprovalReportingError(
          "ORGANIZATION_AUTHORITY_SELF_REFERENCE",
          "A position cannot report or approve to itself.",
        );
      }
      const target = position(targetPositionKey);
      snapshot.authorityBindings.push({
        id: randomUUID(),
        subjectKind,
        subjectKey,
        bindingType,
        targetPositionKey,
        vacancyPolicy: existing?.vacancyPolicy ?? target.vacancyPolicy,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
      });
    }
    changedRelationships.push(bindingType);
  };

  if (input.sourceType === "NODE") {
    if (
      input.governanceApproverPositionKey !== undefined ||
      input.oversightParentPositionKey !== undefined
    ) {
      throw new GuidedApprovalReportingError(
        "INVALID_NODE_APPROVAL_REPORTING",
        "Governance relationships must be configured from a position.",
      );
    }
    const node = snapshot.nodes.find((candidate) => candidate.stableKey === input.sourceKey);
    if (!node) {
      throw new GuidedApprovalReportingError(
        "ORGANIZATION_NODE_NOT_FOUND",
        "The selected organization structure was not found in this draft.",
      );
    }
    const previousLeaderKey = snapshot.authorityBindings.find((binding) =>
      binding.subjectKind === "NODE" &&
      binding.subjectKey === node.stableKey &&
      binding.bindingType === "LEADER",
    )?.targetPositionKey ?? null;
    if (input.leaderPositionKey) {
      const leader = position(input.leaderPositionKey);
      if (leader.nodeKey !== node.stableKey) {
        throw new GuidedApprovalReportingError(
          "LEADER_POSITION_NODE_MISMATCH",
          "The structure leader position must belong to the selected structure.",
        );
      }
    }
    replaceBinding("NODE", node.stableKey, "LEADER", input.leaderPositionKey);
    replaceBinding(
      "NODE",
      node.stableKey,
      "UNIT_APPROVER",
      input.unitApproverPositionKey,
    );

    if (input.reportsToPositionKey !== undefined) {
      const leaderKey = input.leaderPositionKey === undefined
        ? previousLeaderKey
        : input.leaderPositionKey ?? previousLeaderKey;
      if (!leaderKey) {
        if (input.reportsToPositionKey) {
          throw new GuidedApprovalReportingError(
            "LEADER_POSITION_REQUIRED",
            "Choose a structure leader before configuring its reports-to position.",
          );
        }
      } else {
        const leader = position(leaderKey);
        leader.parentPositionKey = input.reportsToPositionKey;
        replaceBinding(
          "POSITION",
          leader.stableKey,
          "SUPERVISORY_PARENT",
          input.reportsToPositionKey,
        );
      }
    }
  } else {
    if (
      input.leaderPositionKey !== undefined ||
      input.unitApproverPositionKey !== undefined
    ) {
      throw new GuidedApprovalReportingError(
        "INVALID_POSITION_APPROVAL_REPORTING",
        "Leader and Unit Approver relationships must be configured from a structure.",
      );
    }
    const source = position(input.sourceKey);
    if (input.reportsToPositionKey !== undefined) {
      source.parentPositionKey = input.reportsToPositionKey;
    }
    replaceBinding(
      "POSITION",
      source.stableKey,
      "SUPERVISORY_PARENT",
      input.reportsToPositionKey,
    );
    replaceBinding(
      "POSITION",
      source.stableKey,
      "GOVERNANCE_APPROVER",
      input.governanceApproverPositionKey,
    );
    replaceBinding(
      "POSITION",
      source.stableKey,
      "OVERSIGHT_PARENT",
      input.oversightParentPositionKey,
    );
  }

  return { changedRelationships };
}
