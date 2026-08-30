import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldCheck, UserRoundCog } from "lucide-react";
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

type CommandItem = {
  id: string;
  commandNumber: string;
  commandType: string;
  wireCommand: string;
  status: string;
  deliveredAt: string | null;
  completedAt: string | null;
  returnCode: number | null;
  resultCommand: string | null;
  createdAt: string;
};

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

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function commandStatusLabel(status: string) {
  if (status === "succeeded") return "Berhasil";
  if (status === "failed") return "Gagal";
  if (status === "cancelled") return "Dibatalkan";
  if (status === "delivered") return "Sudah dikirim ke mesin";
  if (status === "pending") return "Menunggu mesin";
  return status;
}

export function AdminAdmsDeviceUserCorrection() {
  const [devices, setDevices] = useState<AdmsDevice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const [intendedPins, setIntendedPins] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
      setCommands([]);
      setCorrections([]);
      return;
    }
    const [rosterResult, commandResult, correctionResult] = await Promise.all([
      readJson<RosterResponse>(await fetch(`/api/admin/attendance/adms/devices/${deviceId}/roster`, { credentials: "include" })),
      readJson<{ items: CommandItem[] }>(await fetch(`/api/admin/attendance/adms/devices/${deviceId}/commands`, { credentials: "include" })),
      readJson<CorrectionsResponse>(await fetch(`/api/admin/attendance/adms/devices/${deviceId}/user-corrections`, { credentials: "include" })),
    ]);
    setRoster(rosterResult.items);
    setCommands(commandResult.items);
    setCorrections(correctionResult.items);
    setError(null);
  }, []);

  const refreshSelected = useCallback(async () => {
    if (!selectedId) return;
    setRefreshing(true);
    try {
      await loadSelected(selectedId);
      setNotice("Status terbaru sudah dimuat.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status terbaru gagal dimuat.");
    } finally {
      setRefreshing(false);
    }
  }, [loadSelected, selectedId]);

  useEffect(() => {
    void loadDevices().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Daftar mesin gagal dimuat.");
    });
  }, [loadDevices]);

  useEffect(() => {
    void loadSelected(selectedId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Data pengguna mesin gagal dimuat.");
    });
  }, [loadSelected, selectedId]);

  const mappedRoster = useMemo(
    () => roster.filter((item) => item.mappingStatus === "mapped" && item.employeeId && item.employeeName),
    [roster],
  );
  const plannedByLegacyPin = useMemo(
    () => new Map(corrections.filter((item) => item.status === "planned").map((item) => [item.legacyPin, item])),
    [corrections],
  );
  const latestNameCommandByPin = useMemo(() => {
    const result = new Map<string, CommandItem>();
    for (const command of commands) {
      if (command.commandType !== "update_user_info") continue;
      const match = command.wireCommand.match(/^DATA UPDATE USERINFO PIN=(\d+)/);
      if (!match || result.has(match[1])) continue;
      result.set(match[1], command);
    }
    return result;
  }, [commands]);

  const syncName = useCallback(async (item: RosterItem) => {
    if (!selectedId || !item.employeeName) return;
    const sameValue = item.displayName === item.employeeName;
    const message = sameValue
      ? `Kirim ulang nama "${item.employeeName}" ke PIN ${item.pin} sebagai tes aman? PIN, kartu, dan biometrik tidak diubah.`
      : `Ubah nama di mesin untuk PIN ${item.pin} dari "${item.displayName ?? "—"}" menjadi "${item.employeeName}"? PIN, kartu, dan biometrik tidak diubah.`;
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
      setNotice(`Perintah C:${result.item.commandNumber} sudah dibuat. Tunggu mesin memprosesnya, lalu klik "Muat status terbaru".`);
      setError(null);
      await loadSelected(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sinkronisasi nama gagal dikirim.");
    } finally {
      setBusyKey(null);
    }
  }, [loadSelected, selectedId]);

  const queryUserInfo = useCallback(async (item: RosterItem) => {
    if (!selectedId) return;
    setBusyKey(`query:${item.pin}`);
    try {
      await readJson(
        await fetch(`/api/admin/attendance/adms/devices/${selectedId}/commands/query-user-info`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin: item.pin }),
        }),
      );
      setNotice(`Permintaan baca ulang PIN ${item.pin} sudah dibuat. Tunggu mesin merespons, lalu klik "Muat status terbaru".`);
      setError(null);
      await loadSelected(selectedId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Baca ulang data pengguna gagal dikirim.");
    } finally {
      setBusyKey(null);
    }
  }, [loadSelected, selectedId]);

  const planCorrection = useCallback(async (item: RosterItem) => {
    if (!selectedId) return;
    const intendedPin = (intendedPins[item.pin] ?? "").trim();
    if (!/^\d{1,128}$/.test(intendedPin) || intendedPin === item.pin) {
      setError("PIN yang seharusnya harus berupa angka dan berbeda dari PIN mesin saat ini.");
      return;
    }
    if (!window.confirm(`Catat rencana koreksi ${item.pin} → ${intendedPin} untuk ${item.employeeName}? Ini hanya mencatat rencana dan tidak mengubah mesin.`)) return;
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
      setNotice(`Rencana koreksi ${item.pin} → ${intendedPin} tersimpan. Mesin belum diubah.`);
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
            <UserRoundCog className="h-4 w-4" /> Koreksi pengguna mesin
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
            Gunakan bagian ini untuk menyamakan nama pengguna yang sudah terhubung ke pegawai HCIS. Perubahan PIN belum dijalankan ke mesin; HCIS hanya dapat mencatat rencananya agar aman untuk data sidik jari/wajah.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedId || refreshing}
          onClick={() => void refreshSelected()}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-surface disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Memuat…" : "Muat status terbaru"}
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
        PIN pengguna adalah identitas utama di mesin. Mengganti atau menghapus pengguna bisa ikut memengaruhi data biometrik, jadi perubahan PIN belum dieksekusi sampai jalur pemindahan biometrik terbukti aman.
      </div>

      {notice ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div> : null}
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div> : null}

      <div className="mt-5 space-y-3">
        {mappedRoster.map((item) => {
          const plan = plannedByLegacyPin.get(item.pin);
          const latestNameCommand = latestNameCommandByPin.get(item.pin) ?? null;
          const nameCommandSucceeded = latestNameCommand?.status === "succeeded" && (latestNameCommand.returnCode ?? -1) >= 0 && latestNameCommand.resultCommand === "DATA";
          return (
            <div key={item.id} className="rounded-xl border border-border/70 p-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto] xl:items-center">
                <div>
                  <div className="font-mono text-xs font-bold text-brand-heading">PIN {item.pin}</div>
                  <div className="mt-1 text-sm font-semibold text-brand-heading">{item.displayName ?? "Nama di mesin belum tersedia"}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Terakhir dibaca {fmt(item.lastSeenAt)} · Kartu {item.cardNumber ?? "—"}</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Terhubung ke pegawai HCIS</div>
                  <div className="mt-1 text-sm font-semibold text-brand-heading">{item.employeeName}</div>
                  <div className="text-[11px] text-muted-foreground">{item.employeeNumber}</div>
                </div>
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void syncName(item)}
                  className="h-9 rounded-xl border border-border bg-white px-3 text-xs font-semibold text-brand-heading hover:bg-surface disabled:opacity-50"
                >
                  {item.displayName === item.employeeName ? "Tes sinkron nama" : "Samakan nama di mesin"}
                </button>
              </div>

              {latestNameCommand ? (
                <div className={`mt-4 rounded-xl border p-3 text-xs ${nameCommandSucceeded ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-brand-heading">
                      {nameCommandSucceeded ? <CheckCircle2 className="mr-1.5 inline h-4 w-4 text-emerald-700" /> : null}
                      Pengiriman nama terakhir: C:{latestNameCommand.commandNumber} · {commandStatusLabel(latestNameCommand.status)}
                    </div>
                    <div className="text-muted-foreground">Dibuat {fmt(latestNameCommand.createdAt)}</div>
                  </div>
                  <div className="mt-2 grid gap-1 sm:grid-cols-3">
                    <span>Hasil mesin: <strong>{latestNameCommand.resultCommand ?? "—"}</strong></span>
                    <span>Kode hasil: <strong>{latestNameCommand.returnCode ?? "—"}</strong></span>
                    <span>Selesai: <strong>{fmt(latestNameCommand.completedAt)}</strong></span>
                  </div>
                  {nameCommandSucceeded ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200 pt-3">
                      <span className="text-emerald-900">Pengiriman diterima mesin. Langkah berikutnya: baca ulang PIN ini dan pastikan nama + kartu tetap benar.</span>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => void queryUserInfo(item)}
                        className="inline-flex h-8 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 font-semibold text-emerald-900 disabled:opacity-50"
                      >
                        <Search className="h-3.5 w-3.5" /> Baca ulang data pengguna
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 border-t border-border/60 pt-4">
                {plan ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-3 text-xs">
                    <div>
                      <span className="font-semibold text-brand-heading">Rencana koreksi PIN:</span>{" "}
                      <span className="font-mono">{plan.legacyPin} → {plan.intendedPin}</span>{" "}
                      <span className="text-amber-700">· belum dijalankan ke mesin</span>
                    </div>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void cancelCorrection(plan)}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 font-semibold disabled:opacity-50"
                    >
                      Batalkan rencana
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
                      Simpan rencana koreksi PIN
                    </button>
                    <span className="pb-2 text-[11px] text-muted-foreground">Tidak mengubah mesin.</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {mappedRoster.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            Belum ada pengguna mesin yang sudah dihubungkan ke pegawai HCIS. Hubungkan PIN terlebih dahulu di bagian Pencocokan PIN.
          </div>
        ) : null}
      </div>
    </section>
  );
}
