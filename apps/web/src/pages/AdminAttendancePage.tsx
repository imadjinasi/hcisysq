import {
  AlertTriangle,
  Clock3,
  Loader2,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AdminShell } from "@/layouts/AdminShell";
import {
  AttendanceApiError,
  deleteAdminAttendanceRecord,
  getAdminEmployeeAttendance,
  saveAdminAttendanceRecord,
  type AttendanceListResponse,
  type AttendanceRecord,
} from "@/lib/attendance";
import {
  AdminApiError,
  listEmployees,
  type AdminEmployeeListItem,
} from "@/lib/adminEmployees";

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function toJakartaLocalInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

function jakartaLocalInputToIso(value: string) {
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00`
    : value;
  const parsed = new Date(`${withSeconds}+07:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Waktu kehadiran tidak valid.");
  }
  return parsed.toISOString();
}

async function loadAllActiveEmployees(): Promise<AdminEmployeeListItem[]> {
  const first = await listEmployees({ page: 1, pageSize: 100, status: "active" });
  if (first.pagination.pageCount <= 1) return first.items;

  const rest = await Promise.all(
    Array.from({ length: first.pagination.pageCount - 1 }, (_, index) =>
      listEmployees({ page: index + 2, pageSize: 100, status: "active" }),
    ),
  );
  return [first, ...rest].flatMap((page) => page.items);
}

