import type {
  RolloutAuthorityInput,
  RolloutAuthorityResult,
} from "./domain.js";
import { effectiveDateOrToday } from "./jakarta-date.js";
import type { OrganizationAuthorityResolver } from "./resolver.js";

export class OrganizationRolloutService {
  constructor(
    private readonly resolver: OrganizationAuthorityResolver,
  ) {}

  async resolveAuthorities(input: RolloutAuthorityInput): Promise<RolloutAuthorityResult> {
    const effectiveDate = effectiveDateOrToday(input.effectiveDate);
    const structure = await this.resolver.resolveLineAuthorities(
      { ...input, effectiveDate },
      input.authorityRequirement ?? "LINE_AND_UNIT",
    );

    return {
      authoritativeSource: "STRUCTURE",
      authorities: structure.authorities,
    };
  }
}
