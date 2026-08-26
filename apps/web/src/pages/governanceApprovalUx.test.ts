import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  leaveApprovalSourceLabel,
  type AnnualLeavePreview,
} from "@/lib/employeeLeave";
import type { PlannedLeavePreview } from "@/lib/plannedLeave";

const routerSource = readFileSync(new URL("../router.tsx", import.meta.url), "utf8");
const boardApprovalSource = readFileSync(new URL("./FoundationBoardApprovalsPage.tsx", import.meta.url), "utf8");
const boardDashboardSource = readFileSync(new URL("./FoundationBoardPage.tsx", import.meta.url), "utf8");
const adminAccessSource = readFileSync(new URL("./AdminAccessPage.tsx", import.meta.url), "utf8");

describe("governance approval route and inbox UX", () => {
  it("guards the Board route separately and keeps employee approvals Employee-only", () => {
    expect(routerSource).toMatch(/path: "\/board\/approvals"[\s\S]*?requirePrincipal\("FOUNDATION_BOARD"\)/);
    expect(routerSource).toMatch(/path: "\/app\/approvals"[\s\S]*?requirePrincipal\("EMPLOYEE"\)/);
    expect(boardDashboardSource).toContain('href="/board/approvals"');
    expect(boardDashboardSource).toContain("Persetujuan Cuti");
  });

  it("loads only the shared exact-principal inbox without an Employee summary dependency", () => {
    expect(boardApprovalSource).toContain("getLeaveApprovalInbox");
    expect(boardApprovalSource).toContain("decideLeaveApproval");
    expect(boardApprovalSource).not.toContain("getEmployeeLeaveSummary");
    expect(boardApprovalSource).toContain('href="/board"');
    expect(boardApprovalSource).toContain("Tidak ada persetujuan yang menunggu");
  });

  it("renders the governance source with Indonesian business language", () => {
    expect(leaveApprovalSourceLabel(["GOVERNANCE_APPROVER"])).toBe("Penyetuju Pengurus Yayasan");
  });
});

describe("shared Leave approval principal contract", () => {
  it("supports account principals in annual and planned preview contracts", () => {
    const governanceStep = {
      principalType: "ACCOUNT" as const,
      employeeId: null,
      accountId: "synthetic-board-account",
      name: "Penyetuju Pengurus Yayasan",
      sources: ["GOVERNANCE_APPROVER" as const],
    };
    const annual = { approvalChain: [governanceStep] } as AnnualLeavePreview;
    const planned = { approvalChain: [governanceStep] } as PlannedLeavePreview;
    expect(annual.approvalChain[0]).toMatchObject({ employeeId: null, accountId: "synthetic-board-account" });
    expect(planned.approvalChain[0]).toMatchObject({ employeeId: null, accountId: "synthetic-board-account" });
  });
});

describe("Admin Access business UX", () => {
  it("offers one fixed organization-wide governance control without raw operator choices", () => {
    expect(adminAccessSource).toContain('title="Akses & Kewenangan"');
    expect(adminAccessSource).toContain("Akses Organ Yayasan");
    expect(adminAccessSource).toContain("Penyetuju cuti Pengurus Yayasan");
    expect(adminAccessSource).toContain('scopeType: "organization"');
    expect(adminAccessSource).toContain("Detail teknis kewenangan");
    expect(adminAccessSource).not.toContain('title="Account, Role & Scope"');
    expect(adminAccessSource).not.toContain(">Scope own<");
    expect(adminAccessSource).not.toContain(">Role system<");
  });
});
