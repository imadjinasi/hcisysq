import { ArrowRight, History, Upload, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "@/layouts/AdminShell";
import { listEmployeeImports, listEmployees } from "@/lib/adminEmployees";

interface OverviewState {
  totalEmployees: number;
  activeEmployees: number;
  imports: number;
}

export function AdminPage() {
  const [overview, setOverview] = useState<OverviewState | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([listEmployees({ pageSize: 1 }), listEmployeeImports()])
      .then(([employees, imports]) => {
        if (!mounted) return;
        setOverview({
          totalEmployees: employees.summary.total,
          activeEmployees: employees.summary.active,
          imports: imports.items.length,
        });
      })
      .catch(() => {
        if (mounted) setOverview({ totalEmployees: 0, activeEmployees: 0, imports: 0 });
      });
    return () => {
      mounted = false;
    };
  }, []);

  const cards = [
    {
      title: "Data Pegawai",
      description: "Cari, filter, dan review employee master yang sudah masuk ke PostgreSQL.",
      href: "/admin/employees",
      icon: UsersRound,
      metric: overview ? `${overview.totalEmployees} pegawai` : "Memuat...",
      detail: overview ? `${overview.activeEmployees} aktif` : "",
    },
    {
      title: "Impor Pegawai",
      description: "Upload workbook XLSX, review warning/error, lalu commit jika preview bersih.",
      href: "/admin/employees/import",
      icon: Upload,
      metric: "Preview → commit",
      detail: "Tidak membuat akun otomatis",
    },
    {
      title: "Riwayat Impor",
      description: "Lihat checksum, jumlah insert/update, error, waktu, dan actor import.",
      href: "/admin/employees/imports",
      icon: History,
      metric: overview ? `${overview.imports} riwayat terbaru` : "Memuat...",
      detail: "Maksimal 50 entri terbaru",
    },
  ];

  return (
    <AdminShell
      active="overview"
      title="Ringkasan Super Admin"
      description="Fondasi autentikasi sudah aktif. Milestone berikutnya menyatukan employee master dan import dalam satu alur administrasi."
    >
      <section className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <a
              key={card.title}
              href={card.href}
              className="group rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary-pale text-brand-primary-deep">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-base font-bold text-brand-heading">{card.title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.description}</p>
              <div className="mt-5 border-t border-border/70 pt-4">
                <p className="text-sm font-bold text-foreground">{card.metric}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
              </div>
            </a>
          );
        })}
      </section>

      <section className="mt-5 rounded-2xl border border-brand-yellow/30 bg-brand-yellow/10 p-5">
        <p className="text-sm font-bold text-amber-950">Batas keamanan milestone ini</p>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-amber-950/70">
          Import hanya mengelola employee master dan referensi unit/jabatan. Account pengguna, role, scope, reporting line, payroll, dan approval tetap terpisah dan belum dibuat otomatis.
        </p>
      </section>
    </AdminShell>
  );
}
