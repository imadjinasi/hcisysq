import { describe, expect, it } from "vitest";

import {
  classifyAdministrationDays,
  evaluateAnnualConversionOffer,
} from "../src/modules/leave/domain/attendance-resolution.js";

describe("attendance resolution policy", () => {
  it("creates unresolved dates for partial administration validation", () => {
    expect(
      classifyAdministrationDays({
        action: "validate_partial",
        workingDates: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
        validatedDates: ["2026-09-01", "2026-09-02"],
      }),
    ).toEqual({
      administrationStatus: "partially_validated",
      validatedDates: ["2026-09-01", "2026-09-02"],
      unresolvedDates: ["2026-09-03", "2026-09-04"],
    });
  });

  it("never offers annual conversion to education employees", () => {
    const offer = evaluateAnnualConversionOffer({
      entitlementGroup: "education",
      employmentStartedOn: "2024-01-01",
      unresolvedDates: ["2026-09-03", "2026-09-04"],
      usedDaysInPeriod: 0,
    });
    expect(offer.available).toBe(false);
    expect(offer.reason).toMatch(/non-pendidikan/i);
  });

  it("offers annual conversion when non-education employee is eligible and quota fits", () => {
    const offer = evaluateAnnualConversionOffer({
      entitlementGroup: "non_education",
      employmentStartedOn: "2025-01-10",
      unresolvedDates: ["2026-09-03", "2026-09-04"],
      usedDaysInPeriod: 1,
    });
    expect(offer).toMatchObject({
      available: true,
      periodKey: "JUL_SEP",
      remainingDays: 2,
      requestedDays: 2,
    });
  });

  it("blocks annual conversion when period quota is insufficient", () => {
    const offer = evaluateAnnualConversionOffer({
      entitlementGroup: "non_education",
      employmentStartedOn: "2024-01-10",
      unresolvedDates: ["2026-09-03", "2026-09-04"],
      usedDaysInPeriod: 2,
    });
    expect(offer.available).toBe(false);
    expect(offer.remainingDays).toBe(1);
  });
});
