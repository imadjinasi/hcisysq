import { describe, expect, it } from "vitest";

import { summarizeAdmsMappingReview } from "./admsMappingReview";
import type { AdmsMappingAssistantItem } from "./admsAdmin";

function item(
  pin: string,
  eventCount: number,
  matchKind: "exact_name" | "close_name" | "possible_name" | null,
  similarity = 0,
): AdmsMappingAssistantItem {
  return {
    pin,
    eventCount,
    firstEventAt: null,
    lastEventAt: null,
    rosterDisplayName: matchKind ? `Synthetic ${pin}` : null,
    cardNumber: null,
    privilege: null,
    verifyMode: null,
    rosterObservedAt: null,
    rosterSourceRequestId: null,
    requiresUserInfo: !matchKind,
    candidates: matchKind
      ? [{
          id: `employee-${pin}`,
          employeeNumber: `EMP-${pin}`,
          fullName: `Synthetic Employee ${pin}`,
          unitName: null,
          positionName: null,
          similarity,
          matchKind,
        }]
      : [],
  };
}

describe("ADMS mapping review summary", () => {
  it("groups recommendations without turning similarity into automatic identity", () => {
    const summary = summarizeAdmsMappingReview([
      item("100", 2, null),
      item("200", 5, "close_name", 82),
      item("300", 1, "exact_name", 100),
      item("400", 12, "possible_name", 55),
    ]);

    expect(summary).toMatchObject({
      totalUnmapped: 4,
      exactNameRecommendations: 1,
      fuzzyNameRecommendations: 2,
      withoutRecommendation: 1,
    });
    expect(summary.priorityItems.map((entry) => entry.pin)).toEqual(["300", "200", "400", "100"]);
  });
});
