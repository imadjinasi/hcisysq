import { AlertTriangle, Database, Fingerprint, Info, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDeviceAdmin } from "@/components/attendance/device-admin/DeviceAdminContext";
import {
  commandStatusLabel,
  getAdmsDeviceRoster,
  listAdmsCommands,
  queryAdmsUserInfo,
  type AdmsCommandItem,
  type AdmsRosterResponse,
} from "@/lib/admsAdmin";
import {
  getAdmsBiometricInventory,
  getAdmsBiometricPolicy,
  getAdmsReconciliation,
  getAdmsSafeLogs,
  getAdmsTelemetry,
  listAdmsBiometricCredentials,
  requestAdmsReadInformation,
  updateAdmsBiometricPolicy,
  type AdmsBiometricCredentialResponse,
  type AdmsBiometricInventoryResponse,
  type AdmsBiometricPolicy,
  type AdmsReconciliationResponse,
  type AdmsSafeLogs,
  type AdmsTelemetry,
} from "@/lib/admsDiagnostics";

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function displayObserved(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function modalityLabel(value: string) {
  if (value === "fingerprint") return "Fingerprint";
  if (value === "face") return "Face";
  if (value === "palm") return "Palm";
  if (value === "bio_photo") return "Bio-photo";
  return value;
}

export function AdminAdmsDeviceDiagnosticsPage() {
  const { deviceId, detail } = useDeviceAdmin();
  const device = detail?.item ?? null;
  const [telemetry, setTelemetry] = useState<AdmsTelemetry | null>(null);
  const [reconciliation, setReconciliation] = useState<AdmsReconciliationResponse | null>(null);
  const [logs, setLogs] = useState<AdmsSafeLogs | null>(null);
  const [roster, setRoster] = useState<AdmsRosterResponse | null>(null);
  const [commands, setCommands] = useState<AdmsCommandItem[]>([]);
  const [biometricPolicy, setBiometricPolicy] = useState<AdmsBiometricPolicy | null>(null);
  const [credentials, setCredentials] = useState<AdmsBiometricCredentialResponse | null>(null);
  const [inventory, setInventory] = useState<AdmsBiometricInventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canaryPin, setCanaryPin] = useState("");

  const load = useCallback(async () => {
    const [nextTelemetry, nextReconciliation, nextLogs, nextRoster, nextCommands, nextPolicy, nextCredentials, nextInventory] = await Promise.all([
      getAdmsTelemetry(deviceId),
      getAdmsReconciliation(deviceId),
      getAdmsSafeLogs(deviceId),
      getAdmsDeviceRoster(deviceId),
      listAdmsCommands(deviceId),
      getAdmsBiometricPolicy(deviceId),
      listAdmsBiometricCredentials(deviceId),
      getAdmsBiometricInventory(deviceId),
    ]);
    setTelemetry(nextTelemetry);
    setReconciliation(nextReconciliation);
    setLogs(nextLogs);
    setRoster(nextRoster);
    setCommands(nextCommands.items);
    setBiometricPolicy(nextPolicy);
    setCredentials(nextCredentials);
    setInventory(nextInventory);
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    void load()
      .then(() => setError(null))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Diagnostik mesin tidak dapat dimuat.");
      })
      .finally(() => setLoading(false));
  }, [load]);

  const normalizedPin = canaryPin.trim();
  const pinValid = /^\d{1,128}$/.test(normalizedPin);
  const latestUserInfoCommand = useMemo(() => commands.find(
    (item) => item.commandType === "query_user_info" && item.wireCommand === `DATA QUERY USERINFO PIN=${normalizedPin}`,
  ) ?? null, [commands, normalizedPin]);
  const rosterItem = useMemo(
    () => roster?.items.find((item) => item.pin === normalizedPin) ?? null,
    [normalizedPin, roster?.items],
  );
  const userInfoCommandSucceeded = Boolean(
    latestUserInfoCommand?.status === "succeeded"
      && (latestUserInfoCommand.returnCode ?? -1) >= 0,
  );
  const rosterObservedAfterDelivery = Boolean(
    latestUserInfoCommand?.deliveredAt
      && rosterItem?.sourceRequestId
      && new Date(rosterItem.lastSeenAt).getTime() >= new Date(latestUserInfoCommand.deliveredAt).getTime(),
  );
  const canaryVerified = userInfoCommandSucceeded && rosterObservedAfterDelivery;

  const refresh = useCallback(async () => {
    setBusy("refresh");
    try {
      await load();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diagnostik mesin tidak dapat dimuat ulang.");
    } finally {
      setBusy(null);
    }
  }, [load]);

  const readInformation = useCallback(async () => {
    if (device?.lifecycle !== "active") return;
    setBusy("info");
    try {
      const result = await requestAdmsReadInformation(deviceId);
      setNotice(`Perintah C:${result.item.commandNumber} untuk membaca informasi mesin sudah dibuat.`);
      setError(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permintaan informasi mesin tidak dapat dibuat.");
    } finally {
      setBusy(null);
    }
  }, [device?.lifecycle, deviceId, load]);

  const queryUserInfo = useCallback(async () => {
    if (!pinValid || device?.lifecycle !== "active") return;
    if (!window.confirm(`Jalankan pembacaan metadata pengguna untuk satu PIN ${normalizedPin}? Tidak ada template biometrik yang diminta.`)) return;
    setBusy("userinfo");
    try {
      const result = await queryAdmsUserInfo(deviceId, normalizedPin);
      setNotice(`Perintah C:${result.item.commandNumber} untuk PIN ${normalizedPin} sudah dibuat.`);
      setError(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Permintaan baca metadata pengguna tidak dapat dibuat.");
    } finally {
      setBusy(null);
    }
  }, [device?.lifecycle, deviceId, load, normalizedPin, pinValid]);

  const changeBiometricPilot = useCallback(async (enabled: boolean) => {
    if (!biometricPolicy) return;
    if (enabled && !window.confirm("Aktifkan gate koleksi biometrik untuk mesin ini? Gate global, lifecycle aktif, keyring, dan mapping eksplisit tetap wajib sebelum koleksi efektif.")) return;
    setBusy("biometric");
    try {
      const result = await updateAdmsBiometricPolicy(deviceId, enabled);
      setBiometricPolicy(result);
      setNotice(enabled ? "Gate pilot biometrik mesin diaktifkan." : "Gate pilot biometrik mesin dinonaktifkan.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gate pilot biometrik tidak dapat disimpan.");
    } finally {
      setBusy(null);
    }
  }, [biometricPolicy, deviceId]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-white text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat diagnostik teknis…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-300 bg-slate-950 p-5 text-slate-100 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Area teknis · Super Admin</div>
            <h2 className="mt-1 text-base font-bold">Diagnostik mesin</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">
              Protocol evidence, canary, reconciliation, log aman, dan metadata biometric. Halaman ini terikat hanya ke mesin pada URL dan tidak memilih mesin lain secara internal.
            </p>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => void refresh()} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-semibold hover:bg-slate-900 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} /> Muat ulang diagnostik
          </button>
        </div>
      </section>

      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">{error}</div> : null}

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-brand-heading"><Info className="h-4 w-4" /> Telemetry & INFO</div>
            <p className="mt-1 text-xs text-muted-foreground">Metadata transport dan INFO yang pernah teramati; tidak memuat template biometric.</p>
          </div>
          <button type="button" disabled={busy !== null || device?.lifecycle !== "active"} onClick={() => void readInformation()} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-surface disabled:opacity-50">
            {busy === "info" ? "Mengirim…" : "Baca informasi mesin"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Model" value={telemetry?.model ?? "—"} />
          <Stat label="Firmware" value={telemetry?.firmwareVersion ?? "—"} />
          <Stat label="IP terakhir" value={telemetry?.lastIp ?? "—"} mono />
          <Stat label="Request sukses terakhir" value={fmt(telemetry?.lastSuccessfulRequestAt ?? null)} />
        </div>
        <details className="mt-4 rounded-xl border border-border/70">
          <summary className="cursor-pointer p-3 text-xs font-semibold text-brand-heading">Field transport / INFO teramati</summary>
          <div className="grid gap-2 border-t border-border/70 p-3 md:grid-cols-2">
            {Object.entries({ ...(telemetry?.transportObserved ?? {}), ...(telemetry?.infoObserved ?? {}) }).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-2 text-[11px]">
                <span className="font-mono text-muted-foreground">{key}</span><span className="break-all text-brand-heading">{displayObserved(value)}</span>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-sm font-bold text-brand-heading"><Search className="h-4 w-4" /> Single-PIN metadata canary</div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Pembacaan hanya satu PIN numerik yang sudah pernah teramati. Sukses baru dianggap terbukti bila command sukses dan ada safe roster observation setelah delivery.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-xs font-semibold text-muted-foreground">
            PIN mesin
            <input value={canaryPin} onChange={(event) => setCanaryPin(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="contoh: 205291319" className="mt-1 h-10 w-full rounded-xl border border-border px-3 font-mono text-sm text-brand-heading" />
          </label>
          <button type="button" disabled={busy !== null || !pinValid || device?.lifecycle !== "active"} onClick={() => void queryUserInfo()} className="h-10 rounded-xl bg-brand-primary px-4 text-xs font-bold text-white disabled:opacity-50">
            {busy === "userinfo" ? "Mengirim…" : "Baca 1 PIN"}
          </button>
        </div>
        {normalizedPin && latestUserInfoCommand ? (
          <div className={`mt-4 rounded-xl border p-4 text-xs ${canaryVerified ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <div className="font-bold">C:{latestUserInfoCommand.commandNumber} · {commandStatusLabel(latestUserInfoCommand.status)}</div>
            <div className="mt-1">Return {latestUserInfoCommand.returnCode ?? "—"} · Result {latestUserInfoCommand.resultCommand ?? "—"} · Delivered {fmt(latestUserInfoCommand.deliveredAt)}</div>
            <div className="mt-2 font-semibold">
              {canaryVerified ? "VERIFIED: command sukses dan safe roster observation baru terbukti setelah delivery." : userInfoCommandSucceeded ? "Command sukses, tetapi safe roster observation baru setelah delivery belum terbukti." : "Canary belum mencapai terminal success."}
            </div>
            {rosterItem ? <div className="mt-2">Roster: PIN {rosterItem.pin} · {rosterItem.displayName ?? "—"} · kartu {rosterItem.cardNumber ?? "—"} · observed {fmt(rosterItem.lastSeenAt)}</div> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 text-sm font-bold text-brand-heading"><Database className="h-4 w-4" /> Rekonsiliasi & log aman</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Coverage hanya berdasarkan fakta yang persisted. Expected count dan jumlah duplicate tidak direkayasa.</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-xs font-bold text-brand-heading">Rekonsiliasi terbaru</div>
            <div className="mt-3 space-y-2">
              {(reconciliation?.items ?? []).slice(0, 8).map((item) => (
                <div key={item.commandId} className="rounded-lg bg-surface p-3 text-[11px]">
                  <div className="flex justify-between gap-3"><span className="font-mono font-bold">C:{item.commandNumber}</span><span>{commandStatusLabel(item.status)}</span></div>
                  <div className="mt-1 text-muted-foreground">{fmt(item.requestedRangeStart)} – {fmt(item.requestedRangeEnd)}</div>
                  <div className="mt-1">Persisted {item.currentPersistedCount} · sejak delivery {item.persistedSinceDeliveryCount} · ATTLOG req {item.attlogRequestCount}</div>
                </div>
              ))}
              {(reconciliation?.items.length ?? 0) === 0 ? <div className="text-xs text-muted-foreground">Belum ada evidence rekonsiliasi.</div> : null}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-xs font-bold text-brand-heading">Ringkasan log</div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <Stat label="Request journal" value={String(logs?.requests.length ?? 0)} />
              <Stat label="Command event" value={String(logs?.commandEvents.length ?? 0)} />
              <Stat label="Quarantine" value={String(logs?.quarantines.length ?? 0)} />
              <Stat label="Admin audit" value={String(logs?.adminAudit.length ?? 0)} />
            </dl>
            <div className="mt-3 rounded-lg bg-surface p-3 text-[11px] leading-5 text-muted-foreground">Raw request body exposed: <strong className="text-brand-heading">{logs?.rawRequestBodiesExposed ? "YA" : "TIDAK"}</strong></div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-brand-heading">Biometric control plane</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Hanya metadata credential/replica yang ditampilkan. Payload vendor, ciphertext, IV, auth tag, hash, password, dan key material tidak pernah dirender.</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <div className="font-bold text-amber-950">Gate koleksi</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-amber-900">
                <span>global <strong>{biometricPolicy?.globalCollectionEnabled ? "ON" : "OFF"}</strong></span>
                <span>device <strong>{biometricPolicy?.deviceCollectionEnabled ? "ON" : "OFF"}</strong></span>
                <span>effective <strong>{biometricPolicy?.effectiveCollectionEnabled ? "ON" : "OFF"}</strong></span>
              </div>
            </div>
            {biometricPolicy?.deviceCollectionEnabled ? (
              <button type="button" disabled={busy !== null} onClick={() => void changeBiometricPilot(false)} className="h-9 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 disabled:opacity-50">Nonaktifkan pilot</button>
            ) : (
              <button type="button" disabled={busy !== null || !biometricPolicy?.globalCollectionEnabled || biometricPolicy.lifecycle !== "active"} onClick={() => void changeBiometricPilot(true)} className="h-9 rounded-xl border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 disabled:opacity-50">Aktifkan pilot</button>
            )}
          </div>
          {!biometricPolicy?.globalCollectionEnabled ? <div className="mt-2 flex gap-2 text-[11px] leading-5 text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Global biometric collection masih OFF; pilot mesin tidak dapat menjadi efektif.</div> : null}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-heading"><Fingerprint className="h-4 w-4" /> Vault metadata</div>
            <div className="mt-3 space-y-2">
              {(credentials?.items ?? []).slice(0, 20).map((item) => (
                <div key={item.id} className="rounded-lg bg-surface p-3 text-[11px]">
                  <div className="font-semibold text-brand-heading">{item.employeeName} · {item.employeeNumber}</div>
                  <div className="mt-1 text-muted-foreground">{modalityLabel(item.modality)} · slot {item.slotIndex ?? "—"} · {item.vendorFormat} · source PIN {item.sourcePin ?? "—"}</div>
                </div>
              ))}
              {(credentials?.items.length ?? 0) === 0 ? <div className="text-xs text-muted-foreground">Belum ada metadata credential untuk origin device ini.</div> : null}
            </div>
          </div>
          <div className="rounded-xl border border-border/70 p-4">
            <div className="text-xs font-bold text-brand-heading">Replica state</div>
            <div className="mt-3 space-y-2">
              {(inventory?.items ?? []).slice(0, 20).map((item) => (
                <div key={item.credentialId} className="rounded-lg bg-surface p-3 text-[11px]">
                  <div className="flex justify-between gap-2"><span className="font-semibold text-brand-heading">{item.employeeName}</span><span>{item.state}</span></div>
                  <div className="mt-1 text-muted-foreground">{modalityLabel(item.modality)} · slot {item.slotIndex ?? "—"} · last sync {fmt(item.lastSyncedAt)}</div>
                </div>
              ))}
              {(inventory?.items.length ?? 0) === 0 ? <div className="text-xs text-muted-foreground">Belum ada state replica credential untuk mesin ini.</div> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 break-all text-xs font-semibold text-brand-heading ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
