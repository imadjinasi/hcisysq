import { Activity, AlertTriangle, Clock3, Database, Loader2, Radio, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { listAdmsDevices, type AdmsDevice } from "@/lib/attendance";

type DetectedDevice = {
  id: string;
  serialNumber: string;
  status: "detected" | "claimed" | "ignored";
  firstSeenAt: string;
  lastSeenAt: string;
  lastIp: string | null;
  observedCount: number;
  claimedDeviceId: string | null;
};

type Health = {
  deviceId: string;
  lifecycle: string;
  connectivityStatus: "online" | "offline" | "unknown";
  lastSeenAt: string | null;
  lastSuccessfulRequestAt: string | null;
  lastIp: string | null;
  observedMedianRequestIntervalSeconds: number | null;
  effectiveConnectivityTimeoutSeconds: number | null;
  offlineAt: string | null;
  lastCommandActivityAt: string | null;
  lastTransactionActivityAt: string | null;
};

type CommandItem = {
  id: string;
  commandNumber: string;
  wireCommand: string;
  reason: string;
  status: string;
  attemptCount: number;
  requestedRangeStart: string | null;
  requestedRangeEnd: string | null;
  returnCode: number | null;
  createdAt: string;
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

function connectivityClass(status: Health["connectivityStatus"]) {
  if (status === "online") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "offline") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

export function AdminAdmsWave1Operations() {
  const [devices, setDevices] = useState<AdmsDevice[]>([]);
  const [detected, setDetected] = useState<DetectedDevice[]>([]);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [selectedId, setSelectedId] = useState("");
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  const load = useCallback(async () => {
    try {
      const [deviceResponse, detectedResponse] = await Promise.all([
        listAdmsDevices(),
        readJson<{ items: DetectedDevice[] }>(
          await fetch("/api/admin/attendance/adms/detected-devices", { credentials: "include" }),
        ),
      ]);
      setDevices(deviceResponse.items);
      setDetected(detectedResponse.items);
      setSelectedId((current) =>
        current && deviceResponse.items.some((item) => item.id === current)
          ? current
          : deviceResponse.items[0]?.id ?? "",
      );
      const healthEntries = await Promise.all(
        deviceResponse.items.map(async (device) => {
          const response = await readJson<{ item: Health }>(
            await fetch(`/api/admin/attendance/adms/devices/${device.id}/health`, {
              credentials: "include",
            }),
          );
          return [device.id, response.item] as const;
        }),
      );
      setHealth(Object.fromEntries(healthEntries));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status mesin tidak dapat dimuat.");
    }
  }, []);

  const loadCommands = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setCommands([]);
      return;
    }
    try {
      const response = await readJson<{ items: CommandItem[] }>(
        await fetch(`/api/admin/attendance/adms/devices/${deviceId}/commands`, {
          credentials: "include",
        }),
      );
      setCommands(response.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Riwayat command tidak dapat dimuat.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void loadCommands(selectedId);
  }, [loadCommands, selectedId]);

  const selected = useMemo(
    () => devices.find((item) => item.id === selectedId) ?? null,
    [devices, selectedId],
  );
  const selectedHealth = selected ? health[selected.id] : undefined;

  const claim = async (item: DetectedDevice) => {
    setBusy(`claim:${item.id}`);
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/detected-devices/${item.id}/claim`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: null, timezone: "Asia/Jakarta" }),
        }),
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Claim mesin gagal.");
    } finally {
      setBusy(null);
    }
  };

  const syncNew = async () => {
    if (!selected) return;
    setBusy("sync-new");
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/devices/${selected.id}/transfers/sync-new`, {
          method: "POST",
          credentials: "include",
        }),
      );
      await loadCommands(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sync transaksi baru gagal dijadwalkan.");
    } finally {
      setBusy(null);
    }
  };

  const uploadRange = async () => {
    if (!selected || !rangeStart || !rangeEnd) return;
    setBusy("range");
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/devices/${selected.id}/transfers/attendance-range`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startAt: new Date(rangeStart).toISOString(),
            endAt: new Date(rangeEnd).toISOString(),
          }),
        }),
      );
      await loadCommands(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Historical upload gagal dijadwalkan.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (commandId: string) => {
    setBusy(`cancel:${commandId}`);
    try {
      const response = await fetch(`/api/admin/attendance/adms/commands/${commandId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) await readJson(response);
      await loadCommands(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Command gagal dibatalkan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-brand-heading">WDMS Core Device Plane</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Connectivity terpisah dari lifecycle. Historical recovery memakai DATA QUERY ATTLOG range dan tetap menghasilkan raw punch netral.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Segarkan
        </button>
      </div>

      {error ? (
        <div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Radio className="h-4 w-4" /> Mesin
          </div>
          {devices.map((device) => {
            const itemHealth = health[device.id];
            return (
              <button
                key={device.id}
                type="button"
                onClick={() => setSelectedId(device.id)}
                className={`w-full rounded-xl border p-3 text-left ${selectedId === device.id ? "border-brand-primary bg-brand-primary/5" : "border-border/70"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-brand-heading">
                    {device.displayName || device.serialNumber}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-1 text-[11px] font-bold ${connectivityClass(itemHealth?.connectivityStatus ?? "unknown")}`}
                  >
                    {itemHealth?.connectivityStatus ?? "unknown"}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {device.serialNumber}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  <span>Lifecycle: {device.lifecycle}</span>
                  <span>{fmt(itemHealth?.lastSeenAt ?? null)}</span>
                </div>
              </button>
            );
          })}
          {devices.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
              Belum ada mesin terdaftar.
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {selected && selectedHealth ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={<Activity className="h-4 w-4" />} label="Connectivity" value={selectedHealth.connectivityStatus} />
              <Metric icon={<Clock3 className="h-4 w-4" />} label="Last seen" value={fmt(selectedHealth.lastSeenAt)} />
              <Metric icon={<Database className="h-4 w-4" />} label="Last transaksi" value={fmt(selectedHealth.lastTransactionActivityAt)} />
              <Metric
                icon={<Radio className="h-4 w-4" />}
                label="Timeout efektif"
                value={selectedHealth.effectiveConnectivityTimeoutSeconds ? `${selectedHealth.effectiveConnectivityTimeoutSeconds}s` : "Belum cukup data"}
              />
            </div>
          ) : null}

          {selected ? (
            <div className="rounded-xl border border-border/70 p-4">
              <h3 className="text-sm font-bold text-brand-heading">Data Transfer</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== null || selected.lifecycle !== "active"}
                  onClick={() => void syncNew()}
                  className="h-9 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {busy === "sync-new" ? "Menjadwalkan…" : "Sync transaksi baru"}
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
                <label className="text-xs font-semibold text-muted-foreground">
                  Mulai
                  <input
                    type="datetime-local"
                    value={rangeStart}
                    onChange={(event) => setRangeStart(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  Selesai
                  <input
                    type="datetime-local"
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-border px-3"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy !== null || !rangeStart || !rangeEnd || selected.lifecycle !== "active"}
                  onClick={() => void uploadRange()}
                  className="mt-auto h-10 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-50"
                >
                  {busy === "range" ? "Menjadwalkan…" : "Upload rentang"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-border/70 p-4">
            <h3 className="text-sm font-bold text-brand-heading">Command terbaru</h3>
            <div className="mt-3 space-y-2">
              {commands.slice(0, 8).map((command) => (
                <div
                  key={command.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-3 text-xs"
                >
                  <div>
                    <div className="font-mono font-semibold text-brand-heading">C:{command.commandNumber}</div>
                    <div className="mt-1 text-muted-foreground">
                      {command.reason} · {command.status} · attempt {command.attemptCount}
                    </div>
                  </div>
                  {command.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => void cancel(command.id)}
                      disabled={busy !== null}
                      className="rounded-lg border border-border px-2 py-1 font-semibold disabled:opacity-50"
                    >
                      Batal
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Return {command.returnCode ?? "—"}</span>
                  )}
                </div>
              ))}
              {commands.length === 0 ? (
                <div className="text-xs text-muted-foreground">Belum ada command.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-dashed border-border p-4">
        <h3 className="text-sm font-bold text-brand-heading">Terdeteksi, belum dipercaya</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {detected.filter((item) => item.status === "detected").map((item) => (
            <div key={item.id} className="rounded-xl border border-border/70 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-brand-heading">{item.serialNumber}</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void claim(item)}
                  className="rounded-lg bg-brand-primary px-2 py-1 font-bold text-white disabled:opacity-50"
                >
                  {busy === `claim:${item.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Claim"
                  )}
                </button>
              </div>
              <div className="mt-2 text-muted-foreground">
                IP {item.lastIp ?? "—"} · terlihat {item.observedCount}× · terakhir {fmt(item.lastSeenAt)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Claim membuat registry trusted dalam lifecycle disabled; aktivasi tetap tindakan terpisah.
              </div>
            </div>
          ))}
          {detected.filter((item) => item.status === "detected").length === 0 ? (
            <div className="text-xs text-muted-foreground">Tidak ada mesin baru yang menunggu claim.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-sm font-bold text-brand-heading">{value}</div>
    </div>
  );
}
