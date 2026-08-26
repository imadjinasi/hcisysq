import { describe, expect, it, vi } from "vitest";

import { OrganizationRolloutService } from "../src/modules/organization/rollout.js";
import type { OrganizationAuthorityResolver } from "../src/modules/organization/resolver.js";

describe("Organization direct approval cutover", () => {
  it("always resolves approval from the published Organization structure", async () => {
    const getRolloutMode = vi.fn(() => {
      throw new Error("rollout mode must not be consulted");
    });
    const resolveLineAuthorities = vi.fn().mockResolvedValue({
      effectiveDate: "2026-08-26",
      changeSetId: "11111111-1111-4111-8111-111111111111",
      governanceApplied: false,
      authorities: [
        {
          employeeId: "22222222-2222-4222-8222-222222222222",
          source: "DIRECT_MANAGER",
          sources: ["DIRECT_MANAGER"],
          path: ["organization"],
          incumbentKind: "PRIMARY",
          positionKey: "33333333-3333-4333-8333-333333333333",
        },
      ],
    });
    const resolver = { resolveLineAuthorities } as unknown as OrganizationAuthorityResolver;
    const service = new OrganizationRolloutService({ getRolloutMode }, resolver);

    const result = await service.resolveAuthorities({
      workflowKey: "leave.annual",
      requesterEmployeeId: "44444444-4444-4444-8444-444444444444",
      effectiveDate: "2026-08-26",
      legacy: {
        directManagerEmployeeId: "55555555-5555-4555-8555-555555555555",
        unitApproverEmployeeId: "66666666-6666-4666-8666-666666666666",
      },
      authorityRequirement: "LINE_AND_UNIT",
    });

    expect(getRolloutMode).not.toHaveBeenCalled();
    expect(resolveLineAuthorities).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      mode: "STRUCTURE",
      authoritativeSource: "STRUCTURE",
      authorities: [
        { employeeId: "22222222-2222-4222-8222-222222222222" },
      ],
    });
    expect(result.shadow).toBeUndefined();
  });

  it("fails closed when Organization resolution fails instead of falling back", async () => {
    const getRolloutMode = vi.fn().mockResolvedValue("LEGACY");
    const resolveLineAuthorities = vi.fn().mockRejectedValue(new Error("structure incomplete"));
    const resolver = { resolveLineAuthorities } as unknown as OrganizationAuthorityResolver;
    const service = new OrganizationRolloutService({ getRolloutMode }, resolver);

    await expect(service.resolveAuthorities({
      workflowKey: "leave.annual",
      requesterEmployeeId: "77777777-7777-4777-8777-777777777777",
      effectiveDate: "2026-08-26",
      legacy: {
        directManagerEmployeeId: "88888888-8888-4888-8888-888888888888",
        unitApproverEmployeeId: "99999999-9999-4999-8999-999999999999",
      },
      authorityRequirement: "LINE_AND_UNIT",
    })).rejects.toThrow("structure incomplete");

    expect(getRolloutMode).not.toHaveBeenCalled();
  });
});
