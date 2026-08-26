import { describe, expect, it } from "vitest";
import { employeeLifecycleLabel } from "../lib/employeeMasterLifecycle";

describe("Employee Master lifecycle labels", () => {
  it("labels removed employees independently from employment status", () => {
    expect(employeeLifecycleLabel("active","2026-08-26T00:00:00.000Z")).toBe("Dikeluarkan dari HCIS");
    expect(employeeLifecycleLabel("resigned",null)).toBe("Keluar");
    expect(employeeLifecycleLabel("inactive",null)).toBe("Tidak aktif");
  });
});
