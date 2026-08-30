import { Construction } from "lucide-react";

import type { DeviceAdminSection } from "@/components/attendance/device-admin/DeviceDetailShell";

const copy: Record<Exclude<DeviceAdminSection, "overview">, { title: string; description: string }> = {
  users: {
    title: "Pengguna mesin",
    description: "Pengelolaan PIN, hubungan ke pegawai HCIS, pembacaan data pengguna, dan koreksi aman akan berada di halaman ini.",
  },
  transactions: {
    title: "Transaksi mesin",
    description: "Fakta transaksi mesin dan pengambilan ulang transaksi berbatas waktu akan berada di halaman ini.",
  },
  commands: {
    title: "Riwayat perintah",
    description: "Status operasi yang dikirim ke mesin akan berada di halaman ini dengan bahasa operasional dan detail teknis terpisah.",
  },
  settings: {
    title: "Pengaturan mesin",
    description: "Nama, lifecycle, dan konfigurasi operasional yang aman akan berada di halaman ini.",
  },
  diagnostics: {
    title: "Diagnostik teknis",
    description: "Observability protokol, canary, dan alat teknis akan dipisahkan dari workflow admin biasa di halaman ini.",
  },
};

export function AdminAdmsDeviceSectionPlaceholderPage({ section }: { section: Exclude<DeviceAdminSection, "overview"> }) {
  const current = copy[section];
  return (
    <section className="rounded-2xl border border-border/70 bg-white p-6 shadow-[var(--shadow-soft)]">
      <div className="flex gap-3">
        <Construction className="mt-0.5 h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
        <div>
          <h2 className="text-base font-bold text-brand-heading">{current.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{current.description}</p>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Route ini sudah terpisah dan memakai satu konteks mesin. Workflow existing akan dipindahkan tanpa mengubah safety contract ADMS.
          </p>
        </div>
      </div>
    </section>
  );
}
