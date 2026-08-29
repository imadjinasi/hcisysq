import { RefreshCw, Search, UserRoundSearch } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listAdmsDevices, type AdmsDevice } from "@/lib/attendance";

type CommandItem = {
  id: string;
  commandNumber: string;
  commandType: string;
  wireCommand: string;
  reason: string;
  status: string;
  deliveredAt: string | null;
  completedAt: string | null;
  returnCode: number | null;
  resultCommand: string | null;
  createdAt: string;
};

type RosterItem = {
  id: string;
  pin: string;
  displayName: string | null;
  cardNumber: string | null;
  privilege: string | null;
  verifyMode: string | null;
  sourceRequestId: string | null;
  lastSeenAt: string;
};

type RosterResponse = {
  inventorySemantics: "observed_only";
  completeSnapshot: false;
  items: RosterItem[];
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Operasi USERINFO gagal.");
}

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function AdminAdmsWave2UserInfoCanary() {
  const [devices, setDevices] = useState<AdmsDevice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [roster, setRoster] = useState<RosterResponse | null>(null);
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

  const loadStatus = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setCommands([]);
      setRoster(null);
      return;
    }
    const [commandResult, rosterResult] = await Promise.all([
      readJson<{ items: CommandItem[] }>(
        await fetch(`/api/admin/attendance/adms/devices/${deviceId}/commands`, { credentials: "include" }),
      ),
      readJson<RosterResponse>(
        await fetch(`/api/admin/attendance/adms/devices/${deviceId}/roster`, { credentials: "include" }),
      ),
    ]);
    setCommands(commandResult.items);
    setRoster(rosterResult);
  }, []);

  useEffect(() => {
    void loadDevices().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Registry mesin tidak dapat dimuat.");
    });
  }, [loadDevices]);

  useEffect(() => {
    void loadStatus(selectedId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Status USERINFO tidak dapat dimuat.");
    });
  }, [loadStatus, selectedId]);

  const selected = useMemo(
    () => devices.find((item) => item.id === selectedId) ?? null,
    [devices, selectedId],
  );
  const normalizedPin = pin.trim();
  const pinValid = /^\d{1,128}$/.test(normalizedPin);
  const latestCommand = useMemo(
    () => commands.find(
      (item) => item.commandType === "query_user_info" && item.wireCommand === `DATA QUERY USERINFO PIN=${normalizedPin}`,
    ) ?? null,
    [commands, normalizedPin],
  );
  const rosterItem = useMemo(
    () => roster?.items.find((item) => item.pin === normalizedPin) ?? null,
    [roster, normalizedPin],
  );
  const uploadObservedAfterDelivery = Boolean(
    latestCommand?.deliveredAt &&
    rosterItem?.sourceRequestId &&
    new Date(rosterItem.lastSeenAt).getTime() >= new Date(latestCommand.deliveredAt).getTime(),
  );
  const commandSucceeded = latestCommand?.status === "succeeded" && (latestCommand.returnCode ?? -1) >= 0;
  const canaryVerified = Boolean(commandSucceeded && uploadObservedAfterDelivery);

  const queueQuery = async () => {
    if (!selected || !pinValid || selected.lifecycle !== "active") return;
    if (!window.confirm(`Query USERINFO read-only untuk PIN ${normalizedPin} pada ${selected.serialNumber}?`)) return;
    setBusy(true);
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/devices/${selected.id}/commands/query-user-info`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin: normalizedPin }),
        }),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      await loadStatus(selected.id);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Query USERINFO gagal dijadwalkan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-brand-heading">
            <UserRoundSearch className="h-4 w-4" /> Wave 2 · Single-PIN USERINFO Canary
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
            Read-only, satu PIN numerik per command. Belum ada full roster dump dan tidak ada query template biometric. Return 0 saja belum dianggap sukses; HCIS juga harus melihat safe roster observation baru setelah command dikirim.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedId || busy}
          onClick={() => void loadStatus(selectedId)}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Segarkan bukti
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(280px,1fr)_minmax(220px,0.8fr)_auto] lg:items-end">
        <label className="text-xs font-semibold text-muted-foreground">
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
        <label className="text-xs font-semibold text-muted-foreground">
          PIN device
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            inputMode="numeric"
            placeholder="contoh: 205291319"
            className="mt-1 h-10 w-full rounded-xl border border-border px-3 font-mono text-sm text-brand-heading"
          />
        </label>
        <button
          type="button"
          disabled={busy || !pinValid || selected?.lifecycle !== "active"}
          onClick={() => void queueQuery()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-xs font-bold text-white disabled:opacity-50"
        >
          <Search className="h-3.5 w-3.5" /> {busy ? "Mengirim…" : "Query 1 PIN"}
        </button>
      </div>

      {!pinValid && normalizedPin ? (
        <p className="mt-2 text-xs text-amber-700">PIN canary hanya menerima 1–128 digit; leading zero dipertahankan.</p>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/70 p-4 text-xs">
          <div className="font-bold text-brand-heading">Command evidence</div>
          {latestCommand ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">Command</dt><dd className="font-mono font-semibold">C:{latestCommand.commandNumber}</dd>
              <dt className="text-muted-foreground">Status</dt><dd className="font-semibold">{latestCommand.status}</dd>
              <dt className="text-muted-foreground">Return</dt><dd>{latestCommand.returnCode ?? "—"}</dd>
              <dt className="text-muted-foreground">CMD result</dt><dd>{latestCommand.resultCommand ?? "—"}</dd>
              <dt className="text-muted-foreground">Delivered</dt><dd>{fmt(latestCommand.deliveredAt)}</dd>
              <dt className="text-muted-foreground">Completed</dt><dd>{fmt(latestCommand.completedAt)}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-muted-foreground">Belum ada command USERINFO untuk PIN ini.</p>
          )}
        </div>

        <div className="rounded-xl border border-border/70 p-4 text-xs">
          <div className="font-bold text-brand-heading">Safe roster evidence</div>
          {rosterItem ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">PIN</dt><dd className="font-mono font-semibold">{rosterItem.pin}</dd>
              <dt className="text-muted-foreground">Nama mesin</dt><dd>{rosterItem.displayName ?? "—"}</dd>
              <dt className="text-muted-foreground">Card</dt><dd className="font-mono">{rosterItem.cardNumber ?? "—"}</dd>
              <dt className="text-muted-foreground">Observed</dt><dd>{fmt(rosterItem.lastSeenAt)}</dd>
              <dt className="text-muted-foreground">Source request</dt><dd className="break-all font-mono">{rosterItem.sourceRequestId ?? "—"}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-muted-foreground">Belum ada safe roster observation untuk PIN ini.</p>
          )}
        </div>
      </div>

      {normalizedPin && latestCommand ? (
        <div className={`mt-4 rounded-xl border p-3 text-sm ${canaryVerified ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {canaryVerified
            ? "VERIFIED: command sukses dan USERINFO safe roster upload baru terbukti setelah delivery."
            : commandSucceeded
              ? "ACK command sukses, tetapi USERINFO upload baru belum terbukti. Segarkan bukti; jangan lanjut ke full roster/template."
              : "Canary belum lengkap. Tunggu command mencapai terminal success dan safe roster observation baru."}
        </div>
      ) : null}
    </section>
  );
}
