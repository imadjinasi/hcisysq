import { AlertTriangle, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDeviceAdmin } from "@/components/attendance/device-admin/DeviceAdminContext";
import {
  activeTimeSync,
  clearPhysicalData,
  deleteBiometric,
  enrollBiometric,
  getPhysicalCapabilityMatrix,
  getWdmsEvidence,
  listFirmwarePackages,
  listPhysicalOperationHistory,
  markCapabilityUnsupportedOrBlocked,
  physicalExportUrls,
  pushUserProfile,
  queryBiometric,
  rebootDevice,
  restoreBiometric,
  setDuplicatePunch,
  setNtp,
  setServer,
  setUserEnabled,
  upgradeFirmware,
  type FirmwarePackageItem,
  type PhysicalCapabilityMatrix,
  type PhysicalOperationHistoryItem,
  type WdmsEvidence,
} from "@/lib/admsPhysicalParity";

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

function capabilityClass(state: string) {
  if (state === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "unsupported") return "border-slate-300 bg-slate-100 text-slate-700";
  if (state === "blocked" || state === "failed") return "border-red-200 bg-red-50 text-red-800";
  if (state === "canary_pending") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-border bg-white text-brand-heading";
}

export function AdminAdmsDevicePhysicalParityPage() {
  const { deviceId } = useDeviceAdmin();
  const [matrix, setMatrix] = useState<PhysicalCapabilityMatrix | null>(null);
  const [evidence, setEvidence] = useState<WdmsEvidence | null>(null);
  const [history, setHistory] = useState<PhysicalOperationHistoryItem[]>([]);
  const [packages, setPackages] = useState<FirmwarePackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [duplicateSeconds, setDuplicateSeconds] = useState(2);
  const [employeeId, setEmployeeId] = useState("");
  const [ntpHost, setNtpHost] = useState("pool.ntp.org");
  const [serverHost, setServerHost] = useState("");
  const [serverPort, setServerPort] = useState(80);
  const [biometricProtocol, setBiometricProtocol] = useState<"legacy_fingerprint" | "unified">("legacy_fingerprint");
  const [biometricType, setBiometricType] = useState(1);
  const [slotIndex, setSlotIndex] = useState(0);
  const [credentialId, setCredentialId] = useState("");
  const [firmwarePackageId, setFirmwarePackageId] = useState("");
  const [classificationKey, setClassificationKey] = useState("");
  const [classificationState, setClassificationState] = useState<"unsupported" | "blocked">("unsupported");
  const [classificationNote, setClassificationNote] = useState("");

  const load = useCallback(async () => {
    const [nextMatrix, nextEvidence, nextHistory, nextPackages] = await Promise.all([
      getPhysicalCapabilityMatrix(deviceId),
      getWdmsEvidence(deviceId),
      listPhysicalOperationHistory(deviceId, 100),
      listFirmwarePackages(),
    ]);
    setMatrix(nextMatrix);
    setEvidence(nextEvidence);
    setHistory(nextHistory.items);
    setPackages(nextPackages.items);
    setServerHost((current) => current || window.location.hostname);
    setClassificationKey((current) => current || nextMatrix.capabilities[0]?.key || "");
  }, [deviceId]);

  useEffect(() => {
    setLoading(true);
    void load()
      .then(() => setError(null))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Physical parity tidak dapat dimuat."))
      .finally(() => setLoading(false));
  }, [load]);

  const serial = matrix?.device.serialNumber ?? "";
  const biometricGateReady = Boolean(
    matrix?.biometricGate.globalCollectionEnabled &&
    matrix.biometricGate.deviceCollectionEnabled &&
    matrix.biometricGate.keyringReady,
  );
  const exports = useMemo(() => physicalExportUrls(deviceId), [deviceId]);

  const run = useCallback(async (key: string, work: () => Promise<{ operationId?: string } | unknown>) => {
    setBusy(key);
    try {
      const result = await work() as { operationId?: string };
      setNotice(result.operationId ? `Operation ${result.operationId} berhasil di-queue sebagai canary.` : "Perubahan tersimpan.");
      setError(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operasi tidak dapat diproses.");
    } finally {
      setBusy(null);
    }
  }, [load]);

  if (loading && !matrix) {
    return <div className="mt-4 flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat full physical parity…</div>;
  }

  return (
    <div className="mt-6 space-y-4" id="full-wdms-physical-parity">
      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-primary" /><h2 className="text-base font-bold text-brand-heading">Full WDMS Physical Parity</h2></div>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">Semua action di bawah typed + allowlisted. Tidak ada raw command textarea. Execute normal tetap ditahan sampai capability berstatus verified; canary adalah default.</p>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Muat ulang</button>
        </div>
        {notice ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div> : null}
      </section>

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-bold text-brand-heading">Handshake & PUSH evidence</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-surface p-3"><div className="text-[11px] text-muted-foreground">Last registration</div><div className="mt-1 text-xs font-semibold">{fmt(evidence?.evidence.lastRegistrationAt ?? null)}</div></div>
          <div className="rounded-xl bg-surface p-3"><div className="text-[11px] text-muted-foreground">Last heartbeat/getrequest</div><div className="mt-1 text-xs font-semibold">{fmt(evidence?.evidence.lastHeartbeatAt ?? null)}</div></div>
          <div className="rounded-xl bg-surface p-3"><div className="text-[11px] text-muted-foreground">Observed PushProtVer</div><div className="mt-1 font-mono text-xs font-semibold">{evidence?.evidence.observedPushProtocolVersion ?? "—"}</div></div>
          <div className={`rounded-xl p-3 ${evidence?.pushProfile.idleAttendanceOnly ? "bg-emerald-50" : "bg-amber-50"}`}><div className="text-[11px] text-muted-foreground">Idle transfer profile</div><div className="mt-1 text-xs font-semibold">{evidence?.pushProfile.idleAttendanceOnly ? "ATTLOG-only" : "Canary flag aktif"}</div></div>
        </div>
        <div className="mt-3 text-xs leading-5 text-muted-foreground">Base TransFlag: {evidence?.pushProfile.baseTransferFlags.join(" + ") ?? "TransData + AttLog"}. USERINFO reads retired: ya. Arbitrary command: tidak.</div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-bold text-brand-heading">Capability matrix</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {matrix?.capabilities.map((item) => <div key={item.key} className={`rounded-xl border p-3 ${capabilityClass(item.state)}`}><div className="text-xs font-bold">{item.label}</div><div className="mt-1 font-mono text-[10px]">{item.key}</div><div className="mt-2 text-[11px]">{item.state}{item.lastResultCode === null ? "" : ` · RC ${item.lastResultCode}`}</div></div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-bold text-brand-heading">Low-risk typed canaries</h3>
        <p className="mt-1 text-xs text-muted-foreground">Confirmation phrase dibentuk dari target yang sedang dipilih. Tidak ada command bebas.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border p-4"><div className="text-xs font-bold">Time sync</div><div className="mt-2 font-mono text-[10px] text-muted-foreground">SYNC TIME {serial}</div><button type="button" disabled={busy !== null || !serial} onClick={() => void run("time", () => activeTimeSync(deviceId, `SYNC TIME ${serial}`))} className="mt-3 h-9 rounded-xl bg-brand-primary px-3 text-xs font-semibold text-white disabled:opacity-50">Canary time sync</button></div>
          <div className="rounded-xl border border-border p-4"><div className="text-xs font-bold">Duplicate punch period</div><input type="number" min={0} max={86400} value={duplicateSeconds} onChange={(event) => setDuplicateSeconds(Number(event.target.value))} className="mt-2 h-9 w-full rounded-xl border border-border px-3 text-sm" /><div className="mt-2 font-mono text-[10px] text-muted-foreground">SET DUPLICATE {serial} {duplicateSeconds}</div><button type="button" disabled={busy !== null || !serial} onClick={() => void run("duplicate", () => setDuplicatePunch(deviceId, duplicateSeconds, `SET DUPLICATE ${serial} ${duplicateSeconds}`))} className="mt-3 h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Canary + restore manually</button></div>
          <div className="rounded-xl border border-border p-4 lg:col-span-2"><div className="text-xs font-bold">Explicit employee.id → PIN user lifecycle</div><input value={employeeId} onChange={(event) => setEmployeeId(event.target.value.trim())} placeholder="employee UUID (bukan NIP/nama/PIN)" className="mt-2 h-9 w-full rounded-xl border border-border px-3 text-sm" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy !== null || !serial || !employeeId} onClick={() => void run("user-profile", () => pushUserProfile(deviceId, employeeId, 1, `UPSERT USER ${serial} ${employeeId}`))} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Push profile</button><button type="button" disabled={busy !== null || !serial || !employeeId} onClick={() => void run("user-disable", () => setUserEnabled(deviceId, employeeId, false, `DISABLE USER ${serial} ${employeeId}`))} className="h-9 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 disabled:opacity-50">Disable non-destructive</button><button type="button" disabled={busy !== null || !serial || !employeeId} onClick={() => void run("user-enable", () => setUserEnabled(deviceId, employeeId, true, `ENABLE USER ${serial} ${employeeId}`))} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Enable</button></div><div className="mt-2 text-[11px] text-muted-foreground">Tidak pernah menggunakan DATA DELETE user; leading-zero PIN tetap berasal dari mapping eksplisit.</div></div>
          <div className="rounded-xl border border-border p-4"><div className="text-xs font-bold">NTP</div><input value={ntpHost} onChange={(event) => setNtpHost(event.target.value)} className="mt-2 h-9 w-full rounded-xl border border-border px-3 text-sm" /><button type="button" disabled={busy !== null || !serial || !ntpHost} onClick={() => void run("ntp", () => setNtp(deviceId, ntpHost, `SET NTP ${serial} ${ntpHost}`))} className="mt-3 h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Canary NTP</button></div>
          <div className="rounded-xl border border-border p-4"><div className="text-xs font-bold">ADMS server safe rewrite</div><div className="mt-2 grid grid-cols-[1fr_6rem] gap-2"><input value={serverHost} onChange={(event) => setServerHost(event.target.value)} className="h-9 rounded-xl border border-border px-3 text-sm" /><input type="number" value={serverPort} onChange={(event) => setServerPort(Number(event.target.value))} className="h-9 rounded-xl border border-border px-3 text-sm" /></div><button type="button" disabled={busy !== null || !serial || !serverHost} onClick={() => void run("server", () => setServer(deviceId, serverHost, serverPort, `SET SERVER ${serial} ${serverHost}:${serverPort}`))} className="mt-3 h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Canary server</button><div className="mt-2 text-[11px] text-muted-foreground">Backend menolak canary yang mengubah ingress production.</div></div>
          <div className="rounded-xl border border-border p-4"><div className="text-xs font-bold">Reboot</div><button type="button" disabled={busy !== null || !serial} onClick={() => void run("reboot", () => rebootDevice(deviceId, `REBOOT ${serial}`))} className="mt-3 h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Canary reboot</button></div>
        </div>
      </section>

      <section className={`rounded-2xl border p-5 shadow-[var(--shadow-soft)] ${biometricGateReady ? "border-amber-300 bg-amber-50/40" : "border-slate-300 bg-slate-50"}`}>
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4" /><div><h3 className="text-sm font-bold">Biometric maintenance</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Gate: global {matrix?.biometricGate.globalCollectionEnabled ? "ON" : "OFF"} · device {matrix?.biometricGate.deviceCollectionEnabled ? "ON" : "OFF"} · keyring {matrix?.biometricGate.keyringReady ? "READY" : "NOT READY"}. Raw template/ciphertext/hash/IV/tag/key tidak dirender.</p></div></div>
        <fieldset disabled={!biometricGateReady || busy !== null} className="mt-4 grid gap-3 disabled:opacity-50 lg:grid-cols-2">
          <div><input value={employeeId} onChange={(event) => setEmployeeId(event.target.value.trim())} placeholder="employee UUID" className="h-9 w-full rounded-xl border border-border px-3 text-sm" /><div className="mt-2 grid grid-cols-3 gap-2"><select value={biometricProtocol} onChange={(event) => setBiometricProtocol(event.target.value as "legacy_fingerprint" | "unified")} className="h-9 rounded-xl border border-border px-2 text-xs"><option value="legacy_fingerprint">legacy FP</option><option value="unified">unified</option></select><input type="number" value={biometricType} onChange={(event) => setBiometricType(Number(event.target.value))} className="h-9 rounded-xl border border-border px-2 text-xs" /><input type="number" min={0} max={255} value={slotIndex} onChange={(event) => setSlotIndex(Number(event.target.value))} className="h-9 rounded-xl border border-border px-2 text-xs" /></div><div className="mt-2 flex gap-2"><button type="button" onClick={() => void run("bio-query", () => queryBiometric(deviceId, { employeeId, protocol: biometricProtocol, biometricType, slotIndex }))} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold">Query</button><button type="button" onClick={() => void run("bio-enroll", () => enrollBiometric(deviceId, { employeeId, protocol: biometricProtocol, biometricType, slotIndex, confirmation: `ENROLL BIOMETRIC ${serial} ${employeeId}` }))} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold">Enroll</button></div></div>
          <div><input value={credentialId} onChange={(event) => setCredentialId(event.target.value.trim())} placeholder="credential UUID (vault reference only)" className="h-9 w-full rounded-xl border border-border px-3 text-sm" /><div className="mt-2 flex gap-2"><button type="button" disabled={!credentialId} onClick={() => void run("bio-restore", () => restoreBiometric(deviceId, credentialId, `RESTORE BIOMETRIC ${serial} ${credentialId}`))} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Restore/distribute</button><button type="button" disabled={!credentialId} onClick={() => void run("bio-delete", () => deleteBiometric(deviceId, credentialId, `DELETE BIOMETRIC ${serial} ${credentialId}`))} className="h-9 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-800 disabled:opacity-50">Delete selected</button></div></div>
        </fieldset>
      </section>

      <section className="rounded-2xl border border-amber-300 bg-amber-50/40 p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-bold text-amber-950">Firmware — explicit target, canary first</h3>
        <select value={firmwarePackageId} onChange={(event) => setFirmwarePackageId(event.target.value)} className="mt-3 h-9 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm"><option value="">Pilih package yang model-nya cocok…</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.targetModel} → {item.targetVersion} · {item.filename}</option>)}</select>
        {(() => { const selected = packages.find((item) => item.id === firmwarePackageId); return selected ? <><div className="mt-2 font-mono text-[10px] text-amber-900">UPGRADE FIRMWARE {serial} {selected.targetVersion}</div><button type="button" disabled={busy !== null || !serial} onClick={() => void run("firmware", () => upgradeFirmware(deviceId, selected.id, `UPGRADE FIRMWARE ${serial} ${selected.targetVersion}`))} className="mt-3 h-9 rounded-xl bg-amber-900 px-3 text-xs font-semibold text-white disabled:opacity-50">Queue firmware canary</button></> : null; })()}
        <p className="mt-2 text-[11px] text-amber-900">Tidak ada broadcast. Backend mengikat package ke model mesin dan short-lived download ticket.</p>
      </section>

      <section className="rounded-2xl border border-red-300 bg-red-50/50 p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-bold text-red-900">Danger zone / break-glass</h3>
        <p className="mt-1 text-xs leading-5 text-red-800">Destructive capability harus paling akhir. Tombol ini tetap membuat canary operation dan membutuhkan phrase exact.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy !== null || !serial} onClick={() => void run("clear-att", () => clearPhysicalData(deviceId, "clear-attendance", `CLEAR ATTENDANCE ${serial}`))} className="h-9 rounded-xl border border-red-300 bg-white px-3 text-xs font-semibold text-red-800 disabled:opacity-50">CLEAR ATTENDANCE</button><button type="button" disabled={busy !== null || !serial} onClick={() => void run("clear-photo", () => clearPhysicalData(deviceId, "clear-photo", `CLEAR PHOTO ${serial}`))} className="h-9 rounded-xl border border-red-300 bg-white px-3 text-xs font-semibold text-red-800 disabled:opacity-50">CLEAR PHOTO</button><button type="button" disabled={busy !== null || !serial} onClick={() => void run("clear-all", () => clearPhysicalData(deviceId, "clear-all", `CLEAR ALL DATA ${serial}`))} className="h-9 rounded-xl bg-red-800 px-3 text-xs font-semibold text-white disabled:opacity-50">CLEAR ALL DATA</button></div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-bold text-brand-heading">Evidence classification & exports</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_10rem_2fr_auto]"><select value={classificationKey} onChange={(event) => setClassificationKey(event.target.value)} className="h-9 rounded-xl border border-border px-2 text-xs">{matrix?.capabilities.map((item) => <option key={item.key} value={item.key}>{item.key}</option>)}</select><select value={classificationState} onChange={(event) => setClassificationState(event.target.value as "unsupported" | "blocked")} className="h-9 rounded-xl border border-border px-2 text-xs"><option value="unsupported">unsupported</option><option value="blocked">blocked</option></select><input value={classificationNote} onChange={(event) => setClassificationNote(event.target.value)} placeholder="Evidence note hasil physical canary" className="h-9 rounded-xl border border-border px-3 text-sm" /><button type="button" disabled={busy !== null || !classificationKey || !classificationNote.trim()} onClick={() => void run("classify", () => markCapabilityUnsupportedOrBlocked(deviceId, { capabilityKey: classificationKey, state: classificationState, note: classificationNote.trim(), confirmation: `${classificationState.toUpperCase()} ${classificationKey} ${serial}` }))} className="h-9 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50">Simpan evidence</button></div>
        <div className="mt-4 flex flex-wrap gap-2">{Object.entries(exports).map(([key, href]) => <a key={key} href={href} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold"><Download className="h-3.5 w-3.5" />{key}</a>)}</div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <h3 className="text-sm font-bold text-brand-heading">Physical operation history</h3>
        <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr className="border-b border-border text-muted-foreground"><th className="px-2 py-2">Waktu</th><th className="px-2 py-2">Capability</th><th className="px-2 py-2">Operation</th><th className="px-2 py-2">Mode</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">RC</th></tr></thead><tbody>{history.map((item) => <tr key={item.id} className="border-b border-border/60"><td className="px-2 py-2 whitespace-nowrap">{fmt(item.createdAt)}</td><td className="px-2 py-2 font-mono text-[10px]">{item.capabilityKey}</td><td className="px-2 py-2">{item.operationKey}</td><td className="px-2 py-2">{item.mode}</td><td className="px-2 py-2">{item.status}</td><td className="px-2 py-2">{item.lastReturnCode ?? "—"}</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-[11px] text-muted-foreground">History tidak merender raw wire command, template biometric, ciphertext, IV, auth tag, key ID, maupun firmware token.</p>
      </section>
    </div>
  );
}
