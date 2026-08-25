import type { ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  Clock3,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Upload,
  UsersRound,
  WalletCards,
  ChevronDown,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import ysqMark from "@/assets/brand/ysq-mark.png";
import { getCurrentSession, logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { AuthSession } from "@/types/hcis";

export type AdminNavKey =
  | "overview"
  | "employees"
  | "import"
  | "history"
  | "organization"
  | "attendance"
  | "leave"
  | "leave-calendar"
  | "payslips"
  | "access";

interface AdminNavItem {
  key: AdminNavKey;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const navGroups: Array<{ key: string; label: string; items: AdminNavItem[] }> = [
  { key: "overview", label: "Umum", items: [
    { key: "overview", label: "Ringkasan", href: "/admin", icon: LayoutDashboard },
  ] },
  { key: "people", label: "Data pegawai", items: [
    { key: "employees", label: "Daftar Pegawai", href: "/admin/employees", icon: UsersRound },
    { key: "import", label: "Impor Pegawai", href: "/admin/employees/import", icon: Upload },
    { key: "history", label: "Riwayat Impor", href: "/admin/employees/imports", icon: History },
  ] },
  { key: "operations", label: "Organisasi & layanan", items: [
    { key: "organization", label: "Struktur Organisasi", href: "/admin/organization", icon: Building2 },
    { key: "attendance", label: "Kehadiran", href: "/admin/attendance", icon: Clock3 },
    { key: "leave", label: "Konfigurasi Cuti", href: "/admin/leave", icon: CalendarDays },
    { key: "leave-calendar", label: "Kalender Kerja", href: "/admin/leave/calendar", icon: CalendarRange },
    { key: "payslips", label: "Payslip", href: "/admin/payslips", icon: WalletCards },
  ] },
  { key: "security", label: "Keamanan", items: [
    { key: "access", label: "Account & Akses", href: "/admin/access", icon: KeyRound },
  ] },
];

export function AdminShell({
  children,
  active,
  title,
  description,
  workspace = false,
}: {
  children: ReactNode;
  active: AdminNavKey;
  title: string;
  description?: string;
  workspace?: boolean;
}) {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let mounted = true;
    void getCurrentSession().then((current) => {
      if (!mounted) return;
      if (!current || current.principal.principalType !== "SUPER_ADMIN") {
        void navigate({ to: "/" });
        return;
      }
      setSession(current);
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      await navigate({ to: "/" });
      setLoggingOut(false);
    }
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f8f7] text-foreground lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside className="border-b border-border/70 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <img src={ysqMark} alt="" className="h-10 w-10 object-contain" />
          <div className="min-w-0">
            <p title="Human Capital Information System" className="truncate text-xs font-bold leading-4 text-brand-heading">Human Capital Information System</p>
            <p title="Yayasan Sabilul Qur'an" className="truncate text-[11px] text-muted-foreground">Yayasan Sabilul Qur&apos;an</p>
          </div>
        </div>

        <nav className="flex gap-3 overflow-x-auto px-4 pb-4 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:overflow-x-hidden lg:px-3 lg:pb-2" aria-label="Navigasi Super Admin">
          {navGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            return <section key={group.key} className="shrink-0 lg:w-full" data-admin-nav-group={group.key}>
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-controls={`admin-nav-${group.key}`}
                onClick={() => toggleGroup(group.key)}
                className="hidden h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 text-left text-xs font-semibold tracking-wide text-muted-foreground hover:bg-muted/70 lg:flex"
              >
                <span className="min-w-0 truncate" title={group.label}>{group.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", collapsed && "-rotate-90")} aria-hidden="true" />
              </button>
              <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground lg:hidden">{group.label}</p>
              <div id={`admin-nav-${group.key}`} hidden={collapsed} className="flex gap-1 lg:block">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const selected = item.key === active;
                  return <a
                    key={item.key}
                    href={item.href}
                    onClick={(event) => {
                      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      void navigate({ to: item.href });
                    }}
                    aria-current={selected ? "page" : undefined}
                    title={item.label}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors lg:mb-0.5 lg:w-full lg:min-w-0 lg:shrink",
                      selected ? "bg-brand-primary-pale text-brand-primary-deep" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </a>;
                })}
              </div>
            </section>;
          })}
        </nav>

        <div className="hidden shrink-0 px-3 pb-3 pt-2 lg:block">
          <div className="rounded-xl border border-border/70 bg-surface p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-primary-deep">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Super Admin
            </div>
            <p title={session?.principal.email} className="mt-2 truncate text-xs leading-5 text-muted-foreground">
              {session?.principal.email ?? "Memuat sesi..."}
            </p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-white text-xs font-semibold hover:bg-muted/60 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {loggingOut ? "Keluar..." : "Keluar"}
            </button>
          </div>
        </div>
      </aside>

      <div className={cn("min-w-0", workspace && "lg:flex lg:h-screen lg:min-h-0 lg:flex-col")}>
        <header
          className="border-b border-border/70 bg-white/90 px-5 py-3 sm:px-7 lg:px-10"
          data-admin-page-header
        >
          <div className="mx-auto max-w-7xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Administrasi sistem</p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-[-0.02em] text-brand-heading sm:text-[1.75rem]">{title}</h1>
            {description ? <p className="mt-0.5 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p> : null}
          </div>
        </header>
        <main className={cn("mx-auto max-w-7xl px-5 py-4 sm:px-7 lg:px-10 lg:py-5", workspace && "flex min-h-0 w-full max-w-none flex-1 flex-col")}>{children}</main>
      </div>
    </div>
  );
}
