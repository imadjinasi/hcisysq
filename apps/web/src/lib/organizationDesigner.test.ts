import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getOrganizationDesignerView,
  updateOrganizationPosition,
  validateOrganizationDraft,
} from "@/lib/organizationDesigner";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Organization Designer API client", () => {
  it("requests an effective-dated draft chart", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ nodes: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getOrganizationDesignerView({ effectiveDate: "2027-01-01", draftId: "draft-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/organization/designer?effectiveDate=2027-01-01&draftId=draft-1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("sends visual-rank changes only as position presentation metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "position-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateOrganizationPosition("draft-1", "position-1", { visualRankOffset: 2 });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/organization/designer/drafts/draft-1/positions/position-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ visualRankOffset: 2 }),
      }),
    );
  });

  it("uses the server validation endpoint instead of validating authority client-side", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ valid: true, issues: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(validateOrganizationDraft("draft-1")).resolves.toEqual({ valid: true, issues: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/organization/designer/drafts/draft-1/validate",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
