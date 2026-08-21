import { describe, expect, it } from "vitest";

import {
  isIsoDate,
  resolveAttendanceRange,
  validateAttendanceTimes,
} from "../src/modules/attendance/routes.js";

describe("ATT-001 attendance policy", () => {
  it("accepts only real ISO calendar dates", () => {
    expect(isIsoDate("2026-08-21")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("21-08-2026")).toBe(false);
  });

  it("defaults to a 30-day range ending on the reference date", () => {
    expect(resolveAttendanceRange({}, "2026-08-21")).toEqual({
      from: "2026-07-23",
      to: "2026-08-21",
    });
  });

  it("rejects reversed and over-sized ranges", () => {
    expect(() =>
      resolveAttendanceRange({ from: "2026-08-22", to: "2026-08-21" }, "2026-08-21"),
    ).toThrowError(expect.objectContaining({ code: "INVALID_ATTENDANCE_RANGE" }));

    expect(() =>
      resolveAttendanceRange({ from: "2026-06-01", to: "2026-08-21" }, "2026-08-21"),
    ).toThrowError(expect.objectContaining({ code: "ATTENDANCE_RANGE_TOO_LARGE" }));
  });

  it("allows a partial punch but rejects an empty record", () => {
    expect(() =>
      validateAttendanceTimes({
        checkInAt: "2026-08-21T07:00:00+07:00",
        checkOutAt: null,
      }),
    ).not.toThrow();

    expect(() => validateAttendanceTimes({ checkInAt: null, checkOutAt: null })).toThrowError(
      expect.objectContaining({ code: "ATTENDANCE_TIME_REQUIRED" }),
    );
  });

  it("rejects checkout before check-in while allowing overnight work", () => {
    expect(() =>
      validateAttendanceTimes({
        checkInAt: "2026-08-21T22:00:00+07:00",
        checkOutAt: "2026-08-22T06:00:00+07:00",
      }),
    ).not.toThrow();

    expect(() =>
      validateAttendanceTimes({
        checkInAt: "2026-08-21T08:00:00+07:00",
        checkOutAt: "2026-08-21T07:59:00+07:00",
      }),
    ).toThrowError(expect.objectContaining({ code: "ATTENDANCE_TIME_ORDER_INVALID" }));
  });
});
