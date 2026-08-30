export type MappingAssistantEmployee = {
  id: string;
  employeeNumber: string;
  fullName: string;
  unitName: string | null;
  positionName: string | null;
};

export type MappingAssistantCandidate = MappingAssistantEmployee & {
  similarity: number;
  matchKind: "exact_name" | "close_name" | "possible_name";
};

export function normalizeMappingName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenJaccard(left: string, right: string) {
  const a = new Set(left.split(" ").filter(Boolean));
  const b = new Set(right.split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function bigramSet(value: string) {
  const compact = value.replace(/\s+/g, "");
  const grams = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.add(compact.slice(index, index + 2));
  }
  return grams;
}

function bigramDice(left: string, right: string) {
  const a = bigramSet(left);
  const b = bigramSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection += 1;
  }
  return (2 * intersection) / (a.size + b.size);
}

export function scoreMappingNameSimilarity(deviceName: string, employeeName: string) {
  const left = normalizeMappingName(deviceName);
  const right = normalizeMappingName(employeeName);
  if (!left || !right) return 0;
  if (left === right) return 100;

  const tokenScore = tokenJaccard(left, right);
  const characterScore = bigramDice(left, right);
  return Math.round((tokenScore * 0.6 + characterScore * 0.4) * 100);
}

export function rankMappingCandidates(
  deviceName: string,
  employees: MappingAssistantEmployee[],
  input: { limit?: number; minimumSimilarity?: number } = {},
): MappingAssistantCandidate[] {
  const limit = input.limit ?? 5;
  const minimumSimilarity = input.minimumSimilarity ?? 35;
  if (!normalizeMappingName(deviceName)) return [];

  return employees
    .map((employee) => {
      const similarity = scoreMappingNameSimilarity(deviceName, employee.fullName);
      return {
        ...employee,
        similarity,
        matchKind: similarity === 100
          ? "exact_name" as const
          : similarity >= 80
            ? "close_name" as const
            : "possible_name" as const,
      };
    })
    .filter((candidate) => candidate.similarity >= minimumSimilarity)
    .sort((left, right) =>
      right.similarity - left.similarity ||
      left.fullName.localeCompare(right.fullName, "id-ID") ||
      left.employeeNumber.localeCompare(right.employeeNumber, "id-ID"),
    )
    .slice(0, limit);
}
