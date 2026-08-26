import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=readFileSync(new URL("../src/modules/organization/admin-routes.ts",import.meta.url),"utf8");

describe("Organization employee lifecycle mutation boundaries",()=>{
  it("validates an employee leader with structural lifecycle eligibility",()=>{
    expect(source).toContain('body.data.holderSource === "EMPLOYEE" && body.data.primaryEmployeeId');
    expect(source).toContain("validateStructuralIncumbent(body.data.primaryEmployeeId)");
    expect(source).toContain("cannot be configured as organization leaders");
  });
  it("validates a reporting-override requester before creating the override",()=>{
    expect(source).toContain("validateStructuralIncumbent(body.data.employeeId)");
    expect(source).toContain("cannot receive a reporting override");
  });
});
