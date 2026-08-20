import type { ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  UsersRound,
  WalletCards,
} from "lucide-react";

import ysqMark from "@/assets/brand/ysq-mark.png";
import { cn } from "@/lib/utils";

interface AppShellUser {
  name: string;
  initials: string;
  position: string;
  unit: string;
  additionalRole?: string;
}

interface AppShellProps {
  children: ReactNode;
  user: AppShellUser;
  activeItem?: string;
}

const employeeNavigation = [
  { label: "Beranda", icon: Home },
  { label: "Kehadiran", icon: Clock3 },
  { label: "Cuti & Izin", icon: CalendarDays },
  { label: "Slip Gaji", icon: WalletCards },
  { label: "Dokumen", icon: FolderOpen },
  { label: "Pengembangan", icon: GraduationCap },
];

const managementNavigation = [
  { label: "Persetujuan", icon: ClipboardCheck },
  { label: "Tim Saya", icon: UsersRound },
];

const mobileNavigation = [
  { label: "Beranda", icon: Home },
  { label: "Hadir", icon: Clock3 },
  { label: "Cuti", icon: CalendarDays },
  { label: "Slip Gaji", icon: WalletCards },
  { label: "Dokumen", icon: FileText },
];

function NavigationButton({ label, icon: Icon, active = false }: { label: string; icon: typeof Home; active?: boolean }) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-brand-primary-pale text-brand-primary-deep shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:bg-white hover:text-foreground",
      )}
    >
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl transition-colors", active ? "bg-white text-brand-primary shadow-[var(--shadow-soft)]" : "bg-muted/70 text-muted-foreground group-hover:bg-brand-primary-pale")}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function AppShell({ children, user, activeItem = "Beranda" }: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border/80 bg-sidebar/95 px-5 py-6 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2">
          <img src={ysqMark} alt="" className="h-12 w-12 object-contain" />
          <div>
            <p className="font-display text-xl font-bold leading-none text-brand-heading">HCIS YSQ</p>
            <p className="mt-1 text-[11px] font-semibold tracking-wide text-muted-foreground">Ruang kerja pegawai</p>
          </div>
        </div>

        <nav className="mt-8 flex-1 space-y-1.5" aria-label="Navigasi utama pegawai">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">Saya</p>
          {employeeNavigation.map((item) => (
            <NavigationButton key={item.label} label={item.label} icon={item.icon} active={item.label === activeItem} />
          ))}

          {user.additionalRole && (
            <div className="pt-6">
              <div className="mb-2 flex items-center justify-between px-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">Manajemen</p>
                <span className="rounded-full bg-brand-yellow/18 px-2 py-1 text-[9px] font-bold text-amber-900">{user.additionalRole}</span>
              </div>
              <div className="space-y-1.5">
                {managementNavigation.map((item) => (
                  <NavigationButton key={item.label} label={item.label} icon={item.icon} />
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="rounded-3xl border border-border/70 bg-white p-3.5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-primary text-sm font-bold text-white shadow-[var(--shadow-button)]">{user.initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user.position} · {user.unit}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-surface/92 px-4 py-3 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <img src={ysqMark} alt="" className="h-9 w-9 object-contain" />
              <div>
                <p className="font-display text-lg font-bold leading-none text-brand-heading">HCIS YSQ</p>
                <p className="mt-1 text-[10px] font-semibold text-muted-foreground">Pegawai</p>
              </div>
            </div>

            <p className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:block">Employee workspace</p>

            <div className="flex items-center gap-2">
              <button type="button" aria-label="Notifikasi" className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-border/70 bg-white text-muted-foreground shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-orange ring-2 ring-white" aria-hidden="true" />
              </button>
              <div className="hidden items-center gap-2 rounded-2xl border border-border/70 bg-white py-1.5 pl-1.5 pr-3 shadow-[var(--shadow-soft)] sm:flex">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary text-xs font-bold text-white">{user.initials}</div>
                <div className="max-w-40">
                  <p className="truncate text-xs font-bold">{user.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{user.unit}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[1.75rem] border border-border/80 bg-white/96 p-1.5 shadow-[var(--shadow-raised)] backdrop-blur lg:hidden" aria-label="Navigasi mobile pegawai">
        {mobileNavigation.map((item, index) => {
          const Icon = item.icon;
          const active = index === 0;
          return (
            <button type="button" key={item.label} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-brand-primary-pale text-brand-primary-deep" : "text-muted-foreground")}>
              <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
