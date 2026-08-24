import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Loader2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/layouts/AppShell";
import {
  getMyAttendanceResolutions,
  type AttendanceResolutionItem,
} from "@/lib/attendanceResolution";
import {
  getEmployeeLeaveSummary,
  type EmployeeLeaveSummary,
} from "@/lib/employeeLeave";
import {
  getSpecialLeaveSummary,
  type SpecialLeaveSummary,
} from "@/lib/specialLeave";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getDateLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function requestStatusLabel(status: string, specialTaskStatus?: string | null) {
  if (specialTaskStatus === "needs_correction") return "Perlu dilengkapi";
  if (specialTaskStatus === "pending") return "Validasi HC";
  if (status === "approved") return "Selesai";
  if (status === "rejected") return "Tidak disetujui";
  if (status === "cancelled") return "Dibatalkan";
  return "Diproses";
}

interface DashboardState {
  annual: EmployeeLeaveSummary;
  special: SpecialLeaveSummary;
  resolutions: AttendanceResolutionItem[];
}

export function EmployeeDashboardPage() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [annual, special, resolutions] = await Promise.all([
          getEmployeeLeaveSummary(),
          getSpecialLeaveSummary(),
          getMyAttendanceResolutions(),
        ]);
        setData({ annual, special, resolutions: resolutions.items });
        setError(null);
      } catch (cause) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "Dashboard tidak dapat dimuat.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const employee = data?.annual.employee;
  const pendingEmployeeResolution =
    data?.resolutions.filter((item) => item.status === "awaiting_employee").length ?? 0;
  const needsCompletion =
    data?.special.requests.filter((item) => item.hcTaskStatus === "needs_correction").length ?? 0;
  const pendingApprovals = data?.annual.pendingApprovalCount ?? 0;
  const hasOrganizationHcAccess = data?.special.hasHumanCapitalRole ?? false;
  const activeRequests = [
    ...(data?.annual.requests ?? []).filter((item) => item.status === "in_review"),
    ...(data?.special.requests ?? []).filter((item) => item.status === "in_review"),
  ].length;

  const additionalRole = pendingApprovals > 0 ? "Approver" : undefined;
  const accessLabel = hasOrganizationHcAccess ? "Human Capital" : additionalRole;
  const user = {
    name: employee?.fullName ?? "Pegawai",
    initials: initials(employee?.fullName ?? "P"),
    position: employee?.positionName ?? "Pegawai",
    unit: employee?.unitName ?? "Yayasan Sabilul Qur'an",
    ...(additionalRole ? { additionalRole } : {}),
  };

  const firstName = employee?.fullName.split(/\s+/).filter(Boolean)[0] ?? "Pegawai";
  const annualView = data?.annual.annualLeave;
  const currentPeriod = annualView?.periods.find((period) => period.status === "current") ?? null;

  const latestRequests = useMemo(() => {
    if (!data) return [];
    const annual = data.annual.requests.map((item) => ({
      id: item.id,
      name: "Cuti Tahunan",
      detail: `${formatDate(item.startOn)} – ${formatDate(item.endOn)} · ${item.workingDays} hari kerja`,
      status: requestStatusLabel(item.status),
      submittedAt: item.submittedAt,
    }));
    const special = data.special.requests.map((item) => ({
      id: item.id,
      name: item.policyName,
      detail: `${formatDate(item.startOn)} – ${formatDate(item.endOn)} · ${item.workingDays} hari kerja`,
      status: requestStatusLabel(item.status, item.hcTaskStatus),
      submittedAt: item.submittedAt,
    }));
    return [...annual, ...special]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 5);
  }, [data]);

  return (
    <AppShell
      user={user}
      activeItem="Beranda"
      capabilities={{ humanCapitalOrganization: hasOrganizationHcAccess, approvalResponsibility: pendingApprovals > 0 }}
    >
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold capitalize tracking-wide text-muted-foreground">{getDateLabel()}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-brand-heading sm:text-3xl">
            Assalamu&apos;alaikum, {firstName}.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Ringkasan data Anda dan hal yang perlu ditindaklanjuti hari ini.
          </p>
        </div>
        {accessLabel ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-brand-yellow/35 bg-brand-yellow/12 px-3.5 py-2 text-xs font-semibold text-amber-950 shadow-[var(--shadow-soft)]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Akses tambahan · {accessLabel}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="mt-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 rounded-3xl border border-border/70 bg-white p-6 text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat dashboard Anda...
        </div>
      ) : !data ? (
        <div className="mt-6 rounded-3xl border border-border/70 bg-white p-6 text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
          Dashboard belum dapat ditampilkan. Muat ulang halaman setelah koneksi tersedia kembali.
        </div>
      ) : (
        <>
          {(pendingEmployeeResolution > 0 || needsCompletion > 0 || pendingApprovals > 0) ? (
            <section className="mt-6 grid gap-3 lg:grid-cols-3">
              {pendingEmployeeResolution > 0 ? (
                <a href="/app/attendance-resolution" className="rounded-3xl border border-brand-yellow/40 bg-brand-yellow/12 p-5 shadow-[var(--shadow-soft)]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900/70">Perlu keputusan Anda</p>
                  <p className="mt-2 text-2xl font-bold text-amber-950">{pendingEmployeeResolution}</p>
                  <p className="mt-1 text-sm font-bold text-amber-950">Tindak lanjut ketidakhadiran</p>
                  <p className="mt-1 text-xs leading-5 text-amber-950/70">Buka untuk menerima atau menolak usulan penyelesaian.</p>
                </a>
              ) : null}
              {needsCompletion > 0 ? (
                <a href="/app/leave/special" className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-[var(--shadow-soft)]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800">Dokumen cuti</p>
                  <p className="mt-2 text-2xl font-bold text-amber-950">{needsCompletion}</p>
                  <p className="mt-1 text-sm font-bold text-amber-950">Perlu dilengkapi</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">Human Capital meminta kelengkapan administrasi.</p>
                </a>
              ) : null}
              {pendingApprovals > 0 ? (
                <a href="/app/approvals" className="rounded-3xl border border-brand-primary/20 bg-brand-primary-pale/50 p-5 shadow-[var(--shadow-soft)]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-primary-deep/70">Persetujuan</p>
                  <p className="mt-2 text-2xl font-bold text-brand-heading">{pendingApprovals}</p>
                  <p className="mt-1 text-sm font-bold text-brand-heading">Menunggu tindakan</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Pengajuan tim yang sedang menunggu keputusan Anda.</p>
                </a>
              ) : null}
            </section>
          ) : (
            <div className="mt-6 flex items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" /> Tidak ada tindakan mendesak untuk Anda saat ini.
            </div>
          )}

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-[2rem] border border-border/80 bg-white p-5 shadow-[var(--shadow-raised)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cuti tahunan</p>
                  {employee?.leaveEntitlementGroup === "non_education" ? (
                    <>
                      <p className="mt-2 text-3xl font-bold text-brand-heading">12 <span className="text-sm font-semibold text-muted-foreground">hari / tahun</span></p>
                      <p className="mt-3 text-sm font-bold text-brand-heading">
                        {annualView?.availableNowDays ?? 0} hari tersedia sekarang
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {currentPeriod ? `${currentPeriod.label} · ${currentPeriod.remainingDays} dari 3 hari belum digunakan` : "Belum masuk periode yang dapat digunakan."}
                      </p>
                    </>
                  ) : employee?.leaveEntitlementGroup === "education" ? (
                    <>
                      <p className="mt-2 text-lg font-bold text-brand-heading">Dipenuhi melalui kalender akademik</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Cuti Akhir Semester dan Akhir Tahun Pelajaran menjadi pemenuhan hak tahunan tenaga pendidikan.
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-amber-900">Kelompok hak cuti belum dikonfigurasi.</p>
                  )}
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary-pale text-brand-primary-deep">
                  <CalendarDays className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <a href="/app/leave" className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-primary-deep">
                Buka Cuti & Izin <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </article>

            <article className="rounded-[2rem] border border-border/80 bg-white p-5 shadow-[var(--shadow-raised)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Kehadiran</p>
                  <p className="mt-2 text-lg font-bold text-brand-heading">Rekaman harian</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Lihat jam masuk dan jam keluar yang sudah tercatat. HCIS belum menyimpulkan telat atau absen sebelum jadwal kerja dihubungkan.
                  </p>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-cyan/14 text-cyan-900">
                  <Clock3 className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <a href="/app/attendance" className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-primary-deep">
                Buka Kehadiran <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </article>
          </section>

          <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <a href="/app/leave" className="rounded-3xl border border-border/75 bg-white p-5 shadow-[var(--shadow-soft)]">
              <CalendarDays className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
              <p className="mt-4 text-sm font-bold text-brand-heading">Ajukan / laporkan cuti</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Cuti Tahunan, sakit, atau kondisi khusus dari satu pintu.</p>
            </a>
            <a href="/app/approvals" className="rounded-3xl border border-border/75 bg-white p-5 shadow-[var(--shadow-soft)]">
              <ClipboardCheck className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
              <p className="mt-4 text-sm font-bold text-brand-heading">Persetujuan</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{pendingApprovals > 0 ? `${pendingApprovals} pengajuan menunggu Anda.` : "Tidak ada approval yang menunggu."}</p>
            </a>
            {hasOrganizationHcAccess ? (
              <a href="/app/hc/leave" className="rounded-3xl border border-border/75 bg-white p-5 shadow-[var(--shadow-soft)]">
                <ShieldCheck className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
                <p className="mt-4 text-sm font-bold text-brand-heading">Ruang kerja HC</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Validasi administrasi cuti dan penyelesaian kehadiran.</p>
              </a>
            ) : (
              <div className="rounded-3xl border border-border/75 bg-white p-5 shadow-[var(--shadow-soft)]">
                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <p className="mt-4 text-sm font-bold text-brand-heading">Pengajuan berjalan</p>
                <p className="mt-1 text-2xl font-bold text-brand-heading">{activeRequests}</p>
                <p className="mt-1 text-xs text-muted-foreground">Cuti atau izin yang masih diproses.</p>
              </div>
            )}
            <div className="rounded-3xl border border-border/75 bg-white p-5 shadow-[var(--shadow-soft)]">
              <WalletCards className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <p className="mt-4 text-sm font-bold text-brand-heading">Slip gaji</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Belum tersedia. Tidak ada periode atau nominal sintetis yang ditampilkan.</p>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-[2rem] border border-border/80 bg-white shadow-[var(--shadow-raised)]">
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pengajuan saya</p>
                <h2 className="mt-1 text-lg font-bold text-brand-heading">Status terbaru</h2>
              </div>
              <a href="/app/leave" className="text-xs font-bold text-brand-primary-deep">Lihat Cuti & Izin</a>
            </div>
            <div className="divide-y divide-border/70">
              {latestRequests.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground sm:px-6">Belum ada pengajuan cuti atau izin.</p>
              ) : (
                latestRequests.map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                      <p className="text-sm font-bold text-brand-heading">{item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <span className="w-fit rounded-full bg-surface px-3 py-1 text-xs font-semibold text-brand-heading">{item.status}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
