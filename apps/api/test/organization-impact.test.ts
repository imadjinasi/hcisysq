import { describe, expect, it, vi } from "vitest";

import type { OrganizationSnapshot } from "../src/modules/organization/domain.js";
import { OrganizationDraftService } from "../src/modules/organization/draft-service.js";
import type { PostgresOrganizationRepository } from "../src/modules/organization/repository.js";

function snapshot(input: {
  id: string;
  baseChangeSetId: string | null;
  visualRankOffset: number;
  nodeIds: [string, string];
}): OrganizationSnapshot {
  const nodes = [
    {
      id: input.nodeIds[0], stableKey: "00000000-0000-4000-8000-000000000010",
      name: "Parent", nodeType: "UNIT", parentNodeKey: null, active: true,
      effectiveFrom: "2026-09-01", effectiveTo: null, visualRankOffset: 0,
      integrationCode: null,
    },
    {
      id: input.nodeIds[1], stableKey: "00000000-0000-4000-8000-000000000011",
      name: "Visual child", nodeType: "UNIT",
      parentNodeKey: "00000000-0000-4000-8000-000000000010", active: true,
      effectiveFrom: "2026-09-01", effectiveTo: null,
      visualRankOffset: input.visualRankOffset, integrationCode: null,
    },
  ];
  return {
    changeSet: {
      id: input.id, name: "Synthetic visual-only change", effectiveOn: "2026-09-01",
      status: "DRAFT", baseChangeSetId: input.baseChangeSetId, validationReport: {},
      createdByAccountId: "00000000-0000-4000-8000-000000000020",
      createdAt: "2026-08-23T00:00:00.000Z", validatedAt: null, publishedAt: null,
    },
    nodes,
    jobProfiles: [],
    positions: [],
    memberships: [],
    incumbencies: [],
    authorityBindings: [],
    reportingOverrides: [],
  };
}

describe("Organization impact preview", () => {
  it("ignores cloned row IDs when classifying a visual-only change", async () => {
    const baseId = "00000000-0000-4000-8000-000000000001";
    const draftId = "00000000-0000-4000-8000-000000000002";
    const base = snapshot({
      id: baseId,
      baseChangeSetId: null,
      visualRankOffset: 1,
      nodeIds: ["ffffffff-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000001"],
    });
    const draft = snapshot({
      id: draftId,
      baseChangeSetId: baseId,
      visualRankOffset: 2,
      nodeIds: ["00000000-0000-4000-8000-000000000002", "ffffffff-0000-4000-8000-000000000002"],
    });
    const repository = {
      loadChangeSetSnapshot: vi.fn(async (id: string) => id === draftId ? draft : base),
      validate: vi.fn(),
    } as unknown as PostgresOrganizationRepository;

    const impact = await new OrganizationDraftService(repository).previewImpact(draftId);

    expect(impact.routingImpact).toBe(false);
    expect(impact.visualOnly).toBe(true);
  });
});
