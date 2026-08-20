import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FolderOpen,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { HcisStatusBadge } from "@/components/hcis/HcisStatusBadge";
import { employeeDashboardMock } from "@/data/mock/employeeDashboard";
import { AppShell } from "@/layouts/AppShell";

const quickActions = [
  { label: "Ajukan cuti", description: "Cuti tahunan atau khusus", icon: CalendarDays, className: "bg-brand-primary-pale text-brand-primary-deep" },
  { label: "Izin kehadiran", description: "Klarifikasi atau izin kehadiran", icon: Clock3, className: "bg-brand-cyan/14 text-cyan-950" },
  { label: "Slip gaji", description: "Lihat data payslip yang telah diimpor", icon: WalletCards, className: "bg-brand-orange/14 text-orange-950" },
  { label: "Dokumen saya", description: "Akses dokumen kepegawaian", icon: FolderOpen, className: "bg-brand-yellow/16 text-amber-950" },
];

function getDateLabel() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function EmployeeDashboardPage() {
  const data = employeeDashboardMock;
  const leaveProgress = Math.round((data.leave.used / data.leave.total) * 100);

  return (
    <AppShell user={data.user} activeItem="Beranda">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold capitalize tracking-wide text-muted-foreground">{getDateLabel()}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-[-0.015em] text-brand-heading sm:text-3xl">
            Assalamu&apos;alaikum, Ahmad.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Ringkasan aktivitas kerja, pengajuan, dan hal yang perlu Anda tindak lanjuti hari ini.
          </p>
        </div>

        {data.user.additionalRole && (
          <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-brand-yellow/35 bg-brand-yellow/12 px-3.5 py-2 text-xs font-semibold text-amber-950 shadow-[var(--shadow-soft)]">
            <UsersRound className="h-4 w-4" aria-hidden="true" />
            Akses tambahan · {data.user.additionalRole}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <article className="relative overflow-hidden rounded-[2rem] bg-brand-primary p-5 text-white shadow-[var(--shadow-brand-card)] sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-brand-cyan/45 blur-2xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-16 h-44 w-44 rounded-full bg-brand-yellow/25 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between gap-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70">
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  Kehadiran hari ini
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <p className="font-display text-3xl font-bold leading-none sm:text-4xl">{data.attendance.checkIn}</p>
                  <div className="pb-0.5">
                    <p className="text-sm font-bold">Check-in</p>
                    <p className="mt-1 text-xs text-white/70">Jadwal {data.attendance.schedule}</p>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/14 px-3 py-1.5 text-xs font-bold text-white shadow-[var(--shadow-soft)]">
                <CheckCircle2 className="h-4 w-4 text-brand-yellow" aria-hidden="true" />
                {data.attendance.state}
              </span>
            </div>
            <div className="flex flex-col gap-4 border-t border-white/18 pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium text-white/65">Status</p>
                <p className="mt-1 text-sm font-bold">{data.attendance.note}</p>
              </div>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-brand-primary-deep shadow-[var(--shadow-button)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:self-auto">
                Lihat detail kehadiran
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>

        <article className="rounded-[2rem] border border-border/80 bg-white p-5 shadow-[var(--shadow-raised)] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cuti tahunan</p>
              <p className="mt-2 font-display text-3xl font-bold text-brand-heading">
                {data.leave.remaining}
                <span className="ml-2 font-sans text-sm font-semibold text-muted-foreground">hari tersisa</span>
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary-pale text-brand-primary shadow-[var(--shadow-soft)]">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-7">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{data.leave.used} hari terpakai</span>
              <span>{data.leave.total} hari kuota</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand-primary" style={{ width: `${leaveProgress}%` }} aria-label={`${leaveProgress}% cuti tahunan terpakai`} />
            </div>
          </div>
          <button type="button" className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-brand-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Lihat rincian cuti
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </article>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-border/75 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-cyan/14 text-cyan-900"><FileText className="h-5 w-5" aria-hidden="true" /></span>
            <HcisStatusBadge tone="review">Aktif</HcisStatusBadge>
          </div>
          <p className="mt-5 text-2xl font-bold text-foreground">{data.activeRequests}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Pengajuan berjalan</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Pengajuan cuti atau izin yang belum selesai.</p>
        </article>

        <article className="rounded-3xl border border-border/75 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-orange/14 text-orange-900"><WalletCards className="h-5 w-5" aria-hidden="true" /></span>
            <HcisStatusBadge tone="approved">Read only</HcisStatusBadge>
          </div>
          <p className="mt-5 text-base font-bold text-foreground">{data.payslip.period}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">Slip gaji terbaru</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.payslip.source} · {data.payslip.importedAt}</p>
        </article>

        <article className="rounded-3xl border border-brand-yellow/35 bg-brand-yellow/10 p-5 shadow-[var(--shadow-soft)] sm:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900/70">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Akses manajemen
              </div>
              <p className="mt-3 text-2xl font-bold text-amber-950">{data.approvals.total}</p>
              <p className="mt-1 text-sm font-bold text-amber-950">Persetujuan tim menunggu</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-amber-950/65">Muncul karena role tambahan. Fitur pegawai tetap tersedia.</p>
            </div>
            <button type="button" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl bg-white px-3.5 text-xs font-bold text-amber-950 shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Buka antrean
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>
      </section>

      <section className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Akses cepat</p>
        <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.01em] text-brand-heading">Apa yang ingin Anda lakukan?</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button type="button" key={action.label} className="group rounded-3xl border border-border/75 bg-white p-4 text-left shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${action.className}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">{action.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[2rem] border border-border/80 bg-white p-5 shadow-[var(--shadow-raised)] sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pengajuan saya</p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.01em] text-brand-heading">Status terbaru</h2>
            </div>
            <button type="button" className="text-xs font-bold text-brand-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Lihat semua</button>
          </div>
          <div className="mt-5 divide-y divide-border/70">
            {data.requests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground">{request.type}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{request.detail}</p>
                </div>
                <HcisStatusBadge tone={request.tone}>{request.status}</HcisStatusBadge>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-border/80 bg-white p-5 shadow-[var(--shadow-raised)] sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-yellow/16 text-amber-950"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Perlu perhatian</p>
              <h2 className="mt-1 text-base font-bold text-foreground">Persetujuan tim</h2>
            </div>
          </div>
          <div className="mt-5 space-y-2.5">
            {data.approvals.items.map((item) => (
              <button type="button" key={item.id} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-surface px-3.5 py-3 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{item.name}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.type} · {item.age}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
