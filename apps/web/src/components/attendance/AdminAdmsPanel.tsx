import {
  AlertTriangle,
  Fingerprint,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Unlink,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type { AdminEmployeeListItem } from "@/lib/adminEmployees";
import {
  AttendanceApiError,
  createAdmsDevice,
  createAdmsMapping,
  endAdmsMapping,
  getAdmsDevice,
  listAdmsDevices,
  updateAdmsDevice,
  type AdmsDevice,
  type AdmsDeviceDetailResponse,
  type AdmsDeviceLifecycle,
} from "@/lib/attendance";

function formatDateTime(value: string | null) {
  if (!value) return "Belum pernah";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function jakartaDayStartIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${read("year")}-${read("month")}-${read("day")}T00:00:00+07:00`).toISOString();
}

function lifecycleLabel(value: AdmsDeviceLifecycle) {
  if (value === "active") return "Aktif";
  if (value === "disabled") return "Dinonaktifkan";
  return "Karantina";
}

function lifecycleClass(value: AdmsDeviceLifecycle) {
  if (value === "active") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "disabled") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof AttendanceApiError || cause instanceof Error ? cause.message : fallback;
}

export function AdminAdmsPanel({ employees }: { employees: AdminEmployeeListItem[] }) {
  const [devices, setDevices] = useState<AdmsDevice[] | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [detail, setDetail] = useState<AdmsDeviceDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [updatingDevice, setUpdatingDevice] = useState(false);
  const [mappingEmployeeByPin, setMappingEmployeeByPin] = useState<Record<string, string>>({});
  const [mappingPin, setMappingPin] = useState<string | null>(null);
  const [endingMappingId, setEndingMappingId] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const response = await listAdmsDevices();
      setDevices(response.items);
      setSelectedDeviceId((current) =>
        current && response.items.some((device) => device.id === current)
          ? current
          : response.items[0]?.id ?? "",
      );
      setError(null);
    } catch (cause) {
      setDevices([]);
      setError(errorMessage(cause, "Daftar mesin fingerprint tidak dapat dimuat."));
    }
  }, []);

  const loadDetail = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    try {
      setDetail(await getAdmsDevice(deviceId));
      setError(null);
    } catch (cause) {
      setDetail(null);
      setError(errorMessage(cause, "Detail mesin fingerprint tidak dapat dimuat."));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    void loadDetail(selectedDeviceId);
  }, [loadDetail, selectedDeviceId]);

  const selectedDevice = useMemo(
    () => devices?.find((device) => device.id === selectedDeviceId) ?? detail?.item ?? null,
    [detail?.item, devices, selectedDeviceId],
  );

  const registerDevice = async (event: FormEvent) => {
    event.preventDefault();
    if (!serialNumber.trim()) return;
    setRegistering(true);
    setError(null);
    setNotice(null);
    try {
      const response = await createAdmsDevice({
        serialNumber: serialNumber.trim(),
        displayName: displayName.trim() || null,
        timezone: "Asia/Jakarta",
      });
      setSerialNumber("");
      setDisplayName("");
      setNotice(`Mesin ${response.item.serialNumber} berhasil diregistrasi.`);
      await loadDevices();
      setSelectedDeviceId(response.item.id);
    } catch (cause) {
      setError(errorMessage(cause, "Mesin fingerprint gagal diregistrasi."));
    } finally {
      setRegistering(false);
    }
  };

  const changeLifecycle = async (lifecycle: AdmsDeviceLifecycle) => {
    if (!selectedDevice) return;
    setUpdatingDevice(true);
    setError(null);
    setNotice(null);
    try {
      await updateAdmsDevice(selectedDevice.id, { lifecycle });
      setNotice(`Lifecycle mesin diubah menjadi ${lifecycleLabel(lifecycle)}.`);
      await Promise.all([loadDevices(), loadDetail(selectedDevice.id)]);
    } catch (cause) {
      setError(errorMessage(cause, "Lifecycle mesin gagal diperbarui."));
    } finally {
      setUpdatingDevice(false);
    }
  };

  const mapPin = async (pin: string) => {
    if (!selectedDevice) return;
    const employeeId = mappingEmployeeByPin[pin] ?? employees[0]?.id ?? "";
    if (!employeeId) {
      setError("Tidak ada pegawai aktif yang dapat dipilih untuk mapping.");
      return;
    }
    setMappingPin(pin);
    setError(null);
    setNotice(null);
    try {
      await createAdmsMapping(selectedDevice.id, {
        pin,
        employeeId,
        effectiveFrom: jakartaDayStartIso(),
      });
      setNotice(`PIN ${pin} berhasil dihubungkan dan punch hari ini diproyeksikan ulang.`);
      await Promise.all([loadDevices(), loadDetail(selectedDevice.id)]);
    } catch (cause) {
      setError(errorMessage(cause, `PIN ${pin} gagal dihubungkan.`));
    } finally {
      setMappingPin(null);
    }
  };

  const endMapping = async (mappingId: string, pin: string) => {
    if (!selectedDevice) return;
    if (!window.confirm(`Akhiri mapping aktif untuk PIN ${pin}? Histori mapping tetap disimpan.`)) return;
    setEndingMappingId(mappingId);
    setError(null);
    setNotice(null);
    try {
      await endAdmsMapping(mappingId);
      setNotice(`Mapping PIN ${pin} diakhiri. Histori mapping tetap tersimpan.`);
      await Promise.all([loadDevices(), loadDetail(selectedDevice.id)]);
    } catch (cause) {
      setError(errorMessage(cause, `Mapping PIN ${pin} gagal diakhiri.`));
    } finally {
      setEndingMappingId(null);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Fingerprint className="mt-0.5 h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-brand-heading">Mesin fingerprint</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Registry ADMS native HCIS. PIN mesin harus dipetakan eksplisit ke pegawai; HCIS tidak menebak PIN dari nomor pegawai dan tidak menyimpulkan telat, absen, lembur, atau payroll dari raw punch.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void Promise.all([loadDevices(), loadDetail(selectedDeviceId)])}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-brand-heading hover:bg-surface"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Segarkan
        </button>
      </div>

      {error ? (
        <div className="mt-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>
      ) : null}

      <form onSubmit={registerDevice} className="mt-5 grid gap-3 rounded-2xl bg-surface p-4 lg:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs font-semibold text-muted-foreground">
          Serial mesin
          <input
            value={serialNumber}
            onChange={(event) => setSerialNumber(event.target.value)}
            placeholder="Contoh: SPK7245000738"
            className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-brand-primary"
          />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          Nama mesin
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Contoh: Fingerprint Kantor Utama"
            className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-brand-primary"
          />
        </label>
        <button
          type="submit"
          disabled={registering || !serialNumber.trim()}
          className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Register
        </button>
      </form>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-border/70 p-4">
          <label className="text-xs font-semibold text-muted-foreground">
            Mesin terdaftar
            <select
              value={selectedDeviceId}
              onChange={(event) => setSelectedDeviceId(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-brand-primary"
            >
              {!devices?.length ? <option value="">Belum ada mesin</option> : null}
              {devices?.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.displayName || device.serialNumber} · {lifecycleLabel(device.lifecycle)}
                </option>
              ))}
            </select>
          </label>

          {selectedDevice ? (
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-brand-heading">{selectedDevice.serialNumber}</span>
                <span className={`rounded-full border px-2 py-1 font-semibold ${lifecycleClass(selectedDevice.lifecycle)}`}>
                  {lifecycleLabel(selectedDevice.lifecycle)}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-muted-foreground">
                <dt>Last seen</dt><dd className="text-right text-brand-heading">{formatDateTime(selectedDevice.lastSeenAt)}</dd>
                <dt>Last sukses</dt><dd className="text-right text-brand-heading">{formatDateTime(selectedDevice.lastSuccessfulRequestAt)}</dd>
                <dt>Timezone</dt><dd className="text-right text-brand-heading">{selectedDevice.timezone}</dd>
                <dt>IP terakhir</dt><dd className="text-right font-mono text-brand-heading">{selectedDevice.lastIp ?? "—"}</dd>
              </dl>
              <label className="block pt-2 font-semibold text-muted-foreground">
                Lifecycle
                <select
                  value={selectedDevice.lifecycle}
                  disabled={updatingDevice}
                  onChange={(event) => void changeLifecycle(event.target.value as AdmsDeviceLifecycle)}
                  className="mt-1 h-9 w-full rounded-xl border border-border bg-white px-3 text-xs outline-none focus:border-brand-primary disabled:opacity-50"
                >
                  <option value="active">Aktif</option>
                  <option value="disabled">Dinonaktifkan</option>
                  <option value="quarantined">Karantina</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-brand-heading">PIN terobservasi</h3>
              <p className="mt-1 text-xs text-muted-foreground">Mapping baru berlaku mulai awal hari Jakarta saat ini dan memicu re-projection punch hari ini.</p>
            </div>
            {loadingDetail ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>

          {!loadingDetail && selectedDevice && detail?.observedPins.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
              Belum ada PIN yang diterima dari mesin ini. Setelah traffic ATTLOG masuk, PIN akan muncul di sini.
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {detail?.observedPins.map((observed) => {
              const selectedEmployeeId = mappingEmployeeByPin[observed.pin] ?? employees[0]?.id ?? "";
              return (
                <div key={observed.pin} className="rounded-xl border border-border/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-bold text-brand-heading">PIN {observed.pin}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {observed.eventCount} event · terakhir {formatDateTime(observed.lastEventAt)}
                      </p>
                    </div>
                    {observed.mappingId ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        <Link2 className="h-3 w-3" /> {observed.employeeName} · {observed.employeeNumber}
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Belum dipetakan</span>
                    )}
                  </div>
                  {!observed.mappingId ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <select
                        value={selectedEmployeeId}
                        onChange={(event) =>
                          setMappingEmployeeByPin((current) => ({ ...current, [observed.pin]: event.target.value }))
                        }
                        className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-xs outline-none focus:border-brand-primary"
                      >
                        {employees.length === 0 ? <option value="">Tidak ada pegawai aktif</option> : null}
                        {employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.fullName} · {employee.employeeNumber}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedEmployeeId || mappingPin === observed.pin}
                        onClick={() => void mapPin(observed.pin)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {mappingPin === observed.pin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                        Hubungkan
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {detail ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-border/70 p-4">
            <h3 className="text-sm font-bold text-brand-heading">Mapping</h3>
            <div className="mt-3 space-y-2">
              {detail.mappings.length === 0 ? <p className="text-xs text-muted-foreground">Belum ada histori mapping.</p> : null}
              {detail.mappings.slice(0, 20).map((mapping) => (
                <div key={mapping.id} className="rounded-xl bg-surface p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-bold text-brand-heading">PIN {mapping.pin}</p>
                      <p className="mt-1 text-muted-foreground">{mapping.employeeName} · {mapping.employeeNumber}</p>
                      <p className="mt-1 text-muted-foreground">Mulai {formatDateTime(mapping.effectiveFrom)}</p>
                      {mapping.effectiveTo ? <p className="mt-1 text-muted-foreground">Berakhir {formatDateTime(mapping.effectiveTo)}</p> : null}
                    </div>
                    {!mapping.effectiveTo ? (
                      <button
                        type="button"
                        disabled={endingMappingId === mapping.id}
                        onClick={() => void endMapping(mapping.id, mapping.pin)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2 font-semibold text-muted-foreground hover:text-red-700 disabled:opacity-50"
                      >
                        {endingMappingId === mapping.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                        Akhiri
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 p-4">
            <h3 className="text-sm font-bold text-brand-heading">Raw event terbaru</h3>
            <div className="mt-3 space-y-2">
              {detail.recentEvents.length === 0 ? <p className="text-xs text-muted-foreground">Belum ada ATTLOG event.</p> : null}
              {detail.recentEvents.slice(0, 20).map((event) => (
                <div key={event.id} className="rounded-xl bg-surface p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-brand-heading">PIN {event.pin}</span>
                    <span className="text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Diterima {formatDateTime(event.receivedAt)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 p-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />
              <h3 className="text-sm font-bold text-brand-heading">Quarantine terbaru</h3>
            </div>
            <div className="mt-3 space-y-2">
              {detail.recentQuarantines.length === 0 ? <p className="text-xs text-muted-foreground">Tidak ada quarantine untuk mesin ini.</p> : null}
              {detail.recentQuarantines.slice(0, 20).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs">
                  <p className="font-bold text-amber-900">{entry.reason}</p>
                  <p className="mt-1 text-amber-800">{formatDateTime(entry.createdAt)}</p>
                  {Object.keys(entry.details ?? {}).length > 0 ? (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-amber-900">{JSON.stringify(entry.details)}</pre>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
