import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "@/layouts/AppShell";

const employee = {
  name: "Pegawai Sintetis",
  initials: "PS",
  position: "Staf",
  unit: "Unit Sintetis",
};

function renderWithHcCapability(humanCapitalOrganization: boolean) {
  return renderToStaticMarkup(
    <AppShell
      user={employee}
      capabilities={{ humanCapitalOrganization }}
    >
      <div>Konten</div>
    </AppShell>,
  );
}

describe("AppShell organization-wide Human Capital navigation", () => {
  it("does not expose global HC navigation without the organization capability", () => {
    const html = renderWithHcCapability(false);

    expect(html).not.toContain('href="/app/hc/leave"');
    expect(html).not.toContain('href="/app/hc/planned-leave"');
    expect(html).not.toContain('href="/app/hc/attendance-resolution"');
  });

  it("exposes global HC navigation with the organization capability", () => {
    const html = renderWithHcCapability(true);

    expect(html).toContain('href="/app/hc/leave"');
    expect(html).toContain('href="/app/hc/planned-leave"');
    expect(html).toContain('href="/app/hc/attendance-resolution"');
  });
});

describe("AppShell mobile navigation", () => {
  it("keeps normal employees on four useful destinations without approval", () => {
    const html = renderToStaticMarkup(<AppShell user={employee}><div>Konten</div></AppShell>);

    expect(html).toContain('aria-label="Navigasi mobile pegawai"');
    expect(html).not.toContain('href="/app/approvals"');
    expect(html).toContain("Lainnya");
    expect(html).toContain('href="/app/payslips"');
    expect(html).toContain("grid-cols-4");
    expect(html).toContain("min-h-11");
    expect(html).toContain("text-xs");
  });

  it("uses the live approval capability for the fourth primary destination", () => {
    const html = renderToStaticMarkup(
      <AppShell user={employee} capabilities={{ approvalResponsibility: true }}><div>Konten</div></AppShell>,
    );

    expect(html).toContain('href="/app/approvals"');
    expect(html).toContain("Persetujuan");
    expect(html).toContain('href="/app/leave"');
  });
});
