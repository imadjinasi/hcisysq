import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HolderAssignmentEditor } from "@/pages/AdminOrganizationPage";
import type {
  OrganizationAccountOption,
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
