import type {
  OrganizationRolloutMode,
  RolloutAuthorityInput,
  RolloutAuthorityResult,
} from "./domain.js";
import { effectiveDateOrToday } from "./jakarta-date.js";
import type { OrganizationAuthorityResolver } from "./resolver.js";

/**
 * Compatibility-only reader contract.
 *
 * Rollout rows may still exist in older databases, but they are no longer an
 * operational routing switch. New authority resolution is always sourced from
 * the published Organization structure.
 */
export interface OrganizationRolloutReader {
  getRolloutMode(
    workflowKey: string,
    employeeId: string,
    effectiveDate: string,
  ): Promise<OrganizationRolloutMode>;
}

export class OrganizationRolloutService {
  constructor(
    _repository: OrganizationRolloutReader,
    private readonly resolver: OrganizationAuthorityResolver,
  ) {}

  async resolveAuthorities(input: RolloutAuthorityInput): Promise<RolloutAuthorityResult> {
    const effectiveDate = effectiveDateOrToday(input.effectiveDate);
    const structure = await this.resolver.resolveLineAuthorities(
      { ...input, effectiveDate },
      input.authorityRequirement ?? "LINE_AND_UNIT",
    );

    return {
      mode: "STRUCTURE",
      authoritativeSource: "STRUCTURE",
      authorities: structure.authorities,
      structure,
    };
  }
}
