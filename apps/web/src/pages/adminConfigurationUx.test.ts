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

describe("Organization Designer administration UX contracts", () => {
  it("keeps add-below parent context fixed and integration code advanced", () => {
    expect(organizationSource).toContain('action.mode === "child" ? "Di bawah" : "Induk bersama"');
    expect(organizationSource).toContain('type="hidden" name="parentNodeKey"');
    expect(organizationSource).toContain("Pengaturan lanjutan");
    expect(organizationSource).toContain("Kode integrasi");
    expect(organizationSource).toContain("Tampilkan 1 tingkat lebih rendah");
  });

  it("provides a selected-item inspector and intentional Move actions", () => {
    expect(organizationSource).toContain('aria-label="Inspector pilihan struktur"');
    expect(organizationSource).toContain("Induk struktural");
    expect(organizationSource).toContain("Kewenangan terkait");
    expect(organizationSource).toContain("Penempatan tampilan");
    expect(organizationSource).toContain('mode: "move"');
    expect(organizationSource).toContain("Pindahkan kelompok");
  });

  it("offers explicit legacy-unit membership preview without authority inference", () => {
    expect(organizationSource).toContain("Tambahkan anggota dari unit lama");
    expect(organizationSource).toContain("Preview: {legacyCandidates.length} pegawai aktif");
    expect(organizationSource).toContain("Posisi, leader, hierarchy, dan kewenangan tidak dibuat otomatis");
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
