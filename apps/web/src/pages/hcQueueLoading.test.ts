import { describe, expect, it } from "vitest";

import { AttendanceResolutionApiError } from "@/lib/attendanceResolution";
import {
  resolveHcAdministrationQueue,
  resolveHcAttendanceQueue,
} from "@/lib/hcQueueState";

const forbidden = () =>
  Promise.reject(
    new AttendanceResolutionApiError(
      403,
      "HC_FORBIDDEN",
      "Akun tidak memiliki akses Human Capital scope organisasi.",
    ),
  );

describe("HC queue terminal error states", () => {
  it("terminates the leave administration loading state on 403", async () => {
    await expect(resolveHcAdministrationQueue(forbidden)).resolves.toEqual({
      status: "error",
      message: "Akun tidak memiliki akses Human Capital scope organisasi.",
    });
  });

  it("terminates the attendance-resolution loading state on 403", async () => {
    await expect(resolveHcAttendanceQueue(forbidden)).resolves.toEqual({
      status: "error",
      message: "Akun tidak memiliki akses Human Capital scope organisasi.",
    });
  });
});
