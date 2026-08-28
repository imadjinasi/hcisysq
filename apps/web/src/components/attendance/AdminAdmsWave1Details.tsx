import { Activity, Database, Gauge, RefreshCw, Save, ServerCog } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listAdmsDevices, type AdmsDevice } from "@/lib/attendance";

type Health = {
  deviceId: string;
  connectivityStatus: "online" | "offline" | "unknown";
  connectivityTimeoutOverrideSeconds: number | null;
  effectiveConnectivityTimeoutSeconds: number | null;
  observedMedianRequestIntervalSeconds: number | null;
};

type Telemetry = {
  deviceId: string;
  model: string | null;
  firmwareVersion: string | null;
  transportObserved: Record<string, unknown> | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastIp: string | null;
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
  const [timeoutInput, setTimeoutInput] = useState("");
  const [busy, setBusy] = useState(false);
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
      return;
    }
    try {
      const [healthResponse, telemetryResponse, transactionResponse, reconciliationResponse] = await Promise.all([
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
      ]);
      setHealth(healthResponse.item);
      setTelemetry(telemetryResponse.item);
      setTransactions(transactionResponse.items);
      setReconciliation(reconciliationResponse);
      setTimeoutInput(
        healthResponse.item.connectivityTimeoutOverrideSeconds === null
          ? ""
          : String(healthResponse.item.connectivityTimeoutOverrideSeconds),
      );
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
    setBusy(true);
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
      setBusy(false);
    }
  };

  const transportEntries = Object.entries(telemetry?.transportObserved ?? {})
    .filter(([key]) => ["pushver", "PushVersion", "language", "observedAt"].includes(key));

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-brand-heading">Transactions & Reconciliation</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Raw punch tetap fakta immutable. Reconciliation hanya menunjukkan persisted coverage yang dapat dibuktikan; HCIS tidak menebak expected count atau jumlah duplicate yang sudah ditolak dedup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSelected(selectedId)}
          disabled={!selectedId}
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
              <Stat
                label="Mode"
                value={health.connectivityTimeoutOverrideSeconds === null ? "Adaptive" : "Override"}
              />
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
                  disabled={busy}
                  onClick={() => void saveTimeout()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> Simpan
                </button>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
              <ServerCog className="h-4 w-4" /> Telemetry aman
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <Stat label="Model registry" value={telemetry?.model ?? "—"} />
              <Stat label="Firmware registry" value={telemetry?.firmwareVersion ?? "—"} />
              <Stat label="IP terakhir" value={telemetry?.lastIp ?? "—"} />
              <Stat label="Request sukses" value={fmt(telemetry?.lastSuccessfulRequestAt ?? null)} />
            </div>
            <div className="mt-4 space-y-2">
              {transportEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-xs">
                  <span className="font-semibold text-muted-foreground">{key}</span>
                  <span className="break-all text-right font-mono text-brand-heading">{displayObserved(value)}</span>
                </div>
              ))}
              {transportEntries.length === 0 ? (
                <div className="text-xs text-muted-foreground">Belum ada metadata transport yang teramati.</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-brand-heading">
              <Database className="h-4 w-4" /> Historical reconciliation
            </div>
            <div className="mt-3 space-y-2">
              {(reconciliation?.items ?? []).slice(0, 5).map((item) => (
                <div key={item.commandId} className="rounded-lg bg-surface p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-brand-heading">C:{item.commandNumber}</span>
                    <span className="font-semibold text-muted-foreground">{item.status}</span>
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
        </div>
      ) : null}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-bold text-brand-heading">{value}</div>
    </div>
  );
}
