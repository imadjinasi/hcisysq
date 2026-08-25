import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureOrganizationApprovalReporting,
  getOrganizationDesignerView,
  configureOrganizationLeader,
  replaceOrganizationIncumbencies,
  updateOrganizationPosition,
  validateOrganizationDraft,
  reopenOrganizationDraft,
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

  it("uses the focused server operation to reopen a validated revision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "draft-1", status: "DRAFT" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await reopenOrganizationDraft("draft-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/organization/designer/drafts/draft-1/reopen",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("replaces a governance incumbent and holder source atomically", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await replaceOrganizationIncumbencies("draft-1", {
      positionKey: "position-1",
      holderSource: "ACCOUNT",
      primaryEmployeeId: null,
      primaryAccountId: "account-1",
      effectiveFrom: "2027-01-01",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/organization/designer/drafts/draft-1/incumbencies",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          positionKey: "position-1",
          holderSource: "ACCOUNT",
          primaryEmployeeId: null,
          primaryAccountId: "account-1",
          effectiveFrom: "2027-01-01",
        }),
      }),
    );
  });

  it("uses the focused draft-only leader operation rather than composing technical mutations in the UI", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "position-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await configureOrganizationLeader("draft-1", {
      nodeKey: "node-1", positionKey: "position-1", holderSource: "EMPLOYEE",
      primaryEmployeeId: "employee-1", assignmentType: "SECONDARY", parentPositionKey: null,
      effectiveFrom: "2027-01-01",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/organization/designer/drafts/draft-1/leader",
      expect.objectContaining({ method: "PUT", body: expect.stringContaining('"assignmentType":"SECONDARY"') }),
    );
  });

  it("uses one atomic guided operation for explicit Approval & Reporting relationships", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ changedRelationships: ["UNIT_APPROVER"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await configureOrganizationApprovalReporting("draft-1", {
      sourceType: "NODE",
      sourceKey: "node-1",
      leaderPositionKey: "leader-1",
      reportsToPositionKey: "parent-1",
      unitApproverPositionKey: "approver-1",
      effectiveFrom: "2027-01-01",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/organization/designer/drafts/draft-1/approval-reporting",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"unitApproverPositionKey":"approver-1"'),
      }),
    );
  });
});
