import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Network,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/layouts/AdminShell";
import { AdminApiError } from "@/lib/adminEmployees";
import {
  getLeaveApprovalPreview,
  getLeaveConfiguration,
  type LeaveApprovalPreviewResponse,
  type LeaveApprovalSource,
  type LeaveConfigurationResponse,
  type LeaveEntitlementGroup,
  updateLeaveEntitlementGroup,
} from "@/lib/adminLeave";

function approvalSourceLabel(source: LeaveApprovalSource) {
  if (source === "DIRECT_MANAGER") return "Atasan langsung";
  if (source === "UNIT_APPROVER") return "Penyetuju unit";
  return "Penyetuju Pengurus Yayasan";
}

function approvalSourcesLabel(sources: LeaveApprovalSource[]) {
  return sources.map(approvalSourceLabel).join(" + ");
}

function periodLabel(key: LeaveApprovalPreviewResponse["annualLeave"] extends infer Annual
  ? Annual extends { currentPeriodKey: infer Key }
    ? Key
    : never
  : never) {
  if (key === "JAN_MAR") return "Januari–Maret";
  if (key === "APR_JUN") return "April–Juni";
  if (key === "JUL_SEP") return "Juli–September";
  return "Oktober–Desember";
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function AdminLeaveConfigurationPage() {
  const [data, setData] = useState<LeaveConfigurationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);
  const [preview, setPreview] = useState<LeaveApprovalPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getLeaveConfiguration()
      .then((result) => {
        if (mounted) setData(result);
      })
      .catch((cause: unknown) => {
        if (!mounted) return;
        setError(
          cause instanceof AdminApiError
            ? cause.message
            : "Konfigurasi cuti tidak dapat dimuat.",
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return data?.employees ?? [];
    return (data?.employees ?? []).filter((employee) =>
      [employee.fullName, employee.employeeNumber, employee.unitName, employee.positionName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(keyword)),
    );
  }, [data?.employees, search]);

  const employeeName = (employeeId: string) =>
    data?.employees.find((employee) => employee.id === employeeId)?.fullName ?? "Pegawai tidak ditemukan";

  const updateGroup = async (
    employeeId: string,
    group: LeaveEntitlementGroup | null,
  ) => {
    if (!data) return;
    setSavingEmployeeId(employeeId);
    setError(null);
    try {
      await updateLeaveEntitlementGroup(employeeId, group);
      const employees = data.employees.map((employee) =>
        employee.id === employeeId
          ? { ...employee, leaveEntitlementGroup: group }
          : employee,
      );
      setData({
        ...data,
        employees,
        summary: {
          ...data.summary,
          entitlementGroupConfigured: employees.filter(
            (employee) => employee.leaveEntitlementGroup !== null,
          ).length,
        },
      });
    } catch (cause) {
      setError(
        cause instanceof AdminApiError
          ? cause.message
          : "Kelompok hak cuti tidak dapat disimpan.",
      );
    } finally {
      setSavingEmployeeId(null);
    }
  };

  const loadPreview = async (employeeId: string) => {
    setPreviewLoading(true);
    setError(null);
    try {
      setPreview(await getLeaveApprovalPreview(employeeId));
    } catch (cause) {
      setError(
        cause instanceof AdminApiError
          ? cause.message
          : "Pratinjau alur persetujuan tidak dapat dimuat.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const summary = data?.summary;

  return (
    <AdminShell
      active="leave"
      title="Konfigurasi Cuti"
      description="Kelola kebijakan cuti dan periksa alur persetujuan yang berasal dari Struktur Organisasi."
    >
      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <article className="rounded-2xl border border-brand-primary/20 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start gap-3">
            <Network className="mt-0.5 h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-brand-heading">Alur persetujuan cuti</h2>
              <p className="mt-2 text-xl font-bold text-brand-heading">Struktur Organisasi</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Atasan langsung dan penyetuju unit dibaca dari Struktur Organisasi yang sudah diterbitkan. Tidak ada konfigurasi persetujuan kedua di halaman Cuti.
              </p>
              <a
                href="/admin/organization"
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white hover:bg-brand-primary-deep"
              >
                Buka Struktur Organisasi <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <ShieldCheck className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
          <p className="mt-4 text-2xl font-bold text-brand-heading">
            {summary?.entitlementGroupConfigured ?? 0}
            <span className="text-sm font-semibold text-muted-foreground">
              {" "}/ {summary?.activeEmployees ?? 0}
            </span>
          </p>
          <p className="mt-1 text-sm font-semibold">Kelompok hak cuti sudah diatur</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Kelompok tenaga pendidikan atau non-pendidikan merupakan kebijakan cuti yang ditetapkan secara eksplisit dan tidak ditebak dari nama jabatan.
          </p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-brand-heading">Cuti Tahunan YSQ</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hak ditampilkan 12 hari per tahun. Pemakaian dibatasi 3 hari per periode Januari–Maret, April–Juni, Juli–September, dan Oktober–Desember setelah genap 12 bulan kerja.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-brand-primary-pale px-3 py-1.5 text-brand-primary-deep">12 hari / tahun</span>
              <span className="rounded-full bg-muted px-3 py-1.5">3 hari / periode</span>
              <span className="rounded-full bg-muted px-3 py-1.5">Ajukan minimal H-7</span>
              <span className="rounded-full bg-muted px-3 py-1.5">HC menerima pemberitahuan</span>
              <span className="rounded-full bg-muted px-3 py-1.5">Tanpa akumulasi otomatis</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-brand-heading">Klasifikasi Hak Cuti Pegawai Aktif</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tentukan kelompok hak cuti dan periksa jalur persetujuan setiap pegawai dari Struktur Organisasi.
            </p>
          </div>
          <label className="relative block w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari pegawai, unit, jabatan..."
              className="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-primary"
            />
          </label>
        </div>

        <div className="max-h-[38rem] overflow-auto">
          <table className="w-full min-w-[54rem] text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Pegawai</th>
                <th className="px-5 py-3 font-semibold">Unit / Jabatan</th>
                <th className="px-5 py-3 font-semibold">Kelompok hak</th>
                <th className="px-5 py-3 text-right font-semibold">Alur persetujuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-brand-heading">{employee.fullName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{employee.employeeNumber}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p>{employee.unitName ?? "—"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{employee.positionName ?? "—"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={employee.leaveEntitlementGroup ?? ""}
                      disabled={savingEmployeeId === employee.id}
                      onChange={(event) =>
                        void updateGroup(
                          employee.id,
                          (event.target.value || null) as LeaveEntitlementGroup | null,
                        )
                      }
                      className="h-9 rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-brand-primary"
                    >
                      <option value="">Belum diatur</option>
                      <option value="education">Tenaga pendidikan</option>
                      <option value="non_education">Tenaga non-pendidikan</option>
                    </select>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      disabled={previewLoading}
                      onClick={() => void loadPreview(employee.id)}
                      className="inline-flex h-9 items-center rounded-xl border border-border bg-white px-3 text-xs font-semibold hover:bg-muted/60 disabled:opacity-60"
                    >
                      Periksa alur
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {preview ? (
        <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2">
            {preview.warnings.length === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />
            )}
            <h2 className="text-base font-bold text-brand-heading">
              Pratinjau alur persetujuan — {preview.employee.fullName}
            </h2>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            Sumber persetujuan: <span className="font-semibold text-brand-heading">Struktur Organisasi</span>
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-surface p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Urutan persetujuan</p>
              <div className="mt-3 space-y-2 text-sm">
                {preview.approvalChain.length ? (
                  preview.approvalChain.map((step, index) => (
                    <div key={`${step.employeeId}-${index}`} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary-pale text-xs font-bold text-brand-primary-deep">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-brand-heading">{employeeName(step.employeeId)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{approvalSourcesLabel(step.sources)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">Alur belum dapat dibentuk dari Struktur Organisasi.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Hak dan ketersediaan</p>
              {preview.annualLeave ? (
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Hak tahunan</p>
                    <p className="mt-1 font-bold text-brand-heading">{preview.annualLeave.annualEntitlementDays} hari / tahun</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tersedia sekarang</p>
                    <p className="mt-1 font-bold text-brand-heading">{preview.annualLeave.availableNowDays} hari</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mulai berhak</p>
                    <p className="mt-1 font-semibold">{formatDate(preview.annualLeave.eligibleFrom)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Periode saat ini</p>
                    <p className="mt-1 font-semibold">{periodLabel(preview.annualLeave.currentPeriodKey)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Tanggal mulai kerja belum tersedia.</p>
              )}
            </div>
          </div>

          {preview.warnings.length ? (
            <div className="mt-4 space-y-2">
              {preview.warnings.map((warning, index) => (
                <div
                  key={`${warning.code}-${index}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                >
                  {warning.message}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </AdminShell>
  );
}
