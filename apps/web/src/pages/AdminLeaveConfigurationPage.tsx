import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  GitCompareArrows,
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
  type LeaveConfigurationResponse,
  type LeaveEntitlementGroup,
  updateLeaveEntitlementGroup,
  updateUnitLeaveApprover,
} from "@/lib/adminLeave";
import { modeCopy, routingSource } from "@/lib/adminLeaveRouting";

export function AdminLeaveConfigurationPage() {
  const [data, setData] = useState<LeaveConfigurationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
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

  const updateApprover = async (unitId: string, employeeId: string | null) => {
    if (!data) return;
    const key = `unit:${unitId}`;
    setSavingKey(key);
    setError(null);
    try {
      await updateUnitLeaveApprover(unitId, employeeId);
      const approver = data.employees.find((employee) => employee.id === employeeId);
      setData({
        ...data,
        units: data.units.map((unit) =>
          unit.id === unitId
            ? {
                ...unit,
                approverEmployeeId: employeeId,
                approverName: approver?.fullName ?? null,
              }
            : unit,
        ),
        summary: {
          ...data.summary,
          unitApproverConfigured: data.units.filter((unit) =>
            unit.id === unitId ? employeeId !== null : unit.approverEmployeeId !== null,
          ).length,
        },
      });
    } catch (cause) {
      setError(
        cause instanceof AdminApiError
          ? cause.message
          : "Approver unit tidak dapat disimpan.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const updateGroup = async (
    employeeId: string,
    group: LeaveEntitlementGroup | null,
  ) => {
    if (!data) return;
    const key = `employee:${employeeId}`;
    setSavingKey(key);
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
      setSavingKey(null);
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
          : "Preview approval tidak dapat dimuat.",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const employeeName = (employeeId: string) =>
    data?.employees.find((employee) => employee.id === employeeId)?.fullName ?? employeeId;

  const activeUnits = data?.units.filter((unit) => unit.activeEmployeeCount > 0) ?? [];
  const summary = data?.summary;
  const rolloutState = data?.rollout.state ?? "LEGACY";

  return (
    <AdminShell
      active="leave"
      title="Konfigurasi Cuti"
      description="Kelola kebijakan Cuti secara independen dan pantau transisi routing approval Legacy → Shadow → Struktur Organisasi."
    >
      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <article className="rounded-2xl border border-brand-primary/20 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><Network className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" /><h2 className="text-base font-bold text-brand-heading">Status routing approval</h2></div>
              <p className="mt-3 text-xs font-semibold text-muted-foreground">Sumber approval aktif</p>
              <p className="mt-1 text-xl font-bold text-brand-heading">{routingSource(rolloutState)}</p>
            </div>
            <span className="self-start rounded-full bg-brand-primary-pale px-3 py-1.5 text-xs font-bold text-brand-primary-deep">{rolloutState}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{modeCopy(rolloutState)}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">LEGACY {data?.rollout.counts.LEGACY ?? 0}</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-900">SHADOW {data?.rollout.counts.SHADOW ?? 0}</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-900">STRUCTURE {data?.rollout.counts.STRUCTURE ?? 0}</span>
          </div>
          <a href="/admin/organization" className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white hover:bg-brand-primary-deep">Buka Organization Designer <ExternalLink className="h-3.5 w-3.5" /></a>
        </article>
        <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <ShieldCheck className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
          <p className="mt-4 text-2xl font-bold text-brand-heading">{summary?.entitlementGroupConfigured ?? 0}<span className="text-sm font-semibold text-muted-foreground"> / {summary?.activeEmployees ?? 0}</span></p>
          <p className="mt-1 text-sm font-semibold">Kelompok hak cuti dikonfigurasi</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Pendidikan / non-pendidikan tetap kebijakan Cuti yang eksplisit dan tidak diturunkan dari node, posisi, judul, atau tingkat struktur.</p>
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
          <div>
            <h2 className="text-base font-bold text-brand-heading">Cuti Tahunan YSQ</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hak tetap ditampilkan 12 hari per tahun. Pemakaian dibatasi 3 hari per periode Jan-Mar, Apr-Jun, Jul-Sep, dan Okt-Des setelah genap 12 bulan kerja.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-brand-primary-pale px-3 py-1.5 text-brand-primary-deep">12 hari / tahun</span>
              <span className="rounded-full bg-muted px-3 py-1.5">3 hari / periode</span>
              <span className="rounded-full bg-muted px-3 py-1.5">H-7</span>
              <span className="rounded-full bg-muted px-3 py-1.5">HC notified</span>
              <span className="rounded-full bg-muted px-3 py-1.5">Tanpa carry-forward otomatis</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="border-b border-amber-200 bg-amber-50/60 px-5 py-4">
          <div className="flex items-center gap-2"><Archive className="h-5 w-5 text-amber-800" aria-hidden="true" /><h2 className="text-base font-bold text-brand-heading">Legacy approval routing</h2></div>
          <p className="mt-1 text-xs leading-5 text-amber-950">
            Digunakan sementara selama mode LEGACY/SHADOW. Setelah STRUCTURE aktif, approval mengikuti Struktur Organisasi. Field legacy dipertahankan untuk kompatibilitas migrasi dan rollback, bukan sebagai konfigurasi jangka panjang.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Unit</th>
                <th className="px-5 py-3 font-semibold">Mode cakupan</th>
                <th className="px-5 py-3 text-right font-semibold">Pegawai aktif</th>
                <th className="px-5 py-3 font-semibold">Unit Approver legacy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {activeUnits.map((unit) => (
                <tr key={unit.id}>
                  <td className="px-5 py-3 font-semibold">{unit.name}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold">{unit.rolloutState}</span></td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{unit.activeEmployeeCount}</td>
                  <td className="px-5 py-3">
                    {unit.rolloutState === "STRUCTURE" ? <div className="rounded-xl border border-dashed border-border bg-surface px-3 py-2 text-xs text-muted-foreground"><span className="font-bold text-brand-heading">Diarsipkan / read-only</span><span className="mt-0.5 block">{unit.approverName ?? "Belum pernah dikonfigurasi"}</span></div> : <select
                        aria-label={`Unit Approver legacy untuk ${unit.name}`}
                        value={unit.approverEmployeeId ?? ""}
                        disabled={savingKey === `unit:${unit.id}`}
                        onChange={(event) => void updateApprover(unit.id, event.target.value || null)}
                        className="h-10 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm outline-none focus:border-brand-primary"
                      >
                        <option value="">Belum dikonfigurasi</option>
                        {(data?.employees ?? []).map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} — {employee.unitName ?? "Tanpa unit"}</option>)}
                      </select>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-brand-heading">Klasifikasi Hak Cuti Pegawai Aktif</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Tenaga non-pendidikan memakai Cuti Tahunan individual; tenaga pendidikan mengikuti cuti akademik sebagai pemenuhan hak tahunannya.
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
          <table className="w-full min-w-[64rem] text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Pegawai</th>
                <th className="px-5 py-3 font-semibold">Unit / Jabatan</th>
                <th className="px-5 py-3 font-semibold">Atasan langsung legacy</th>
                <th className="px-5 py-3 font-semibold">Kelompok hak</th>
                <th className="px-5 py-3 text-right font-semibold">Preview</th>
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
                    <span className="mt-1.5 inline-flex rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-brand-heading">{employee.rolloutMode}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {employee.rolloutMode === "STRUCTURE" ? <span className="inline-flex items-center gap-1 text-xs"><Archive className="h-3.5 w-3.5" /> Diarsipkan: {employee.directManagerName ?? "belum pernah diatur"}</span> : employee.directManagerName ?? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Belum diatur
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={employee.leaveEntitlementGroup ?? ""}
                      disabled={savingKey === `employee:${employee.id}`}
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
                      Cek chain
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
            <h2 className="text-base font-bold text-brand-heading">Preview — {preview.employee.fullName}</h2>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary-pale/30 p-4 sm:grid-cols-2">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Mode</p><p className="mt-1 text-sm font-bold text-brand-heading">{preview.routing.mode}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sumber authoritative</p><p className="mt-1 text-sm font-bold text-brand-heading">{preview.routing.authoritativeSource === "STRUCTURE" ? "Struktur Organisasi" : "Legacy"}</p></div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-surface p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Resolved chain authoritative</p>
              <div className="mt-3 space-y-2 text-sm">
                {preview.approvalChain.length ? (
                  preview.approvalChain.map((step, index) => (
                    <div key={step.employeeId} className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-primary-pale text-xs font-bold text-brand-primary-deep">{index + 1}</span>
                      <span className="font-semibold">{employeeName(step.employeeId)}</span>
                      <span className="text-xs text-muted-foreground">{step.sources.join(" + ")}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">Chain belum dapat dibentuk.</p>
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
                    <p className="text-xs text-muted-foreground">Eligible sejak</p>
                    <p className="mt-1 font-semibold">{preview.annualLeave.eligibleFrom}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Periode saat ini</p>
                    <p className="mt-1 font-semibold">{preview.annualLeave.currentPeriodKey}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Tanggal mulai kerja belum tersedia.</p>
              )}
            </div>
          </div>

          {preview.routing.mode === "SHADOW" ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-blue-800" /><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-950">Kandidat Struktur Organisasi</p></div><span className={preview.routing.comparison?.status === "MATCH" ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900" : "rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-950"}>{preview.routing.comparison?.status ?? "MISMATCH"}</span></div>
              <div className="mt-3 space-y-2 text-sm">
                {preview.routing.structuralCandidateChain?.length ? preview.routing.structuralCandidateChain.map((step, index) => <div key={`${step.employeeId}-${index}`} className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-900">{index + 1}</span><span className="font-semibold text-brand-heading">{employeeName(step.employeeId)}</span><span className="text-xs text-blue-800">{step.sources.join(" + ")}</span></div>) : <p className="text-sm text-blue-900">Kandidat struktural belum dapat diselesaikan.</p>}
              </div>
              {preview.routing.comparison?.reasons.length ? <p className="mt-3 text-xs text-blue-900">Alasan: {preview.routing.comparison.reasons.join(", ")}</p> : null}
              {preview.routing.comparison?.error ? <p className="mt-1 text-xs font-semibold text-amber-900">{preview.routing.comparison.error.code} — {preview.routing.comparison.error.message}</p> : null}
              <p className="mt-3 text-[11px] leading-4 text-blue-900">Hasil ini diagnostik saja. Chain authoritative tetap Legacy dan tidak ada side effect oversight struktural.</p>
            </div>
          ) : null}

          {preview.warnings.length ? (
            <div className="mt-4 space-y-2">
              {preview.warnings.map((warning) => (
                <div key={warning.code} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <span className="font-semibold">{warning.code}</span> — {warning.message}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </AdminShell>
  );
}
