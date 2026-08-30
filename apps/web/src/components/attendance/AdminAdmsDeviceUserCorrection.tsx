import { AlertTriangle, RefreshCw, ShieldCheck, UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listAdmsDevices, type AdmsDevice } from "@/lib/attendance";

type RosterItem = {
  id: string;
  pin: string;
  displayName: string | null;
  cardNumber: string | null;
  lastSeenAt: string;
  mappingStatus: "mapped" | "unmapped";
  mappingId: string | null;
  employeeId: string | null;
  employeeNumber: string | null;
  employeeName: string | null;
  employeeStatus: string | null;
};

type RosterResponse = { items: RosterItem[] };

type CorrectionItem = {
  id: string;
  deviceId: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  legacyPin: string;
  intendedPin: string;
  status: "planned" | "cancelled" | "resolved";
  createdAt: string;
};

type CorrectionsResponse = {
  executionPolicy: "planning_only";
  destructivePinMutationEnabled: false;
  biometricTransferValidated: false;
  items: CorrectionItem[];
};

type SyncResponse = {
  item: {
    commandNumber: string;
    pin: string;
    currentName: string | null;
    targetName: string;
    sameValue: boolean;
    expectedResultCommand: "DATA";
    verificationRequired: string;
  };
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Permintaan koreksi user mesin gagal.");
}

