import { describe, expect, it } from "vitest";

import {
  calculateWorkingDays,
  decodeWorkingWeekdays,
  encodeWorkingWeekdays,
  WorkingCalendarError,
} from "../src/modules/leave/domain/working-calendar.js";

describe("leave working calendar", () => {
  it("counts configured weekdays without assuming a workweek", () => {
    const result = calculateWorkingDays("2026-08-17", "2026-08-23", {
      workingWeekdays: [1, 2, 3, 4, 5, 6],
    });
    expect(result.workingDays).toBe(6);
    expect(result.nonWorkingDates).toEqual(["2026-08-23"]);
  });

  it("lets explicit calendar exceptions override the weekly pattern", () => {
    const result = calculateWorkingDays("2026-08-17", "2026-08-19", {
      workingWeekdays: [1, 2, 3, 4, 5],
      exceptions: [
        { date: "2026-08-17", isWorkingDay: false },
        { date: "2026-08-18", isWorkingDay: true },
      ],
    });
    expect(result.workingDates).toEqual(["2026-08-18", "2026-08-19"]);
  });

  it("round-trips the workweek bitmask", () => {
    const mask = encodeWorkingWeekdays([1, 2, 3, 4, 5, 6]);
    expect(decodeWorkingWeekdays(mask)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("fails closed when no workweek is configured", () => {
    expect(() =>
      calculateWorkingDays("2026-08-17", "2026-08-18", {
        workingWeekdays: [],
      }),
    ).toThrowError(WorkingCalendarError);
  });
});
