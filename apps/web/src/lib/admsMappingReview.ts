import type { AdmsMappingAssistantItem } from "@/lib/admsAdmin";

export interface AdmsMappingReviewSummary {
  totalUnmapped: number;
  exactNameRecommendations: number;
  fuzzyNameRecommendations: number;
  withoutRecommendation: number;
  priorityItems: AdmsMappingAssistantItem[];
}

function bestSimilarity(item: AdmsMappingAssistantItem) {
  return item.candidates[0]?.similarity ?? -1;
}

export function summarizeAdmsMappingReview(items: AdmsMappingAssistantItem[]): AdmsMappingReviewSummary {
  let exactNameRecommendations = 0;
  let fuzzyNameRecommendations = 0;
  let withoutRecommendation = 0;

  for (const item of items) {
    const best = item.candidates[0];
    if (!best) withoutRecommendation += 1;
    else if (best.matchKind === "exact_name") exactNameRecommendations += 1;
    else fuzzyNameRecommendations += 1;
  }

  const priorityItems = [...items].sort((left, right) => {
    const leftBest = left.candidates[0];
    const rightBest = right.candidates[0];
    const leftRank = leftBest?.matchKind === "exact_name" ? 0 : leftBest ? 1 : 2;
    const rightRank = rightBest?.matchKind === "exact_name" ? 0 : rightBest ? 1 : 2;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (bestSimilarity(left) !== bestSimilarity(right)) return bestSimilarity(right) - bestSimilarity(left);
    if (left.eventCount !== right.eventCount) return right.eventCount - left.eventCount;
    return left.pin.localeCompare(right.pin, "id", { numeric: true });
  });

  return {
    totalUnmapped: items.length,
    exactNameRecommendations,
    fuzzyNameRecommendations,
    withoutRecommendation,
    priorityItems,
  };
}