export function AdminAttendancePage() {
  const [employees, setEmployees] = useState<AdminEmployeeListItem[] | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [attendance, setAttendance] = useState<AttendanceListResponse | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(jakartaToday());
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [note, setNote] = useState("");
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadAllActiveEmployees()
      .then((items) => {
        if (!mounted) return;
        setEmployees(items);
        setEmployeeId((current) => current || items[0]?.id || "");
      })
      .catch((cause: unknown) => {
        if (!mounted) return;
        setError(cause instanceof AdminApiError ? cause.message : "Daftar pegawai tidak dapat dimuat.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadAttendance = async (selectedEmployeeId: string) => {
    if (!selectedEmployeeId) {
      setAttendance(null);
      return;
    }
    setLoadingAttendance(true);
    try {
      const result = await getAdminEmployeeAttendance(selectedEmployeeId);
      setAttendance(result);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof AttendanceApiError
          ? cause.message
          : "Rekaman kehadiran tidak dapat dimuat.",
      );
    } finally {
      setLoadingAttendance(false);
    }
  };

  useEffect(() => {
    void loadAttendance(employeeId);
  }, [employeeId]);

  const selectedRecord = useMemo(
    () => attendance?.items.find((item) => item.attendanceDate === attendanceDate) ?? null,
    [attendance, attendanceDate],
  );

  useEffect(() => {
    setCheckInAt(toJakartaLocalInput(selectedRecord?.checkInAt ?? null));
    setCheckOutAt(toJakartaLocalInput(selectedRecord?.checkOutAt ?? null));
    setNote(selectedRecord?.note ?? "");
  }, [selectedRecord]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!employeeId) return;
    if (!checkInAt && !checkOutAt) {
      setError("Isi minimal jam masuk atau jam keluar.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveAdminAttendanceRecord(employeeId, attendanceDate, {
        checkInAt: checkInAt ? jakartaLocalInputToIso(checkInAt) : null,
        checkOutAt: checkOutAt ? jakartaLocalInputToIso(checkOutAt) : null,
        note: note.trim() || null,
      });
      setNotice("Rekaman kehadiran tersimpan dan perubahan dicatat pada audit.");
      await loadAttendance(employeeId);
    } catch (cause) {
      setError(
        cause instanceof AttendanceApiError || cause instanceof Error
          ? cause.message
          : "Rekaman kehadiran gagal disimpan.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (record: AttendanceRecord) => {
    if (!employeeId) return;
    if (!window.confirm(`Hapus rekaman kehadiran ${formatDate(record.attendanceDate)}? Riwayat audit tetap disimpan.`)) {
      return;
    }

    setDeletingDate(record.attendanceDate);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminAttendanceRecord(employeeId, record.attendanceDate);
      setNotice("Rekaman kehadiran dihapus. Riwayat audit tetap tersedia di backend.");
      if (attendanceDate === record.attendanceDate) {
        setCheckInAt("");
        setCheckOutAt("");
        setNote("");
      }
      await loadAttendance(employeeId);
    } catch (cause) {
      setError(
        cause instanceof AttendanceApiError
          ? cause.message
          : "Rekaman kehadiran gagal dihapus.",
      );
    } finally {
      setDeletingDate(null);
    }
  };

  const chooseRecord = (record: AttendanceRecord) => {
    setAttendanceDate(record.attendanceDate);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AdminShell
      active="attendance"
      title="Kehadiran"
      description="Catat atau koreksi fakta jam masuk/keluar pegawai. HCIS belum menyimpulkan telat, absen, lembur, atau kekurangan jam sebelum aturan jadwal kerja dikonfigurasi."
    >
      {error ? (
        <div className="mb-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3">
            <UserRound className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
            <h2 className="text-base font-bold text-brand-heading">Pegawai</h2>
          </div>
          <label className="mt-4 block text-xs font-semibold text-muted-foreground">
            Pilih pegawai aktif
            <select
              value={employeeId}
              onChange={(event) => {
                setEmployeeId(event.target.value);
                setNotice(null);
              }}
              disabled={!employees}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand-primary disabled:opacity-50"
            >
              {!employees ? <option>Memuat pegawai...</option> : null}
              {employees?.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName} · {employee.employeeNumber}
                </option>
              ))}
            </select>
          </label>
          {attendance?.employee ? (
            <div className="mt-4 rounded-2xl bg-surface p-4">
              <p className="text-sm font-bold text-brand-heading">{attendance.employee.fullName}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {attendance.employee.employeeNumber} · {attendance.employee.unitName ?? "Tanpa unit"} · {attendance.employee.positionName ?? "Tanpa jabatan"}
              </p>
            </div>
          ) : null}
        </article>

        <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-brand-heading">Rekaman harian</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Satu rekaman kanonik per pegawai per tanggal kerja.</p>
            </div>
          </div>

          <form onSubmit={save} className="mt-5 space-y-4">
            <label className="block text-xs font-semibold text-muted-foreground">
              Tanggal kerja
              <input
                type="date"
                value={attendanceDate}
                onChange={(event) => setAttendanceDate(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand-primary"
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Jam masuk
                <input
                  type="datetime-local"
                  value={checkInAt}
                  onChange={(event) => setCheckInAt(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand-primary"
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Jam keluar
                <input
                  type="datetime-local"
                  value={checkOutAt}
                  onChange={(event) => setCheckOutAt(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand-primary"
                />
              </label>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Jam pada formulir selalu diperlakukan sebagai Waktu Indonesia Barat (Asia/Jakarta), terlepas dari zona waktu perangkat Admin.
            </p>
            <label className="block text-xs font-semibold text-muted-foreground">
              Catatan internal opsional
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Contoh: koreksi berdasarkan catatan operasional"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
            </label>
            <p className="text-[11px] leading-5 text-muted-foreground">
              Catatan ini untuk administrasi dan audit; tidak ditampilkan pada halaman kehadiran pegawai.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={saving || !employeeId}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {saving ? "Menyimpan..." : selectedRecord ? "Simpan koreksi" : "Simpan rekaman"}
              </button>
              {selectedRecord ? (
                <button
                  type="button"
                  onClick={() => void remove(selectedRecord)}
                  disabled={deletingDate === selectedRecord.attendanceDate}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Hapus rekaman
                </button>
              ) : null}
            </div>
          </form>
        </article>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-brand-heading">Riwayat 30 hari</h2>
            <p className="mt-1 text-xs text-muted-foreground">Klik Edit untuk memuat rekaman ke formulir di atas.</p>
          </div>
          {loadingAttendance ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
        </div>

        {attendance?.items.length ? (
          <div className="divide-y divide-border/70">
            {attendance.items.map((record) => (
              <div key={record.attendanceDate} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.1fr_0.6fr_0.6fr_0.8fr_auto] lg:items-center">
                <div>
                  <p className="text-sm font-bold text-brand-heading">{formatDate(record.attendanceDate)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {record.source === "manual" ? "Manual" : "Integrasi"}{record.note ? ` · ${record.note}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Masuk</p>
                  <p className="mt-1 text-sm font-semibold">{formatTime(record.checkInAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Keluar</p>
                  <p className="mt-1 text-sm font-semibold">{formatTime(record.checkOutAt)}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Diubah {new Date(record.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => chooseRecord(record)}
                    className="h-9 rounded-xl border border-border bg-white px-3 text-xs font-bold text-brand-primary-deep"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(record)}
                    disabled={deletingDate === record.attendanceDate}
                    aria-label={`Hapus rekaman ${record.attendanceDate}`}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white text-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-sm text-muted-foreground">
            {loadingAttendance ? "Memuat rekaman..." : "Belum ada rekaman kehadiran untuk pegawai ini."}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
