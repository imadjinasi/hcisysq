import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ApprovalReportingEditor,
  HolderAssignmentEditor,
  LeaderEditor,
  PositionPicker,
} from "@/pages/AdminOrganizationPage";
import type {
  OrganizationAccountOption,
  OrganizationDesignerView,
  OrganizationEmployeeOption,
  OrganizationPosition,
} from "@/lib/organizationDesigner";

const position: OrganizationPosition = {
  id: "position-id",
  stableKey: "secretary",
  nodeKey: "foundation",
  title: "Secretary of the Foundation",
  parentPositionKey: null,
  singleIncumbent: true,
  vacancyPolicy: "BLOCK",
  active: true,
  effectiveFrom: "2027-01-01",
  effectiveTo: null,
  visualRankOffset: 0,
  holderSource: "ACCOUNT",
  primaryIncumbent: null,
  actingIncumbent: null,
};

const employees: OrganizationEmployeeOption[] = [{
  id: "employee-id",
  employeeNumber: "YSQ-SYN-001",
  fullName: "Pegawai Sintetis",
  unitName: "Unit Sintetis",
  positionName: "Staf",
  status: "active",
}];

const accounts: OrganizationAccountOption[] = [{
  id: "account-id",
  email: "secretary@example.test",
  principalType: "FOUNDATION_BOARD",
  status: "active",
}];

function renderEditor(holderSource: "EMPLOYEE" | "ACCOUNT") {
  return renderToStaticMarkup(
    <HolderAssignmentEditor
      position={{ ...position, holderSource }}
      acting={false}
      employees={employees}
      accounts={accounts}
      effectiveOn="2027-01-01"
      saving={false}
      onCancel={() => undefined}
      onSubmit={() => undefined}
    />,
  );
}

describe("source-aware organization holder assignment", () => {
  it("shows eligible governance accounts by email, principal, and status", () => {
    const html = renderEditor("ACCOUNT");

    expect(html).toContain('data-holder-source="ACCOUNT"');
    expect(html).toContain('name="accountId"');
    expect(html).toContain("secretary@example.test — FOUNDATION_BOARD · active");
    expect(html).not.toContain('name="employeeId"');
  });

  it("keeps employee positions on the employee selector", () => {
    const html = renderEditor("EMPLOYEE");

    expect(html).toContain('data-holder-source="EMPLOYEE"');
    expect(html).toContain('name="employeeId"');
    expect(html).toContain("Pegawai Sintetis — YSQ-SYN-001");
    expect(html).not.toContain('name="accountId"');
  });
});

describe("organization position picker", () => {
  it("keeps stable keys while showing structural and holder context", () => {
    const html = renderToStaticMarkup(
      <PositionPicker
        name="targetPositionKey"
        positions={[{ ...position, title: "Kepala", holderSource: "EMPLOYEE", primaryIncumbent: {
          employeeId: "employee-id", employeeName: "Pegawai Sintetis", effectiveFrom: "2027-01-01", effectiveTo: null,
        } }]}
        nodes={[
          { id: "root", stableKey: "root", name: "Bidang Operasional", nodeType: "DIRECTORATE", parentNodeKey: null, active: true, effectiveFrom: "2027-01-01", effectiveTo: null, visualRankOffset: 0, integrationCode: null, memberCount: 0, leaderPositionKey: null },
          { id: "foundation", stableKey: "foundation", name: "Human Capital", nodeType: "DIVISION", parentNodeKey: "root", active: true, effectiveFrom: "2027-01-01", effectiveTo: null, visualRankOffset: 0, integrationCode: null, memberCount: 0, leaderPositionKey: null },
        ]}
      />,
    );
    expect(html).toContain('name="targetPositionKey"');
    expect(html).toContain("Bidang Operasional / Human Capital");
    expect(html).toContain("Pegawai Sintetis");
    expect(html).toContain("Cari jabatan, struktur, atau pejabat");
  });
});

const designerData: OrganizationDesignerView = {
  viewDate: "2027-01-01",
  mode: "DRAFT",
  draft: {
    id: "draft-1", name: "Synthetic", effectiveOn: "2027-01-01", status: "DRAFT",
    validationReport: null, createdAt: "2026-08-25T00:00:00.000Z", validatedAt: null,
    publishedAt: null, baseChangeSetId: "published-1",
  },
  nodes: [
    { id: "root", stableKey: "root", name: "YSQ", nodeType: "FOUNDATION", parentNodeKey: null, active: true, effectiveFrom: "2027-01-01", effectiveTo: null, visualRankOffset: 0, integrationCode: null, memberCount: 0, leaderPositionKey: null },
    { id: "unit", stableKey: "unit", name: "SDIT", nodeType: "UNIT", parentNodeKey: "root", active: true, effectiveFrom: "2027-01-01", effectiveTo: null, visualRankOffset: 0, integrationCode: null, memberCount: 20, leaderPositionKey: "head" },
  ],
  positions: [
    { ...position, id: "head-id", stableKey: "head", nodeKey: "unit", title: "Kepala", holderSource: "EMPLOYEE", primaryIncumbent: { employeeId: "employee-id", employeeName: "Pegawai Sintetis", effectiveFrom: "2027-01-01", effectiveTo: null, isPrimaryStructural: true } },
    { ...position, id: "parent-id", stableKey: "parent", nodeKey: "root", title: "Kepala", holderSource: "EMPLOYEE", primaryIncumbent: null },
  ],
  memberships: [], assignments: [],
  bindings: [
    { id: "leader-binding", sourceType: "NODE", sourceKey: "unit", authorityType: "LEADER", targetPositionKey: "head", vacancyPolicy: "CLIMB_TO_PARENT", effectiveFrom: "2027-01-01", effectiveTo: null },
    { id: "unit-binding", sourceType: "NODE", sourceKey: "unit", authorityType: "UNIT_APPROVER", targetPositionKey: "head", vacancyPolicy: "BLOCK", effectiveFrom: "2027-01-01", effectiveTo: null },
    { id: "reports-binding", sourceType: "POSITION", sourceKey: "head", authorityType: "SUPERVISORY_PARENT", targetPositionKey: "parent", vacancyPolicy: "CLIMB_TO_PARENT", effectiveFrom: "2027-01-01", effectiveTo: null },
  ],
  reportingOverrides: [],
};

describe("guided organization administration", () => {
  it("shows human-facing Approval & Reporting fields while keeping raw authority names out", () => {
    const html = renderToStaticMarkup(
      <ApprovalReportingEditor
        item={designerData.nodes[1]!}
        kind="node"
        data={designerData}
        saving={false}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Pimpinan struktur");
    expect(html).toContain("Atasan posisi");
    expect(html).toContain("Penyetuju unit");
    expect(html).toContain("Pegawai Sintetis");
    expect(html).not.toContain("UNIT_APPROVER");
    expect(html).not.toContain("SUPERVISORY_PARENT");
  });

  it("shows the current leader and progressive employee/account/VACANT choices", () => {
    const html = renderToStaticMarkup(
      <LeaderEditor
        node={designerData.nodes[1]!}
        data={designerData}
        employees={employees}
        accounts={accounts}
        saving={false}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Pimpinan saat ini");
    expect(html).toContain("Pegawai Sintetis");
    expect(html).toContain("Pertahankan pejabat saat ini");
    expect(html).toContain("Organ Yayasan");
    expect(html).toContain("VACANT · belum ada pejabat");
    expect(html).toContain("Atasan struktural belum ditetapkan");
  });
});
