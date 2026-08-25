// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/organization/OrganizationChart", () => ({
  OrganizationChart: ({ toolbarContext, toolbarActions }: { toolbarContext: ReactNode; toolbarActions: ReactNode }) => (
    <div data-testid="organization-chart"><div>{toolbarContext}</div><div>{toolbarActions}</div></div>
  ),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentSession: vi.fn().mockResolvedValue({ principal: { id: "admin", email: "admin@example.test", principalType: "SUPER_ADMIN" } }),
  logout: vi.fn(),
}));

vi.mock("@/lib/organizationDesigner", async () => {
  const actual = await vi.importActual<typeof import("@/lib/organizationDesigner")>("@/lib/organizationDesigner");
  return {
    ...actual,
    getOrganizationDesignerView: vi.fn(),
    listOrganizationRevisions: vi.fn(),
    listOrganizationEmployees: vi.fn(),
    listFoundationBoardAccounts: vi.fn(),
    getOrganizationRollout: vi.fn(),
    previewOrganizationResolution: vi.fn(),
    discardOrganizationDraft: vi.fn(),
    reopenOrganizationDraft: vi.fn(),
  };
});

import { AdminOrganizationPage } from "@/pages/AdminOrganizationPage";
import {
  discardOrganizationDraft,
  getOrganizationDesignerView,
  listFoundationBoardAccounts,
  listOrganizationEmployees,
  listOrganizationRevisions,
  getOrganizationRollout,
  previewOrganizationResolution,
  reopenOrganizationDraft,
  type OrganizationDesignerView,
  type OrganizationRevision,
} from "@/lib/organizationDesigner";
import { ORGANIZATION_LAST_REVISION_KEY } from "@/lib/organizationWorkspace";

const revisions: OrganizationRevision[] = [
  { id: "draft-a", name: "Konfigurasi A", status: "DRAFT", effectiveOn: "2026-08-25", createdAt: "2026-08-25T01:00:00Z", validatedAt: null, publishedAt: null, baseChangeSetId: "published" },
  { id: "validated-b", name: "Konfigurasi B", status: "VALIDATED", effectiveOn: "2026-09-01", createdAt: "2026-08-25T02:00:00Z", validatedAt: "2026-08-25T03:00:00Z", publishedAt: null, baseChangeSetId: "published" },
  { id: "published", name: "Struktur aktif", status: "PUBLISHED", effectiveOn: "2026-08-24", createdAt: "2026-08-24T01:00:00Z", validatedAt: "2026-08-24T02:00:00Z", publishedAt: "2026-08-24T03:00:00Z", baseChangeSetId: null },
];

function viewFor(revision: OrganizationRevision | undefined): OrganizationDesignerView {
  return {
    viewDate: revision?.effectiveOn ?? "2026-08-26",
    mode: revision?.status === "PUBLISHED" ? "CURRENT" : "DRAFT",
    draft: revision ? { ...revision, validationReport: null } : null,
    nodes: [], positions: [], memberships: [], assignments: [], bindings: [], reportingOverrides: [],
  };
}

