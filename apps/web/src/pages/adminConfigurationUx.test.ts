import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { modeCopy, routingSource } from "@/lib/adminLeaveRouting";

const organizationSource = readFileSync(
  new URL("./AdminOrganizationPage.tsx", import.meta.url),
  "utf8",
);
const leaveSource = readFileSync(
  new URL("./AdminLeaveConfigurationPage.tsx", import.meta.url),
  "utf8",
);
const adminShellSource = readFileSync(
  new URL("../layouts/AdminShell.tsx", import.meta.url),
  "utf8",
);

describe("Organization Designer administration UX contracts", () => {
  it("keeps friendly add placement and integration code advanced", () => {
    expect(organizationSource).toContain('name="placement" value="child"');
    expect(organizationSource).toContain('name="placement" value="sibling"');
    expect(organizationSource).toMatch(/type="hidden"\s+name="parentNodeKey"/);
    expect(organizationSource).toContain("Pengaturan lanjutan");
    expect(organizationSource).toContain("Kode integrasi");
    expect(organizationSource).toContain("Tampilkan 1 tingkat lebih rendah");
    expect(organizationSource).toContain("Tampilkan 3 tingkat lebih rendah");
  });

  it("makes same-day revisions, destructive draft deletion, and account holders explicit", () => {
    expect(organizationSource).toContain("Versi sebelumnya tetap tersimpan sebagai histori");
    expect(organizationSource).toContain("Hapus kelompok dan subtree?");
    expect(organizationSource).toContain("Buang seluruh draft?");
    expect(organizationSource).toContain("Account Organ Yayasan");
    expect(organizationSource).toContain('href="/admin/access"');
    expect(organizationSource).toContain("tidak membuat account, mengaktifkan account, atau memberikan permission");
  });

  it("keeps partial group and position deletion distinct, explicit, and draft-only", () => {
    expect(organizationSource).toContain("Hapus kelompok");
    expect(organizationSource).toContain("Hapus subtree");
    expect(organizationSource).toContain("Hapus posisi");
    expect(organizationSource).toContain("tidak ada cascade otomatis");
    expect(organizationSource).toContain("Penghapusan aman ditolak jika masih ada dependensi");
    expect(organizationSource).toContain('const canEdit = data?.draft?.status === "DRAFT"');
  });

  it("provides a simplified selected-item inspector with advanced technical controls", () => {
    expect(organizationSource).toContain('aria-label="Inspector pilihan struktur"');
    expect(organizationSource).toContain("Induk struktural");
    expect(organizationSource).toContain("Approval & reporting");
    expect(organizationSource).toContain("Tetapkan pimpinan");
    expect(organizationSource).toContain("Tambah bagian / unit");
    expect(organizationSource).toContain("Kelola anggota");
    expect(organizationSource).toContain("Zona berbahaya");
    expect(organizationSource).toContain("Penempatan tampilan");
    expect(organizationSource).toContain('mode: "move"');
    expect(organizationSource).toContain("Pindahkan kelompok");
  });

  it("uses contextual searchable pickers for ambiguous authority and reporting positions", () => {
    expect(organizationSource).toContain("export function PositionPicker");
    expect(organizationSource).toContain('data-position-picker={name}');
    expect(organizationSource).toContain("Cari jabatan, struktur, atau pejabat");
    expect(organizationSource).toContain("holderFor(position)");
    expect(organizationSource).toContain('name="targetPositionKey"');
  });

  it("offers explicit legacy-unit membership preview without authority inference", () => {
    expect(organizationSource).toContain("Tambahkan anggota dari unit lama");
    expect(organizationSource).toContain("Preview: {legacyCandidates.length} pegawai aktif");
    expect(organizationSource).toMatch(/Posisi, leader,\s*hierarchy, dan kewenangan tidak dibuat otomatis/);
    expect(organizationSource).toContain('aria-label="Cari nama atau nomor pegawai"');
    expect(organizationSource).toContain('aria-label="Filter unit pegawai"');
    expect(organizationSource).toContain("Gunakan pencarian atau filter unit untuk menampilkan pegawai");
  });
});

describe("Leave administration transition UX contracts", () => {
  it("labels the active authority honestly for every rollout state", () => {
    expect(routingSource("LEGACY")).toBe("Legacy");
    expect(routingSource("SHADOW")).toBe("Legacy");
    expect(routingSource("STRUCTURE")).toBe("Struktur Organisasi");
    expect(routingSource("MIXED")).toBe("Bervariasi per cakupan");
    expect(modeCopy("SHADOW")).toContain("diagnosis");
    expect(modeCopy("STRUCTURE")).toContain("tidak menjadi fallback");
  });

  it("archives STRUCTURE legacy controls while keeping entitlement independent", () => {
    expect(leaveSource).toContain("Legacy approval routing");
    expect(leaveSource).toContain('unit.rolloutState === "STRUCTURE"');
    expect(leaveSource).toContain("Diarsipkan / read-only");
    expect(leaveSource).toContain("Klasifikasi Hak Cuti Pegawai Aktif");
    expect(leaveSource).toContain("updateLeaveEntitlementGroup");
  });

  it("renders rollout-aware preview metadata and SHADOW comparison", () => {
    expect(leaveSource).toContain("Sumber authoritative");
    expect(leaveSource).toContain("Resolved chain authoritative");
    expect(leaveSource).toContain('preview.routing.mode === "SHADOW"');
    expect(leaveSource).toContain("Kandidat Struktur Organisasi");
    expect(leaveSource).toContain("side effect oversight struktural");
  });
});

describe("Admin navigation compaction", () => {
  it("preserves all destinations and active-item behavior in a compact scrollable desktop shell", () => {
    for (const href of [
      "/admin", "/admin/employees", "/admin/employees/import", "/admin/employees/imports",
      "/admin/organization", "/admin/attendance", "/admin/leave", "/admin/leave/calendar",
      "/admin/payslips", "/admin/access",
    ]) expect(adminShellSource).toContain(`href: "${href}"`);
    expect(adminShellSource).toContain('item.key === active');
    expect(adminShellSource).toContain('aria-current={selected ? "page" : undefined}');
    expect(adminShellSource).toContain('lg:grid-cols-[14.5rem_minmax(0,1fr)]');
    expect(adminShellSource).toContain('aria-expanded={!collapsed}');
    expect(adminShellSource).toContain('data-admin-nav-group={group.key}');
    expect(adminShellSource).toContain('lg:overflow-y-auto');
    expect(adminShellSource).toContain('whitespace-nowrap');
    expect(adminShellSource).toContain('className="min-w-0 truncate"');
    expect(organizationSource).toContain('className="min-w-0 truncate"');
  });
});
