import type { OrganizationMembership } from "@/lib/organizationDesigner";

export type OrganizationMembershipKind = "PRIMARY" | "SECONDARY";
export type OrganizationMembershipDeltaKind = "ADDED" | "REMOVED" | "CHANGED";

export interface OrganizationMembershipDelta {
  employeeId: string;
  kind: OrganizationMembershipDeltaKind;
  before: OrganizationMembershipKind | null;
  after: OrganizationMembershipKind | null;
  primaryElsewhere: OrganizationMembership | null;
  requiresPrimarySwitchConfirmation: boolean;
  blocksLastPrimaryRemoval: boolean;
}
export function membershipKind(isPrimary: boolean): OrganizationMembershipKind {
  return isPrimary ? "PRIMARY" : "SECONDARY";
}

export function currentNodeMemberships(
  memberships: OrganizationMembership[],
  nodeKey: string,
) {
  return memberships.filter((membership) => membership.nodeKey === nodeKey);
}

export function primaryMembershipElsewhere(
  memberships: OrganizationMembership[],
  nodeKey: string,
  employeeId: string,
) {
  return memberships.find(
    (membership) =>
      membership.employeeId === employeeId &&
      membership.nodeKey !== nodeKey &&
      membership.isPrimary,
  ) ?? null;
}

export function defaultMembershipIsPrimary(
  memberships: OrganizationMembership[],
  nodeKey: string,
  employeeId: string,
) {
  const current = memberships.find(
    (membership) =>
      membership.nodeKey === nodeKey && membership.employeeId === employeeId,
  );
  if (current) return Boolean(current.isPrimary);
  return !primaryMembershipElsewhere(memberships, nodeKey, employeeId);
}

export function buildMembershipDeltas(input: {
  nodeKey: string;
  memberships: OrganizationMembership[];
  selectedEmployeeIds: ReadonlySet<string>;
  primaryByEmployeeId: ReadonlyMap<string, boolean>;
}): OrganizationMembershipDelta[] {
  const current = currentNodeMemberships(input.memberships, input.nodeKey);
  const currentByEmployee = new Map(
    current.map((membership) => [membership.employeeId, membership]),
  );
  const employeeIds = new Set([
    ...currentByEmployee.keys(),
    ...input.selectedEmployeeIds,
  ]);

  return [...employeeIds]
    .sort()
    .flatMap((employeeId): OrganizationMembershipDelta[] => {
      const before = currentByEmployee.get(employeeId) ?? null;
      const selected = input.selectedEmployeeIds.has(employeeId);
      const primaryElsewhere = primaryMembershipElsewhere(
        input.memberships,
        input.nodeKey,
        employeeId,
      );
      const afterPrimary =
        input.primaryByEmployeeId.get(employeeId) ??
        defaultMembershipIsPrimary(
          input.memberships,
          input.nodeKey,
          employeeId,
        );

      if (!before && selected) {
        return [{
          employeeId,
          kind: "ADDED",
          before: null,
          after: membershipKind(afterPrimary),
          primaryElsewhere,
          requiresPrimarySwitchConfirmation: afterPrimary && Boolean(primaryElsewhere),
          blocksLastPrimaryRemoval: false,
        }];
      }
      if (before && !selected) {
        return [{
          employeeId,
          kind: "REMOVED",
          before: membershipKind(Boolean(before.isPrimary)),
          after: null,
          primaryElsewhere,
          requiresPrimarySwitchConfirmation: false,
          blocksLastPrimaryRemoval: Boolean(before.isPrimary) && !primaryElsewhere,
        }];
      }
      if (before && selected && Boolean(before.isPrimary) !== afterPrimary) {
        return [{
          employeeId,
          kind: "CHANGED",
          before: membershipKind(Boolean(before.isPrimary)),
          after: membershipKind(afterPrimary),
          primaryElsewhere,
          requiresPrimarySwitchConfirmation: afterPrimary && Boolean(primaryElsewhere),
          blocksLastPrimaryRemoval: Boolean(before.isPrimary) && !afterPrimary && !primaryElsewhere,
        }];
      }
      return [];
    });
}
