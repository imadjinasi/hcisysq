import { useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { getCurrentSession, logout } from "@/lib/auth";
import type { AuthSession } from "@/types/hcis";

export function AdminPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    void getCurrentSession().then((current) => {
      if (!active) return;
      if (!current || current.principal.principalType !== "SUPER_ADMIN") {
        void navigate({ to: "/" });
        return;
      }
      setSession(current);
    });
    return () => {
      active = false;
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
    <main className="min-h-screen bg-[#f6f8f7] px-5 py-8 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-5 rounded-3xl border border-white bg-white/90 p-6 shadow-[var(--shadow-raised)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary-pale text-brand-primary-deep">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold leading-5 text-muted-foreground">
                Human Capital Information System · Yayasan Sabilul Qur&apos;an
              </p>
              <h1 className="mt-0.5 font-display text-2xl font-bold tracking-[-0.015em] text-brand-heading">
                Super Admin
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {loggingOut ? "Keluar..." : "Keluar"}
          </button>
        </header>

        <section className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_0.85fr]">
          <article className="rounded-3xl bg-brand-primary p-6 text-white shadow-[var(--shadow-raised)] sm:p-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">Akses sistem</p>
            <h2 className="mt-2.5 font-display text-2xl font-bold tracking-[-0.015em]">
              Fondasi administrasi aktif
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
              Area ini hanya dapat dibuka oleh akun Super Admin yang memiliki sesi aktif. Modul pengelolaan akun, role, dan impor pegawai akan ditambahkan bertahap di atas fondasi ini.
            </p>
          </article>

          <article className="rounded-3xl border border-border/70 bg-white p-6 shadow-[var(--shadow-card)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Sesi aktif</p>
            <p className="mt-3 break-all text-sm font-semibold text-brand-heading">
              {session?.principal.email ?? "Memuat sesi..."}
            </p>
            <div className="mt-4 rounded-2xl bg-brand-primary-pale/60 p-4">
              <p className="text-xs font-bold text-brand-primary-deep">Password + MFA diwajibkan</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Cookie sesi disimpan sebagai HttpOnly dan Secure pada deployment HTTPS.
              </p>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
