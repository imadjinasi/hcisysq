import { Activity, Fingerprint, Link2, MapPin, Network, Radio, UserRoundCheck, UsersRound } from "lucide-react";

import { connectivityLabel } from "@/lib/admsAdmin";

import { useDeviceAdmin } from "@/components/attendance/device-admin/DeviceAdminContext";
import { connectivityClass, fmt } from "@/components/attendance/device-admin/DeviceDetailShell";

function lifecycleLabel(value: string | undefined) {
  if (value === "active") return "Aktif";
  if (value === "disabled") return "Dinonaktifkan";
  if (value === "quarantined") return "Karantina";
  return value ?? "Belum diketahui";
}

function SummaryCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-[-0.02em] text-brand-heading">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

export function AdminAdmsDeviceOverviewPage() {
  const { detail, health } = useDeviceAdmin();
  if (!detail) return null;

  const device = detail.item;
  const activeMappings = detail.mappings.filter((mapping) => !mapping.effectiveTo).length;
  const unmappedPins = detail.observedPins.filter((pin) => !pin.mappingId).length;
  const connectivity = health?.connectivityStatus ?? "unknown";

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan kondisi mesin">
        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Radio className="h-4 w-4" aria-hidden="true" /> Status koneksi
          </div>
          <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${connectivityClass(connectivity)}`}>
            {connectivityLabel(connectivity)}
          </span>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Terakhir berhasil terhubung {fmt(health?.lastSuccessfulRequestAt ?? device.lastSuccessfulRequestAt)}</p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Network className="h-4 w-4" aria-hidden="true" /> IP terakhir
          </div>
          <p className="mt-3 text-lg font-bold text-brand-heading">{health?.lastIp ?? device.lastIp ?? "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Alamat sumber koneksi terakhir yang diterima HCIS.</p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Activity className="h-4 w-4" aria-hidden="true" /> Aktivitas transaksi
          </div>
          <p className="mt-3 text-sm font-bold text-brand-heading">{fmt(health?.lastTransactionActivityAt ?? null)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Waktu aktivitas transaksi terakhir yang tercatat.</p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <MapPin className="h-4 w-4" aria-hidden="true" /> Lifecycle
          </div>
          <p className="mt-3 text-lg font-bold text-brand-heading">{lifecycleLabel(device.lifecycle)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Status operasional mesin di HCIS, terpisah dari online/offline.</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan data mesin">
        <SummaryCard label="PIN teramati" value={detail.observedPins.length} helper="PIN yang pernah terlihat pada fakta transaksi mesin." />
        <SummaryCard label="Terhubung ke pegawai" value={activeMappings} helper="Mapping aktif dan eksplisit ke pegawai HCIS." />
        <SummaryCard label="Belum terhubung" value={unmappedPins} helper="PIN teramati yang masih perlu ditinjau admin." />
        <SummaryCard label="Transaksi terbaru" value={detail.recentEvents.length} helper="Jumlah fakta transaksi dalam ringkasan detail terbaru." />
      </section>

      <section className="rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="border-b border-border/70 px-5 py-4">
          <h2 className="text-base font-bold text-brand-heading">Informasi mesin</h2>
          <p className="mt-1 text-xs text-muted-foreground">Identitas dan metadata yang aman untuk kebutuhan operasional.</p>
        </div>
        <dl className="grid gap-x-8 gap-y-0 p-5 sm:grid-cols-2">
          {[
            ["Serial number", device.serialNumber],
            ["Zona waktu", device.timezone],
            ["Model", device.model ?? "Belum terbaca"],
            ["Firmware", device.firmwareVersion ?? "Belum terbaca"],
            ["Pertama terlihat", fmt(device.firstSeenAt)],
            ["Terakhir terlihat", fmt(health?.lastSeenAt ?? device.lastSeenAt)],
            ["Aktivitas perintah", fmt(health?.lastCommandActivityAt ?? null)],
            ["Status lifecycle", lifecycleLabel(device.lifecycle)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-4 border-b border-border/60 py-3 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-semibold text-brand-heading">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {unmappedPins > 0 || detail.recentQuarantines.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3">
            <Fingerprint className="mt-0.5 h-5 w-5 text-amber-700" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-bold text-amber-900">Perlu perhatian</h2>
              <div className="mt-2 space-y-1 text-sm leading-6 text-amber-900/80">
                {unmappedPins > 0 ? (
                  <p className="flex items-center gap-2"><Link2 className="h-4 w-4" aria-hidden="true" /> {unmappedPins} PIN belum terhubung ke pegawai HCIS.</p>
                ) : null}
                {detail.recentQuarantines.length > 0 ? (
                  <p className="flex items-center gap-2"><UsersRound className="h-4 w-4" aria-hidden="true" /> Ada {detail.recentQuarantines.length} catatan karantina terbaru yang perlu ditinjau.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          <div className="flex items-center gap-2 font-semibold"><UserRoundCheck className="h-4 w-4" aria-hidden="true" /> Tidak ada perhatian mapping atau karantina pada ringkasan terbaru.</div>
        </section>
      )}
    </div>
  );
}
