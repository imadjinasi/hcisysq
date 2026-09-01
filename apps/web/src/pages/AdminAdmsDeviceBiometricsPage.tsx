import {
  AlertTriangle,
  Database,
  Fingerprint,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PaginationBar } from "@/components/PaginationBar";
import { useDeviceAdmin } from "@/components/attendance/device-admin/DeviceAdminContext";
import {
  biometricCapabilityReason,
  biometricCapabilityStateLabel,
  biometricModalityLabel,
  getBiometricControlPlane,
  listBiometricCredentials,
  listBiometricReplicaInventory,
  reencryptBiometricVault,
  type BiometricControlPlaneSummary,
  type BiometricCredentialPage,
  type BiometricModality,
  type BiometricReplicaItem,
} from "@/lib/admsBiometrics";

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function statusPill(enabled: boolean) {
  return enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700";
}

function capabilityPill(state: "available" | "blocked" | "not_verified") {
  if (state === "available") return "bg-emerald-50 text-emerald-700";
  if (state === "blocked") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function replicaPill(state: BiometricReplicaItem["state"]) {
  if (state === "present" || state === "succeeded") return "bg-emerald-50 text-emerald-700";
  if (state === "stale" || state === "conflict" || state === "failed" || state === "missing") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export function AdminAdmsDeviceBiometricsPage() {
  const { deviceId } = useDeviceAdmin();
  const [summary, setSummary] = useState<BiometricControlPlaneSummary | null>(null);
  const [credentials, setCredentials] = useState<BiometricCredentialPage | null>(null);
  const [replicas, setReplicas] = useState<BiometricReplicaItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [replicaPage, setReplicaPage] = useState(1);
  const [modality, setModality] = useState<"all" | BiometricModality>("all");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [summaryResult, credentialResult, replicaResult] = await Promise.all([
      getBiometricControlPlane(deviceId),
      listBiometricCredentials({
        deviceId,
        page,
        pageSize,
        modality: modality === "all" ? undefined : modality,
        lifecycleReviewOnly: reviewOnly,
      }),
      listBiometricReplicaInventory(deviceId),
    ]);
    setSummary(summaryResult);
    setCredentials(credentialResult);
    setReplicas(replicaResult.items);
  }, [deviceId, modality, page, pageSize, reviewOnly]);

  useEffect(() => {
    setLoading(true);
    void load()
      .then(() => setError(null))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Control plane biometric tidak dapat dimuat.");
      })
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [deviceId, modality, pageSize, reviewOnly]);

  useEffect(() => {
    if (credentials && page > credentials.totalPages) setPage(credentials.totalPages);
  }, [credentials, page]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Control plane biometric tidak dapat dimuat ulang.");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const rotateVault = useCallback(async () => {
    if (!summary?.keyring.ready || !summary.vault.rotationRequiredCount) return;
    const confirmation = window.prompt(
      "Rotasi hanya mengubah envelope terenkripsi di vault HCIS dan tidak mengirim command ke mesin. Ketik REENCRYPT_VAULT untuk melanjutkan.",
    );
    if (confirmation !== "REENCRYPT_VAULT") return;
    setRotating(true);
    try {
      const result = await reencryptBiometricVault(25);
      setNotice(`Rotasi envelope selesai untuk ${result.processedCount} credential. Sisa yang perlu diproses: ${result.remainingCount}. Tidak ada command mesin yang dibuat.`);
      setError(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rotasi envelope vault tidak dapat diproses.");
    } finally {
      setRotating(false);
    }
  }, [load, summary?.keyring.ready, summary?.vault.rotationRequiredCount]);

  const replicaPageSize = 25;
  const replicaTotalPages = Math.max(1, Math.ceil(replicas.length / replicaPageSize));
  const pagedReplicas = useMemo(
    () => replicas.slice((replicaPage - 1) * replicaPageSize, replicaPage * replicaPageSize),
    [replicaPage, replicas],
  );

  useEffect(() => {
    if (replicaPage > replicaTotalPages) setReplicaPage(replicaTotalPages);
  }, [replicaPage, replicaTotalPages]);

  if (loading && !summary) {
    return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat control plane biometric…</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><Fingerprint className="h-5 w-5 text-brand-primary" /><h2 className="text-base font-bold text-brand-heading">Control plane biometric</h2></div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
              HCIS hanya menampilkan metadata vault dan bukti replica yang sudah diketahui. Raw template, ciphertext, hash, IV, auth tag, dan key ID tidak tersedia di halaman atau response normal.
            </p>
          </div>
          <button type="button" disabled={refreshing} onClick={() => void refresh()} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-white px-3 text-xs font-semibold hover:bg-surface disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Muat ulang
          </button>
        </div>
        {notice ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">{notice}</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</div> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Global collection</div>
          <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-bold ${statusPill(Boolean(summary?.collection.globalEnabled))}`}>{summary?.collection.globalEnabled ? "ON" : "OFF"}</span>
        </div>
        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Device collection</div>
          <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-bold ${statusPill(Boolean(summary?.collection.deviceEnabled))}`}>{summary?.collection.deviceEnabled ? "ON" : "OFF"}</span>
        </div>
        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Effective collection</div>
          <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-bold ${statusPill(Boolean(summary?.collection.effectiveEnabled))}`}>{summary?.collection.effectiveEnabled ? "ON" : "OFF"}</span>
        </div>
        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><KeyRound className="h-4 w-4" /> Keyring maintenance</div>
          <div className="mt-3 text-sm font-bold text-brand-heading">{summary?.keyring.ready ? "Siap" : summary?.keyring.configured ? "Konfigurasi tidak siap" : "Belum dikonfigurasi"}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Tidak menampilkan key ID atau material.</div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><Database className="h-4 w-4 text-brand-primary" /><h3 className="text-sm font-bold text-brand-heading">Vault terenkripsi</h3></div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Ringkasan global HCIS. Payload tidak pernah dirender.</p>
            </div>
            <button
              type="button"
              disabled={rotating || !summary?.keyring.ready || !summary.vault.rotationRequiredCount}
              onClick={() => void rotateVault()}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-white px-3 text-xs font-semibold hover:bg-surface disabled:opacity-50"
            >
              {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Rotasi envelope
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-surface p-3"><div className="text-[11px] text-muted-foreground">Credential</div><div className="mt-1 text-lg font-bold text-brand-heading">{summary?.vault.totalCount ?? 0}</div></div>
            <div className="rounded-xl bg-surface p-3"><div className="text-[11px] text-muted-foreground">Pegawai</div><div className="mt-1 text-lg font-bold text-brand-heading">{summary?.vault.employeeCount ?? 0}</div></div>
            <div className="rounded-xl bg-surface p-3"><div className="text-[11px] text-muted-foreground">Perlu review</div><div className="mt-1 text-lg font-bold text-brand-heading">{summary?.vault.lifecycleReviewRequiredCount ?? 0}</div></div>
            <div className="rounded-xl bg-surface p-3"><div className="text-[11px] text-muted-foreground">Perlu rotasi</div><div className="mt-1 text-lg font-bold text-brand-heading">{summary?.vault.rotationRequiredCount ?? "—"}</div></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>Sidik jari <strong>{summary?.vault.fingerprintCount ?? 0}</strong></div>
            <div>Wajah <strong>{summary?.vault.faceCount ?? 0}</strong></div>
            <div>Telapak <strong>{summary?.vault.palmCount ?? 0}</strong></div>
            <div>Bio-photo <strong>{summary?.vault.bioPhotoCount ?? 0}</strong></div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><h3 className="text-sm font-bold text-amber-950">Retensi masih fail-closed</h3><p className="mt-1 text-xs leading-5 text-amber-900">{summary?.retention.note ?? "Kebijakan retensi belum tersedia."}</p></div></div>
          <div className="mt-4 rounded-xl bg-white/70 p-3 text-xs leading-5 text-amber-950">Tidak ada auto-retire, auto-delete, atau master destruction untuk pegawai inactive/resigned. Status hanya masuk review queue.</div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-bold text-brand-heading">Capability matrix</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Operasi hardware tetap disabled sampai wire protocol dan safety-nya dibuktikan pada perangkat fisik secara terpisah.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(summary?.capabilities ?? []).map((capability) => (
            <div key={capability.key} className="rounded-xl border border-border/70 p-3">
              <div className="flex items-start justify-between gap-3"><div className="text-xs font-bold text-brand-heading">{capability.label}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${capabilityPill(capability.state)}`}>{biometricCapabilityStateLabel(capability.state)}</span></div>
              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">{biometricCapabilityReason(capability.reason) ?? "Siap di control plane HCIS."}</div>
              {capability.deviceCommandRequired ? <div className="mt-1 text-[10px] font-semibold text-amber-700">Memerlukan command hardware terverifikasi</div> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
          <div><h3 className="text-sm font-bold text-brand-heading">Credential vault dari mesin ini</h3><p className="mt-1 text-[11px] text-muted-foreground">Metadata saja; tidak ada template atau envelope detail.</p></div>
          <div className="flex flex-wrap gap-2">
            <select value={modality} onChange={(event) => setModality(event.target.value as "all" | BiometricModality)} className="h-9 rounded-xl border border-border bg-white px-3 text-xs text-brand-heading" aria-label="Filter modality biometric"><option value="all">Semua modality</option><option value="fingerprint">Sidik jari</option><option value="face">Wajah</option><option value="palm">Telapak</option><option value="bio_photo">Bio-photo</option></select>
            <label className="flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-brand-heading"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} /> Perlu review</label>
          </div>
        </div>
        {!credentials?.items.length ? <div className="p-8 text-center text-sm text-muted-foreground">Belum ada credential vault yang cocok untuk mesin ini.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-border/70 bg-surface/70 text-[11px] uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="px-4 py-3">Pegawai</th><th className="px-4 py-3">Modality</th><th className="px-4 py-3">Format</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Imported</th><th className="px-4 py-3">Envelope</th></tr></thead><tbody className="divide-y divide-border/60">{credentials.items.map((item) => <tr key={item.id} className="hover:bg-surface/40"><td className="px-4 py-4"><div className="font-semibold text-brand-heading">{item.employeeName}</div><div className="mt-1 text-xs text-muted-foreground">{item.employeeNumber} · {item.employeeStatus}</div>{item.lifecycleReviewRequired ? <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">Perlu review</span> : null}</td><td className="px-4 py-4 text-xs text-brand-heading">{biometricModalityLabel(item.modality)}{item.slotIndex === null ? "" : ` · slot ${item.slotIndex}`}</td><td className="px-4 py-4"><div className="font-mono text-xs text-brand-heading">{item.vendorFormat}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.vendorVersion ?? "—"}</div></td><td className="px-4 py-4 text-xs font-semibold text-brand-heading">{item.lifecycle}</td><td className="px-4 py-4 text-xs text-muted-foreground">{fmt(item.importedAt)}</td><td className="px-4 py-4"><div className="text-xs font-semibold text-brand-heading">{item.envelopeVersion}</div><div className="mt-1 text-[11px] text-muted-foreground">Rotasi: {fmt(item.lastReencryptedAt)}</div></td></tr>)}</tbody></table></div>
        )}
        <PaginationBar page={credentials?.page ?? page} pageSize={pageSize} total={credentials?.total ?? 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="border-b border-border/70 p-4"><h3 className="text-sm font-bold text-brand-heading">Bukti replica pada mesin ini</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Hanya state yang pernah tercatat. Tidak adanya row tidak pernah dianggap sebagai bukti credential hilang dari mesin.</p></div>
        {replicas.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Belum ada bukti replica biometric yang tersimpan.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-border/70 bg-surface/70 text-[11px] uppercase tracking-[0.08em] text-muted-foreground"><tr><th className="px-4 py-3">Pegawai</th><th className="px-4 py-3">Credential</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Teramati</th><th className="px-4 py-3">Sinkron terakhir</th></tr></thead><tbody className="divide-y divide-border/60">{pagedReplicas.map((item) => <tr key={item.credentialId}><td className="px-4 py-4"><div className="font-semibold text-brand-heading">{item.employeeName}</div><div className="mt-1 text-xs text-muted-foreground">{item.employeeNumber}</div></td><td className="px-4 py-4 text-xs text-brand-heading">{biometricModalityLabel(item.modality)}{item.slotIndex === null ? "" : ` · slot ${item.slotIndex}`}</td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${replicaPill(item.state)}`}>{item.state}</span></td><td className="px-4 py-4 text-xs text-muted-foreground">{fmt(item.observedAt)}</td><td className="px-4 py-4 text-xs text-muted-foreground">{fmt(item.lastSyncedAt)}</td></tr>)}</tbody></table></div>}
        <PaginationBar page={replicaPage} pageSize={replicaPageSize} total={replicas.length} onPageChange={setReplicaPage} />
      </section>
    </div>
  );
}
