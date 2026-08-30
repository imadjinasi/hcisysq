import { describe, expect, it } from "vitest";

import {
  normalizeMappingName,
  rankMappingCandidates,
  scoreMappingNameSimilarity,
} from "../src/modules/attendance/adms/mapping-assistant.js";

const employees = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    employeeNumber: "EMP-001",
    fullName: "Muhammad Kamal Faza",
    unitName: "SDIT",
    positionName: "Guru",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    employeeNumber: "EMP-002",
    fullName: "Muhammad Faza Kamal",
    unitName: "Tahfizh",
    positionName: "Musyrif",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    employeeNumber: "EMP-003",
    fullName: "Siti Aminah",
    unitName: "SDIT",
    positionName: "Guru",
  },
];

describe("ATT-005 mapping assistant name similarity", () => {
  it("normalizes case, separators, whitespace, and combining marks without touching identifiers", () => {
    expect(normalizeMappingName("  MUHAMMAD--Kamal   Faza ")).toBe("muhammad kamal faza");
    expect(normalizeMappingName("Nur A\u0301isyah")).toBe("nur aisyah");
  });

  it("gives exact normalized names score 100", () => {
    expect(scoreMappingNameSimilarity("Muhammad Kamal Faza", "MUHAMMAD KAMAL FAZA")).toBe(100);
  });

  it("keeps reordered same-name tokens above unrelated employees", () => {
    const ranked = rankMappingCandidates("Muhammad Kamal Faza", employees);
    expect(ranked.map((item) => item.employeeNumber)).toEqual(["EMP-001", "EMP-002"]);
    expect(ranked[0]).toMatchObject({ similarity: 100, matchKind: "exact_name" });
    expect(ranked[1]!.similarity).toBeGreaterThanOrEqual(80);
  });

  it("does not emit unrelated low-similarity candidates", () => {
    expect(rankMappingCandidates("Budi Santoso", employees)).toEqual([]);
  });

  it("does not rank anything when the device name is unavailable", () => {
    expect(rankMappingCandidates("   ", employees)).toEqual([]);
  });
});
