import type { OrganizationRevision } from "@/lib/organizationDesigner";

export const ORGANIZATION_LAST_REVISION_KEY = "hcis.organization.last-working-revision";
export const ORGANIZATION_PREVIEW_EMPLOYEE_KEY = "hcis.organization.preview-employee";

export type OrganizationEntryDecision =
  | { kind: "revision"; revision: OrganizationRevision; source: "explicit" | "remembered" }
  | { kind: "chooser"; revisions: OrganizationRevision[] }
  | { kind: "published" }
  | { kind: "invalid"; revisionId: string };

export function chooseOrganizationEntry(input: {
  explicitRevisionId: string | null;
  hasExplicitEffectiveDate: boolean;
  rememberedRevisionId: string | null;
  revisions: OrganizationRevision[];
}): OrganizationEntryDecision {
  if (input.explicitRevisionId) {
    const revision = input.revisions.find((item) => item.id === input.explicitRevisionId);
    return revision
      ? { kind: "revision", revision, source: "explicit" }
      : { kind: "invalid", revisionId: input.explicitRevisionId };
  }
  if (input.hasExplicitEffectiveDate) return { kind: "published" };
  const remembered = input.revisions.find((item) =>
    item.id === input.rememberedRevisionId && item.status !== "PUBLISHED");
  if (remembered) return { kind: "revision", revision: remembered, source: "remembered" };
  const unfinished = input.revisions.filter((item) => item.status !== "PUBLISHED");
  return unfinished.length > 0
    ? { kind: "chooser", revisions: unfinished }
    : { kind: "published" };
}

export function revisionStatusLabel(status: OrganizationRevision["status"]): string {
  if (status === "DRAFT") return "Draft";
  if (status === "VALIDATED") return "Tervalidasi";
  return "Diterbitkan";
}