function fmt(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function AdminAdmsDeviceUserCorrection() {
  const [devices, setDevices] = useState<AdmsDevice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const [intendedPins, setIntendedPins] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const result = await listAdmsDevices();
    setDevices(result.items);
    setSelectedId((current) =>
      current && result.items.some((item) => item.id === current)
        ? current
        : result.items[0]?.id ?? "",
    );
  }, []);

  const loadSelected = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setRoster([]);
      setCorrections([]);
      return;
    }
    try {
      const [rosterResult, correctionResult] = await Promise.all([
        readJson<RosterResponse>(await fetch(`/api/admin/attendance/adms/devices/${deviceId}/roster`, { credentials: "include" })),
        readJson<CorrectionsResponse>(await fetch(`/api/admin/attendance/adms/devices/${deviceId}/user-corrections`, { credentials: "include" })),
      ]);
      setRoster(rosterResult.items);
      setCorrections(correctionResult.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Data koreksi user mesin gagal dimuat.");
    }
  }, []);

  useEffect(() => {
    void loadDevices().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Registry mesin gagal dimuat.");
    });
  }, [loadDevices]);

  useEffect(() => {
    void loadSelected(selectedId);
  }, [loadSelected, selectedId]);

  const mappedRoster = useMemo(
    () => roster.filter((item) => item.mappingStatus === "mapped" && item.employeeId && item.employeeName),
    [roster],
  );
  const plannedByLegacyPin = useMemo(
    () => new Map(corrections.filter((item) => item.status === "planned").map((item) => [item.legacyPin, item])),
    [corrections],
  );

  const syncName = useCallback(async (item: RosterItem) => {
    if (!selectedId || !item.employeeName) return;
    const sameValue = item.displayName === item.employeeName;
    const message = sameValue
      ? `Kirim ulang nama "${item.employeeName}" ke PIN ${item.pin} sebagai same-value canary? Ini tidak mengubah PIN atau biometric.`
      : `Ubah nama di mesin untuk PIN ${item.pin} dari "${item.displayName ?? "—"}" menjadi "${item.employeeName}"? PIN dan biometric tidak diubah.`;
    if (!window.confirm(message)) return;
    setBusyKey(`sync:${item.pin}`);
    try {
      const result = await readJson<SyncResponse>(
        await fetch(`/api/admin/attendance/adms/devices/${selectedId}/users/${encodeURIComponent(item.pin)}/commands/sync-name`, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
      );
      setNotice(`C:${result.item.commandNumber} queued untuk sync nama PIN ${item.pin}. Setelah terminal success, lakukan QUERY USERINFO PIN yang sama untuk read-back verification.`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sync nama gagal diantrikan.");
    } finally {
      setBusyKey(null);
    }
  }, [selectedId]);

  const planCorrection = useCallback(async (item: RosterItem) => {
    if (!selectedId) return;
    const intendedPin = (intendedPins[item.pin] ?? "").trim();
    if (!/^\d{1,128}$/.test(intendedPin) || intendedPin === item.pin) {
      setError("PIN tujuan harus numerik, berbeda dari legacy PIN, dan maksimal 128 digit.");
      return;
    }
    if (!window.confirm(`Catat rencana koreksi ${item.pin} → ${intendedPin} untuk ${item.employeeName}? Ini HANYA mencatat plan dan tidak mengubah mesin.`)) return;
    setBusyKey(`plan:${item.pin}`);
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/devices/${selectedId}/user-corrections`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ legacyPin: item.pin, intendedPin }),
        }),
      );
      setNotice(`Rencana koreksi ${item.pin} → ${intendedPin} tercatat. Tidak ada command PIN/delete/biometric yang dikirim ke mesin.`);
      setError(null);
      await loadSelected(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rencana koreksi gagal disimpan.");
    } finally {
      setBusyKey(null);
    }
  }, [intendedPins, loadSelected, selectedId]);

  const cancelCorrection = useCallback(async (item: CorrectionItem) => {
    if (!window.confirm(`Batalkan rencana koreksi ${item.legacyPin} → ${item.intendedPin}?`)) return;
    setBusyKey(`cancel:${item.id}`);
    try {
      const response = await fetch(`/api/admin/attendance/adms/user-corrections/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) await readJson(response);
      setNotice(`Rencana koreksi ${item.legacyPin} → ${item.intendedPin} dibatalkan.`);
      setError(null);
      await loadSelected(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rencana koreksi gagal dibatalkan.");
    } finally {
      setBusyKey(null);
    }
  }, [loadSelected, selectedId]);

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-brand-heading">
            <UserRoundCog className="h-4 w-4" /> Device User Correction · Safe Write
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
            Sync nama hanya memakai mapping eksplisit HCIS dan hanya mengirim field Name ke PIN yang sama. Koreksi PIN masih planning-only: tidak ada rename PIN, delete user, atau pemindahan fingerprint/face sampai transfer biometric tervalidasi terpisah.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedId}
          onClick={() => void loadSelected(selectedId)}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Segarkan
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-72 text-xs font-semibold text-muted-foreground">
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
      </div>

      <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Perubahan PIN bukan edit field biasa. Vendor mendefinisikan PIN sebagai key user; delete user juga dapat menghapus template biometric. Karena itu HCIS hanya menyimpan correction plan sampai jalur clone/read-back biometric terbukti aman di hardware.
      </div>

      {notice ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div> : null}

      <div className="mt-5 space-y-3">
        {mappedRoster.map((item) => {
          const plan = plannedByLegacyPin.get(item.pin);
          return (
            <div key={item.id} className="rounded-xl border border-border/70 p-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto] xl:items-center">
                <div>
                  <div className="font-mono text-xs font-bold text-brand-heading">PIN {item.pin}</div>
                  <div className="mt-1 text-sm font-semibold text-brand-heading">{item.displayName ?? "Nama mesin belum tersedia"}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">USERINFO {fmt(item.lastSeenAt)} · Card {item.cardNumber ?? "—"}</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Mapping HCIS</div>
                  <div className="mt-1 text-sm font-semibold text-brand-heading">{item.employeeName}</div>
                  <div className="text-[11px] text-muted-foreground">{item.employeeNumber}</div>
                </div>
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void syncName(item)}
                  className="h-9 rounded-xl border border-border bg-white px-3 text-xs font-semibold text-brand-heading disabled:opacity-50"
                >
                  {item.displayName === item.employeeName ? "Sync nama · canary" : "Sync nama ke mesin"}
                </button>
              </div>

              <div className="mt-4 border-t border-border/60 pt-4">
                {plan ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-3 text-xs">
                    <div>
                      <span className="font-semibold text-brand-heading">Correction plan:</span>{" "}
                      <span className="font-mono">{plan.legacyPin} → {plan.intendedPin}</span>{" "}
                      <span className="text-amber-700">· planning-only</span>
                    </div>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void cancelCorrection(plan)}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 font-semibold disabled:opacity-50"
                    >
                      Batalkan plan
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-semibold text-muted-foreground">
                      PIN yang seharusnya
                      <input
                        value={intendedPins[item.pin] ?? ""}
                        onChange={(event) => setIntendedPins((current) => ({ ...current, [item.pin]: event.target.value }))}
                        inputMode="numeric"
                        placeholder="contoh: 205291318"
                        className="mt-1 h-9 w-48 rounded-xl border border-border px-3 font-mono text-sm text-brand-heading"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void planCorrection(item)}
                      className="h-9 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 disabled:opacity-50"
                    >
                      Catat koreksi PIN · tidak eksekusi
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {mappedRoster.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            Belum ada safe USERINFO yang sudah dimapping. Mapping dulu di Mapping Assistant, lalu kembali ke panel ini.
          </div>
        ) : null}
      </div>
    </section>
  );
}
