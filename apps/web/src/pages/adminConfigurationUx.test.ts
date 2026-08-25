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

  it("makes same-day revisions, deliberate DRAFT-only discard, and account holders explicit", () => {
    expect(organizationSource).toContain("Versi sebelumnya tetap tersimpan sebagai histori");
    expect(organizationSource).toContain("Hapus kelompok dan subtree?");
    expect(organizationSource).toContain("Buang revisi draft?");
    expect(organizationSource).toContain("Ketik nama revisi");
    expect(organizationSource).toContain('data?.draft?.status !== "DRAFT"');
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
    expect(organizationSource).toContain("Approval & Reporting");
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
    expect(organizationSource).toContain("Bantuan migrasi unit lama");
    expect(organizationSource).toContain("Preview: {legacyCandidates.length} pegawai aktif");
    expect(organizationSource).toMatch(/Posisi, pimpinan, hierarchy,\s*dan kewenangan tidak dibuat otomatis/);
    expect(organizationSource).toContain('aria-label="Cari nama atau nomor pegawai"');
    expect(organizationSource).toContain('aria-label="Filter unit pegawai"');
    expect(organizationSource).toContain("Cari nama/NIP atau pilih filter unit");
  });

  it("keeps current members collapsed and reviews only semantic deltas", () => {
    expect(organizationSource).toContain("Lihat anggota saat ini");
    expect(organizationSource).toContain("Pegawai tersedia");
    expect(organizationSource).toContain("Perubahan ({deltas.length})");
    expect(organizationSource).toContain("Simpan ${deltas.length} perubahan");
    expect(organizationSource).toContain("Jadikan ini unit utama");
    expect(organizationSource).toContain("Unit utama terakhir tidak dapat dihapus");
  });

  it("places guided Approval & Reporting before the advanced raw authority editor", () => {
    expect(organizationSource).toContain("Atur Approval & Reporting");
    expect(organizationSource).toContain("Pimpinan struktur");
    expect(organizationSource).toContain("Penyetuju unit");
    expect(organizationSource).toContain("Penyetuju governance");
    expect(organizationSource).toContain("Editor authority mentah");
    expect(organizationSource).toContain("tidak membuat authority dari nama jabatan");
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

  it("keeps the shared admin header compact without changing global buttons", () => {
    expect(adminShellSource).toContain("data-admin-page-header");
    expect(adminShellSource).toContain("px-5 py-3 sm:px-7 lg:px-10");
    expect(adminShellSource).toContain("mt-0.5 max-w-3xl text-sm leading-5");
    expect(adminShellSource).toContain("px-5 py-4 sm:px-7 lg:px-10 lg:py-5");
  });

  it("keeps implementation identifiers out of the primary Organization summary", () => {
    expect(organizationSource).toContain("Berdasarkan versi terbit sebelumnya");
    expect(organizationSource).toContain("data-organization-version-summary");
    expect(organizationSource).not.toContain("baseChangeSetId.slice");
    expect(organizationSource).not.toContain("{step.authorityType}");
  });

  it("uses a bounded viewport workspace with one organization control bar", () => {
    expect(organizationSource).toContain("data-organization-workspace");
    expect(organizationSource).toContain("workspace");
    expect(adminShellSource).toContain("workspace && \"lg:flex lg:h-screen lg:min-h-0 lg:flex-col\"");
    expect(organizationSource).toContain("toolbarContext=");
    expect(organizationSource).toContain("toolbarActions=");
    expect(organizationSource).toContain('htmlFor="organization-effective-date"');
    expect(organizationSource).not.toContain('<Field label="Lihat struktur pada tanggal">');
  });
});
