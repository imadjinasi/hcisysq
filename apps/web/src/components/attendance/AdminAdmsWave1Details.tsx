import {
  Activity,
  Database,
  FileClock,
  Gauge,
  Info,
  RefreshCw,
  Save,
  ServerCog,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listAdmsDevices, type AdmsDevice } from "@/lib/attendance";

type Health = {
  deviceId: string;
  connectivityStatus: "online" | "offline" | "unknown";
  connectivityTimeoutOverrideSeconds: number | null;
  effectiveConnectivityTimeoutSeconds: number | null;
  observedMedianRequestIntervalSeconds: number | null;
  lastSuccessfulSyncAt: string | null;
};

type Telemetry = {
  deviceId: string;
  model: string | null;
  firmwareVersion: string | null;
  transportObserved: Record<string, unknown> | null;
  infoObserved: Record<string, unknown> | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastIp: string | null;
  reconciliationEnabled: boolean;
  reconciliationIntervalMinutes: number;
  reconciliationLookbackHours: number;
  reconciliationLastRequestedAt: string | null;
};

type Transaction = {
  id: string;
  pin: string;
  occurredAtRaw: string;
  occurredAt: string;
  receivedAt: string;
  sourceRequestId: string;
  employeeId: string | null;
  employeeNumber: string | null;
  employeeName: string | null;
};

type ReconciliationItem = {
  commandId: string;
  commandNumber: string;
  reason: string;
  status: string;
  requestedRangeStart: string;
  requestedRangeEnd: string;
  deliveredAt: string | null;
  completedAt: string | null;
  createdAt: string;
  currentPersistedCount: number;
  persistedSinceDeliveryCount: number;
  firstOccurredAt: string | null;
  lastOccurredAt: string | null;
  attlogRequestCount: number;
};

type Reconciliation = {
  coverageBasis: "persisted_range";
  expectedCount: null;
  duplicatesObserved: null;
  note: string;
  items: ReconciliationItem[];
};