function renderWorkspace(initialEntry: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const organization = createRoute({
    getParentRoute: () => root,
    path: "/admin/organization",
    validateSearch: (search: Record<string, unknown>) => ({
      effectiveDate: typeof search.effectiveDate === "string" ? search.effectiveDate : undefined,
      revisionId: typeof search.revisionId === "string" ? search.revisionId : undefined,
      draftId: typeof search.draftId === "string" ? search.draftId : undefined,
    }),
    component: AdminOrganizationPage,
  });
  const attendance = createRoute({
    getParentRoute: () => root,
    path: "/admin/attendance",
    component: () => <Link to="/admin/organization" search={{ effectiveDate: undefined, revisionId: undefined, draftId: undefined }}>Kembali ke Organization</Link>,
  });
  const router = createRouter({ routeTree: root.addChildren([organization, attendance]), history: createMemoryHistory({ initialEntries: [initialEntry] }) });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(listOrganizationRevisions).mockResolvedValue(revisions);
  vi.mocked(listOrganizationEmployees).mockResolvedValue([{ id: "employee", employeeNumber: "SYN-1", fullName: "Pegawai Sintetis", unitName: null, positionName: null }]);
  vi.mocked(listFoundationBoardAccounts).mockResolvedValue([]);
  vi.mocked(getOrganizationRollout).mockResolvedValue({ mode: "LEGACY" });
  vi.mocked(getOrganizationDesignerView).mockImplementation(async ({ revisionId }) => viewFor(revisions.find((item) => item.id === revisionId)));
  vi.mocked(previewOrganizationResolution).mockResolvedValue({ employee: { id: "employee", fullName: "Hasil Preview Sintetis" }, effectiveDate: "2026-08-25", workflowKey: "LEAVE", steps: [], warnings: [] });
  vi.mocked(discardOrganizationDraft).mockResolvedValue(undefined);
  vi.mocked(reopenOrganizationDraft).mockResolvedValue({ ...revisions[0]!, validationReport: null });
  vi.stubGlobal("confirm", vi.fn(() => true));
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Organization revision workspace interactions", () => {
  it("canonicalizes a legacy deep link and keeps the concrete revision date authoritative", async () => {
    const router = renderWorkspace("/admin/organization?draftId=draft-a&effectiveDate=2030-01-01");
    await screen.findByText("Konfigurasi A");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ revisionId: "draft-a", effectiveDate: "2026-08-25" }));
    expect(router.state.location.search.draftId).toBeUndefined();
    expect(screen.queryByLabelText("Lihat struktur diterbitkan pada tanggal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ganti revisi" })).toBeInTheDocument();
  });

  it("resumes the same working revision after navigating away and returning", async () => {
    renderWorkspace("/admin/organization?revisionId=draft-a&effectiveDate=2026-08-25");
    await screen.findByText("Konfigurasi A");
    await userEvent.click(screen.getByRole("link", { name: "Kehadiran" }));
    await userEvent.click(await screen.findByRole("link", { name: "Kembali ke Organization" }));
    expect(await screen.findByText("Konfigurasi A")).toBeInTheDocument();
    expect(sessionStorage.getItem(ORGANIZATION_LAST_REVISION_KEY)).toBe("draft-a");
  });

  it("preserves the working revision across a remount that represents browser refresh", async () => {
    const router = renderWorkspace("/admin/organization?revisionId=draft-a&effectiveDate=2026-08-25");
    await screen.findByText("Konfigurasi A");
    const href = router.state.location.href;
    cleanup();
    renderWorkspace(href);
    expect(await screen.findByText("Konfigurasi A")).toBeInTheDocument();
    expect(sessionStorage.getItem(ORGANIZATION_LAST_REVISION_KEY)).toBe("draft-a");
  });

  it("restores the correct revision with browser back and forward", async () => {
    const router = renderWorkspace("/admin/organization?revisionId=draft-a&effectiveDate=2026-08-25");
    await screen.findByText("Konfigurasi A");
    await userEvent.click(screen.getByRole("button", { name: "Ganti revisi" }));
    const validatedCard = (await screen.findByText("Konfigurasi B")).closest("article");
    await userEvent.click(within(validatedCard!).getByRole("button", { name: "Lanjutkan" }));
    await waitFor(() => expect(router.state.location.search.revisionId).toBe("validated-b"));
    router.history.back();
    await waitFor(() => expect(router.state.location.search.revisionId).toBe("draft-a"));
    expect(await screen.findByText("Konfigurasi A")).toBeInTheDocument();
    router.history.forward();
    await waitFor(() => expect(router.state.location.search.revisionId).toBe("validated-b"));
  });

  it("shows a chooser for multiple unfinished revisions instead of selecting one", async () => {
    renderWorkspace("/admin/organization");
    expect(await screen.findByText("Revisi belum selesai")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Lanjutkan" })).toHaveLength(2);
    expect(sessionStorage.getItem(ORGANIZATION_LAST_REVISION_KEY)).toBeNull();
  });

  it("clears revision diagnostics when switching and supports preview on validated/published snapshots", async () => {
    renderWorkspace("/admin/organization?revisionId=validated-b&effectiveDate=2026-09-01");
    await screen.findByText("Konfigurasi B");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "" }), "employee");
    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Hasil Preview Sintetis")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ganti revisi" }));
    const historyButton = await screen.findByRole("button", { name: /Struktur aktif/ });
    await userEvent.click(historyButton);
    await screen.findByText("Struktur aktif");
    expect(screen.queryByText("Hasil Preview Sintetis")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Diterbitkan/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("shows employee loading failure with retry", async () => {
    vi.mocked(listOrganizationEmployees).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    renderWorkspace("/admin/organization?revisionId=draft-a&effectiveDate=2026-08-25");
    expect(await screen.findByText("Daftar pegawai tidak dapat dimuat.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(listOrganizationEmployees).toHaveBeenCalledTimes(2));
  });

  it("reopens VALIDATED in place while preserving the preview employee selection", async () => {
    const draftAfterReopen = { ...revisions[1]!, status: "DRAFT" as const };
    vi.mocked(getOrganizationDesignerView)
      .mockResolvedValueOnce(viewFor(revisions[1]))
      .mockResolvedValue(viewFor(draftAfterReopen));
    vi.mocked(listOrganizationRevisions)
      .mockResolvedValueOnce(revisions)
      .mockResolvedValue([revisions[0]!, draftAfterReopen, revisions[2]!]);
    const router = renderWorkspace("/admin/organization?revisionId=validated-b&effectiveDate=2026-09-01");
    await screen.findByText("Konfigurasi B");
    const selector = screen.getByRole("combobox");
    await userEvent.selectOptions(selector, "employee");
    await userEvent.click(screen.getByRole("button", { name: "Koreksi lagi" }));
    await waitFor(() => expect(reopenOrganizationDraft).toHaveBeenCalledWith("validated-b"));
    expect(router.state.location.search.revisionId).toBe("validated-b");
    expect(screen.getByRole("combobox")).toHaveValue("employee");
    expect(await screen.findByText("Draft")).toBeInTheDocument();
  });

  it("requires typing the DRAFT revision name and offers no direct validated discard", async () => {
    renderWorkspace("/admin/organization?revisionId=draft-a&effectiveDate=2026-08-25");
    await screen.findByText("Konfigurasi A");
    await userEvent.click(screen.getByText("Lainnya"));
    await userEvent.click(screen.getByRole("button", { name: "Buang revisi" }));
    const dialog = screen.getByRole("dialog");
    const destructive = within(dialog).getByRole("button", { name: "Buang revisi permanen" });
    expect(destructive).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox"), "Konfigurasi A");
    expect(destructive).toBeEnabled();
    await userEvent.click(destructive);
    await waitFor(() => expect(discardOrganizationDraft).toHaveBeenCalledWith("draft-a"));

    cleanup();
    renderWorkspace("/admin/organization?revisionId=validated-b&effectiveDate=2026-09-01");
    await screen.findByText("Konfigurasi B");
    expect(screen.queryByText("Lainnya")).not.toBeInTheDocument();
  });

  it("offers recovery instead of substituting an invalid remembered revision", async () => {
    sessionStorage.setItem(ORGANIZATION_LAST_REVISION_KEY, "missing");
    renderWorkspace("/admin/organization?revisionId=missing");
    expect(await screen.findByText("Revisi ini sudah tidak tersedia.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buka revisi lain" })).toBeInTheDocument();
    expect(sessionStorage.getItem(ORGANIZATION_LAST_REVISION_KEY)).toBeNull();
  });
});
