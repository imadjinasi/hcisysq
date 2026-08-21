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
  | "access";

const navItems: Array<{
  key: AdminNavKey;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "overview", label: "Ringkasan", href: "/admin", icon: LayoutDashboard },
  { key: "employees", label: "Daftar Pegawai", href: "/admin/employees", icon: UsersRound },
  { key: "import", label: "Impor Pegawai", href: "/admin/employees/import", icon: Upload },
  { key: "history", label: "Riwayat Impor", href: "/admin/employees/imports", icon: History },
  { key: "organization", label: "Struktur Organisasi", href: "/admin/organization", icon: Building2 },
  { key: "attendance", label: "Kehadiran", href: "/admin/attendance", icon: Clock3 },
  { key: "leave", label: "Konfigurasi Cuti", href: "/admin/leave", icon: CalendarDays },
  { key: "leave-calendar", label: "Kalender Kerja", href: "/admin/leave/calendar", icon: CalendarRange },
  { key: "access", label: "Account & Akses", href: "/admin/access", icon: KeyRound },
];

export function AdminShell({
  children,
  active,
  title,
  description,
}: {
  children: ReactNode;
  active: AdminNavKey;
  title: string;
  description?: string;
}) {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <div className="min-h-screen bg-[#f5f8f7] text-foreground lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="border-b border-border/70 bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-5 lg:px-6">
          <img src={ysqMark} alt="" className="h-10 w-10 object-contain" />
          <div className="min-w-0">
            <p className="text-sm font-bold leading-5 text-brand-heading">Human Capital Information System</p>
            <p className="text-[11px] text-muted-foreground">Yayasan Sabilul Qur&apos;an</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:px-4 lg:pb-0" aria-label="Navigasi Super Admin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = item.key === active;
            return (
              <a
                key={item.key}
                href={item.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                  selected
                    ? "bg-brand-primary-pale text-brand-primary-deep"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="hidden px-4 pb-5 pt-8 lg:block">
          <div className="rounded-2xl border border-border/70 bg-surface p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-primary-deep">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Super Admin
            </div>
            <p className="mt-2 break-all text-xs leading-5 text-muted-foreground">
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

      <div className="min-w-0">
        <header className="border-b border-border/70 bg-white/90 px-5 py-5 sm:px-7 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Administrasi sistem</p>
            <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-brand-heading sm:text-[1.75rem]">{title}</h1>
            {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-6 sm:px-7 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