type SafeLogs = {
  rawRequestBodiesExposed: false;
  requests: Array<{
    id: string;
    method: string;
    path: string;
    classification: string;
    responseStatus: number;
    bodyByteLength: number;
    bodyCaptured: boolean;
    receivedAt: string;
  }>;
  commandEvents: Array<{
    id: string;
    commandId: string;
    commandNumber: string;
    commandType: string;
    eventType: string;
    createdAt: string;
  }>;
  quarantines: Array<{
    id: string;
    reason: string;
    details: Record<string, unknown>;
    createdAt: string;
  }>;
  adminAudit: Array<{
    id: string;
    action: string;
    createdAt: string;
  }>;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Operasi mesin fingerprint gagal.");
}

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
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function AdminAdmsWave1Details() {
  const [devices, setDevices] = useState<AdmsDevice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [logs, setLogs] = useState<SafeLogs | null>(null);
  const [timeoutInput, setTimeoutInput] = useState("");
  const [reconciliationEnabled, setReconciliationEnabled] = useState(false);
  const [reconciliationInterval, setReconciliationInterval] = useState("1440");
  const [reconciliationLookback, setReconciliationLookback] = useState("48");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const response = await listAdmsDevices();
    setDevices(response.items);
    setSelectedId((current) =>
      current && response.items.some((item) => item.id === current)
        ? current
        : response.items[0]?.id ?? "",
    );
  }, []);

  const loadSelected = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setHealth(null);
      setTelemetry(null);
      setTransactions([]);
      setReconciliation(null);
      setLogs(null);
      return;
    }
    try {
      const [
        healthResponse,
        telemetryResponse,
        transactionResponse,
        reconciliationResponse,
        logResponse,
      ] = await Promise.all([
        readJson<{ item: Health }>(
          await fetch(`/api/admin/attendance/adms/devices/${deviceId}/health`, { credentials: "include" }),
        ),
        readJson<{ item: Telemetry }>(
          await fetch(`/api/admin/attendance/adms/devices/${deviceId}/telemetry`, { credentials: "include" }),
        ),
        readJson<{ items: Transaction[] }>(
          await fetch(`/api/admin/attendance/adms/devices/${deviceId}/transactions`, { credentials: "include" }),
        ),
        readJson<Reconciliation>(
          await fetch(`/api/admin/attendance/adms/devices/${deviceId}/reconciliation`, { credentials: "include" }),
        ),
        readJson<SafeLogs>(
          await fetch(`/api/admin/attendance/adms/devices/${deviceId}/logs`, { credentials: "include" }),
        ),
      ]);
      setHealth(healthResponse.item);
      setTelemetry(telemetryResponse.item);
      setTransactions(transactionResponse.items);
      setReconciliation(reconciliationResponse);
      setLogs(logResponse);
      setTimeoutInput(
        healthResponse.item.connectivityTimeoutOverrideSeconds === null
          ? ""
          : String(healthResponse.item.connectivityTimeoutOverrideSeconds),
      );
      setReconciliationEnabled(telemetryResponse.item.reconciliationEnabled);
      setReconciliationInterval(String(telemetryResponse.item.reconciliationIntervalMinutes));
      setReconciliationLookback(String(telemetryResponse.item.reconciliationLookbackHours));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Detail operasi mesin tidak dapat dimuat.");
    }
  }, []);

  useEffect(() => {
    void loadDevices().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Registry mesin tidak dapat dimuat.");
    });
  }, [loadDevices]);

  useEffect(() => {
    void loadSelected(selectedId);
    if (!selectedId) return;
    const timer = window.setInterval(() => void loadSelected(selectedId), 15_000);
    return () => window.clearInterval(timer);
  }, [loadSelected, selectedId]);

  const selected = useMemo(
    () => devices.find((item) => item.id === selectedId) ?? null,
    [devices, selectedId],
  );

  const saveTimeout = async () => {
    if (!selected) return;
    const parsed = timeoutInput.trim() === "" ? null : Number(timeoutInput);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 30 || parsed > 3600)) {
      setError("Timeout override harus 30-3600 detik, atau kosongkan untuk adaptive mode.");
      return;
    }
    setBusy("connectivity");
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/devices/${selected.id}/connectivity-policy`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeoutSeconds: parsed }),
        }),
      );
      await loadSelected(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connectivity policy gagal disimpan.");
    } finally {
      setBusy(null);
    }
  };

  const saveReconciliation = async () => {
    if (!selected) return;
    const intervalMinutes = Number(reconciliationInterval);
    const lookbackHours = Number(reconciliationLookback);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 60 || intervalMinutes > 10080) {
      setError("Interval reconciliation harus 60-10080 menit.");
      return;
    }
    if (!Number.isInteger(lookbackHours) || lookbackHours < 1 || lookbackHours > 744) {
      setError("Lookback reconciliation harus 1-744 jam (maksimal 31 hari).");
      return;
    }
    setBusy("reconciliation");
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/devices/${selected.id}/reconciliation-policy`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: reconciliationEnabled,
            intervalMinutes,
            lookbackHours,
          }),
        }),
      );
      await loadSelected(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reconciliation policy gagal disimpan.");
    } finally {
      setBusy(null);
    }
  };

  const readInformation = async () => {
    if (!selected || selected.lifecycle !== "active") return;
    setBusy("info");
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/devices/${selected.id}/commands/read-information`, {
          method: "POST",
          credentials: "include",
        }),
      );
      await loadSelected(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Read Information gagal dijadwalkan.");
    } finally {
      setBusy(null);
    }
  };

  const transportEntries = Object.entries(telemetry?.transportObserved ?? {})
    .filter(([key]) => ["pushver", "PushVersion", "language", "observedAt"].includes(key));
  const infoEntries = Object.entries(telemetry?.infoObserved ?? {});

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-brand-heading">Transactions, Reconciliation & Logs</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Raw punch tetap fakta immutable. Reconciliation hanya menunjukkan persisted coverage yang dapat dibuktikan; HCIS tidak menebak expected count atau jumlah duplicate yang sudah ditolak dedup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSelected(selectedId)}
          disabled={!selectedId || busy !== null}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Segarkan detail
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-64 text-xs font-semibold text-muted-foreground">
          Mesin
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-brand-heading"
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.displayName || device.serialNumber} · {device.serialNumber}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <div className="text-xs text-muted-foreground">
            lifecycle <span className="font-semibold text-brand-heading">{selected.lifecycle}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      {selected && health ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
              <Gauge className="h-4 w-4" /> Connectivity policy
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <Stat label="Status" value={health.connectivityStatus} />
              <Stat
                label="Timeout efektif"
                value={health.effectiveConnectivityTimeoutSeconds === null ? "Belum cukup data" : `${health.effectiveConnectivityTimeoutSeconds}s`}
              />
              <Stat
                label="Median request"
                value={health.observedMedianRequestIntervalSeconds === null ? "—" : `${Math.round(health.observedMedianRequestIntervalSeconds)}s`}
              />
              <Stat label="Last sync sukses" value={fmt(health.lastSuccessfulSyncAt)} />
            </div>
            <label className="mt-4 block text-xs font-semibold text-muted-foreground">
              Override timeout (detik)
              <div className="mt-1 flex gap-2">
                <input
                  inputMode="numeric"
                  value={timeoutInput}
                  onChange={(event) => setTimeoutInput(event.target.value)}
                  placeholder="kosong = adaptive"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border px-3 text-sm"
                />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void saveTimeout()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> Simpan
                </button>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
                <ServerCog className="h-4 w-4" /> Telemetry aman
              </div>
              <button
                type="button"
                disabled={busy !== null || selected.lifecycle !== "active"}
                onClick={() => void readInformation()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] font-bold disabled:opacity-50"
              >
                <Info className="h-3.5 w-3.5" /> Read Information
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <Stat label="Model registry" value={telemetry?.model ?? "—"} />
              <Stat label="Firmware" value={telemetry?.firmwareVersion ?? "—"} />
              <Stat label="IP terakhir" value={telemetry?.lastIp ?? "—"} />
              <Stat label="Request sukses" value={fmt(telemetry?.lastSuccessfulRequestAt ?? null)} />
            </div>
            <div className="mt-4 max-h-60 space-y-2 overflow-auto">
              {infoEntries.map(([key, value]) => (
                <ObservedRow key={`info-${key}`} label={key} value={displayObserved(value)} />
              ))}
              {transportEntries.map(([key, value]) => (
                <ObservedRow key={`transport-${key}`} label={key} value={displayObserved(value)} />
              ))}
              {infoEntries.length === 0 && transportEntries.length === 0 ? (
                <div className="text-xs text-muted-foreground">Belum ada metadata transport/INFO yang teramati.</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
              <Database className="h-4 w-4" /> Reconciliation policy
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-brand-heading">
              <input
                type="checkbox"
                checked={reconciliationEnabled}
                onChange={(event) => setReconciliationEnabled(event.target.checked)}
              />
              Aktifkan periodic bounded reconciliation
            </label>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              Default OFF. Saat diaktifkan, HCIS hanya menjadwalkan DATA QUERY ATTLOG dengan window maksimal 31 hari; tidak ada command “upload all” buatan.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Interval (menit)
                <input
                  inputMode="numeric"
                  value={reconciliationInterval}
                  onChange={(event) => setReconciliationInterval(event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-border px-2 text-xs"
                />
              </label>
              <label className="text-[11px] font-semibold text-muted-foreground">
                Lookback (jam)
                <input
                  inputMode="numeric"
                  value={reconciliationLookback}
                  onChange={(event) => setReconciliationLookback(event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-border px-2 text-xs"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void saveReconciliation()}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Simpan policy
            </button>
            <div className="mt-3 text-[11px] text-muted-foreground">
              Last scheduled: {fmt(telemetry?.reconciliationLastRequestedAt ?? null)}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-border/70 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
            <Database className="h-4 w-4" /> Historical reconciliation
          </div>
          <div className="mt-3 space-y-2">
            {(reconciliation?.items ?? []).slice(0, 8).map((item) => (
              <div key={item.commandId} className="rounded-lg bg-surface p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-brand-heading">C:{item.commandNumber}</span>
                  <span className="font-semibold text-muted-foreground">{item.reason} · {item.status}</span>
                </div>
                <div className="mt-2 text-muted-foreground">
                  {fmt(item.requestedRangeStart)} → {fmt(item.requestedRangeEnd)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Stat label="Persisted" value={String(item.currentPersistedCount)} />
                  <Stat label="Sejak delivery" value={String(item.persistedSinceDeliveryCount)} />
                  <Stat label="ATTLOG req" value={String(item.attlogRequestCount)} />
                </div>
              </div>
            ))}
            {(reconciliation?.items.length ?? 0) === 0 ? (
              <div className="text-xs text-muted-foreground">Belum ada historical range command.</div>
            ) : null}
          </div>
          {reconciliation ? (
            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{reconciliation.note}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border/70 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
            <FileClock className="h-4 w-4" /> Logs aman
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Raw request body tidak diekspos. Yang ditampilkan hanya metadata request, lifecycle command, quarantine summary, dan immutable Admin audit.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <LogList
              title="Request"
              items={(logs?.requests ?? []).slice(0, 6).map((item) => ({
                id: item.id,
                primary: `${item.method} ${item.path} · ${item.responseStatus}`,
                secondary: `${item.classification} · ${item.bodyByteLength} B · ${fmt(item.receivedAt)}`,
              }))}
            />
            <LogList
              title="Command"
              items={(logs?.commandEvents ?? []).slice(0, 6).map((item) => ({
                id: item.id,
                primary: `C:${item.commandNumber} · ${item.eventType}`,
                secondary: `${item.commandType} · ${fmt(item.createdAt)}`,
              }))}
            />
            <LogList
              title="Quarantine"
              items={(logs?.quarantines ?? []).slice(0, 6).map((item) => ({
                id: item.id,
                primary: item.reason,
                secondary: fmt(item.createdAt),
              }))}
            />
            <LogList
              title="Admin audit"
              items={(logs?.adminAudit ?? []).slice(0, 6).map((item) => ({
                id: item.id,
                primary: item.action,
                secondary: fmt(item.createdAt),
              }))}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border/70 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
          <Activity className="h-4 w-4" /> Raw transactions terbaru
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/70">
                <th className="px-2 py-2 font-semibold">Waktu device</th>
                <th className="px-2 py-2 font-semibold">PIN</th>
                <th className="px-2 py-2 font-semibold">Pegawai</th>
                <th className="px-2 py-2 font-semibold">Diterima HCIS</th>
                <th className="px-2 py-2 font-semibold">Source request</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 50).map((item) => (
                <tr key={item.id} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-2 text-brand-heading">{fmt(item.occurredAt)}</td>
                  <td className="px-2 py-2 font-mono font-semibold text-brand-heading">{item.pin}</td>
                  <td className="px-2 py-2">
                    {item.employeeName ? (
                      <>
                        <div className="font-semibold text-brand-heading">{item.employeeName}</div>
                        <div className="text-[11px] text-muted-foreground">{item.employeeNumber ?? "—"}</div>
                      </>
                    ) : (
                      <span className="text-amber-700">Belum dimapping</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{fmt(item.receivedAt)}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">{item.sourceRequestId}</td>
                </tr>
              ))}
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-5 text-center text-muted-foreground">
                    Belum ada raw transaction untuk mesin ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ObservedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-xs">
      <span className="font-semibold text-muted-foreground">{label}</span>
      <span className="break-all text-right font-mono text-brand-heading">{value}</span>
    </div>
  );
}

function LogList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; primary: string; secondary: string }>;
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg bg-surface px-3 py-2 text-[11px]">
            <div className="font-semibold text-brand-heading">{item.primary}</div>
            <div className="mt-1 text-muted-foreground">{item.secondary}</div>
          </div>
        ))}
        {items.length === 0 ? <div className="text-[11px] text-muted-foreground">Belum ada data.</div> : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-bold text-brand-heading">{value}</div>
    </div>
  );
}
