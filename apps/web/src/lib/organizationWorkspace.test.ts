import { describe, expect, it } from "vitest";

import type { OrganizationRevision } from "@/lib/organizationDesigner";
import { chooseOrganizationEntry } from "@/lib/organizationWorkspace";

const revisions: OrganizationRevision[] = [
  { id: "validated", name: "Revisi B", status: "VALIDATED", effectiveOn: "2026-09-02", createdAt: "2026-08-26T02:00:00Z", validatedAt: "2026-08-26T03:00:00Z", publishedAt: null, baseChangeSetId: "published" },
  { id: "draft", name: "Revisi A", status: "DRAFT", effectiveOn: "2026-09-01", createdAt: "2026-08-26T01:00:00Z", validatedAt: null, publishedAt: null, baseChangeSetId: "published" },
  { id: "published", name: "Versi terbit", status: "PUBLISHED", effectiveOn: "2026-08-25", createdAt: "2026-08-25T01:00:00Z", validatedAt: "2026-08-25T02:00:00Z", publishedAt: "2026-08-25T03:00:00Z", baseChangeSetId: null },
];

describe("Organization workspace entry recovery", () => {
  it("opens an explicit or remembered revision without title/date inference", () => {
    expect(chooseOrganizationEntry({ explicitRevisionId: "draft", hasExplicitEffectiveDate: false, rememberedRevisionId: "validated", revisions })).toMatchObject({ kind: "revision", source: "explicit", revision: { id: "draft" } });
    expect(chooseOrganizationEntry({ explicitRevisionId: null, hasExplicitEffectiveDate: false, rememberedRevisionId: "validated", revisions })).toMatchObject({ kind: "revision", source: "remembered", revision: { id: "validated" } });
  });

  it("does not arbitrarily select among unfinished revisions", () => {
    expect(chooseOrganizationEntry({ explicitRevisionId: null, hasExplicitEffectiveDate: false, rememberedRevisionId: null, revisions })).toMatchObject({ kind: "chooser" });
  });

  it("recovers invalid links and respects deliberate published date browsing", () => {
    expect(chooseOrganizationEntry({ explicitRevisionId: "missing", hasExplicitEffectiveDate: false, rememberedRevisionId: null, revisions })).toEqual({ kind: "invalid", revisionId: "missing" });
    expect(chooseOrganizationEntry({ explicitRevisionId: null, hasExplicitEffectiveDate: true, rememberedRevisionId: "draft", revisions })).toEqual({ kind: "published" });
  });
});
