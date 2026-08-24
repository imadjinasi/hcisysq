import { describe, expect, it } from "vitest";

import { organizationNodeTypeLabel } from "@/lib/organizationCanvas";

describe("YSQ organization vocabulary", () => {
  it("uses the compact creation vocabulary while retaining readable legacy node types", () => {
    expect(organizationNodeTypeLabel("FOUNDATION")).toBe("Yayasan");
    expect(organizationNodeTypeLabel("DIRECTORATE")).toBe("Bidang");
    expect(organizationNodeTypeLabel("UNIT")).toBe("Unit / Lembaga");
    expect(organizationNodeTypeLabel("DIVISION")).toBe("Bagian / Fungsi");
    expect(organizationNodeTypeLabel("SCHOOL")).toBe("Unit / Lembaga · Sekolah");
    expect(organizationNodeTypeLabel("DEPARTMENT")).toBe("Bagian / Fungsi");
  });
});
