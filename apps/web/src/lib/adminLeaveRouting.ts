import type { LeaveConfigurationResponse } from "@/lib/adminLeave";

export function routingSource(state: LeaveConfigurationResponse["rollout"]["state"]) {
  if (state === "STRUCTURE") return "Struktur Organisasi";
  if (state === "MIXED") return "Bervariasi per cakupan";
  return "Legacy";
}

export function modeCopy(mode: "LEGACY" | "SHADOW" | "STRUCTURE" | "MIXED") {
  if (mode === "STRUCTURE") return "Struktur Organisasi adalah satu-satunya sumber authority. Data legacy hanya arsip/referensi rollback dan tidak menjadi fallback.";
  if (mode === "SHADOW") return "Legacy tetap authoritative. Struktur Organisasi dibandingkan untuk diagnosis dan belum mengubah chain atau notifikasi.";
  if (mode === "MIXED") return "Mode berbeda antar cakupan organisasi. Lihat status pada setiap unit/pegawai; tidak ada satu mode global yang berlaku untuk semua.";
  return "Legacy masih authoritative. Struktur Organisasi dapat disiapkan mandiri sebelum masuk SHADOW dan STRUCTURE.";
}
