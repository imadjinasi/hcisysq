import { describe, expect, it } from "vitest";

import { employeeLifecycleLabel, mappedEmployeeNeedsReview } from "./admsUserState";

describe("ADMS mapped employee review state", () => {
  it("flags only explicit mapped inactive or resigned employees", () => {
    expect(mappedEmployeeNeedsReview({ mappingId: "m1", employeeId: "e1", employeeStatus: "inactive" })).toBe(true);
    expect(mappedEmployeeNeedsReview({ mappingId: "m1", employeeId: "e1", employeeStatus: "resigned" })).toBe(true);
    expect(mappedEmployeeNeedsReview({ mappingId: "m1", employeeId: "e1", employeeStatus: "active" })).toBe(false);
    expect(mappedEmployeeNeedsReview({ mappingId: "m1", employeeId: "e1", employeeStatus: null })).toBe(false);
    expect(mappedEmployeeNeedsReview({ mappingId: null, employeeId: "e1", employeeStatus: "inactive" })).toBe(false);
    expect(mappedEmployeeNeedsReview({ mappingId: "m1", employeeId: null, employeeStatus: "inactive" })).toBe(false);
  });

  it("uses human-readable lifecycle labels without guessing unknown status", () => {
    expect(employeeLifecycleLabel("active")).toBe("Pegawai aktif");
    expect(employeeLifecycleLabel("inactive")).toBe("Pegawai nonaktif");
    expect(employeeLifecycleLabel("resigned")).toBe("Pegawai resign");
    expect(employeeLifecycleLabel(null)).toBe("Status pegawai belum diketahui");
  });
});
