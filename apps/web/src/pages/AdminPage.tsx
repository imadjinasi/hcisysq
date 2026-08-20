import { ArrowRight, Building2, History, KeyRound, Upload, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "@/layouts/AdminShell";
import { listEmployeeImports, listEmployees } from "@/lib/adminEmployees";
import { getAccessAdmin, getOrganizationAdmin } from "@/lib/adminOrgAccess";

interface OverviewState {
  totalEmployees: number;
  activeEmployees: number;
  imports: number;
  units: number;
  missingManagers: number;
  accounts: number;
  invitedAccounts: number;
}

export function AdminPage() {
  const [overview, setOverview] = useState<OverviewState | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      listEmployees({ pageSize: 1 }),
      listEmployeeImports(),
      getOrganizationAdmin(),
      getAccessAdmin(),
    ])
      .then(([employees, imports, organization, access]) => {
        if (!mounted) return;
        setOverview({
          totalEmployees: employees.summary.total,
          activeEmployees: employees.summary.active,
          imports: imports.items.length,
          units: organization.units.length,
          missingManagers: organization.reportingLines.missingManagers,
          accounts: access.summary.accounts,
          invitedAccounts: access.summary.invited,
        });
      })
      .catch(() => {
        if (mounted) {
          setOverview({
            totalEmployees: 0,
            activeEmployees: 0,
            imports: 0,
            units: 0,
            missingManagers: 0,
            accounts: 0,
            invitedAccounts: 0,
          });
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const cards = [
    {
      title: "Data Pegawai",
      description: "Cari, filter, review detail pegawai, dan tetapkan atasan langsung.",
      href: "/admin/employees",
      icon: UsersRound,
      metric: overview ? `${overview.totalEmployees} pegawai` : "Memuat...",
      detail: overview ? `${overview.activeEmployees} aktif` : "",
    },
    {
      title: "Struktur Organisasi",
      description: "Review unit, jabatan, serta coverage reporting line untuk fondasi approval.",
      href: "/admin/organization",
      icon: Building2,
      metric: overview ? `${overview.units} unit` : "Memuat...",
      detail: overview ? `${overview.missingManagers} atasan langsung belum terisi` : "",
    },
    {
      title: "Account & Akses",
      description: "Siapkan account pegawai dan kelola role tambahan beserta scope-nya.",
      href: "/admin/access",
      icon: KeyRound,
      metric: overview ? `${overview.accounts} account` : "Memuat...",
      detail: overview ? `${overview.invitedAccounts} masih disiapkan` : "",
    },
    {
      title: "Impor Pegawai",
      description: "Upload workbook XLSX, review warning/error, lalu commit jika preview bersih.",
      href: "/admin/employees/import",
      icon: Upload,
      metric: "Preview → commit",
      detail: "Tidak membuat account otomatis",
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
      description="Employee master, struktur organisasi, reporting line, account, role, dan scope sekarang dikelola sebagai domain terpisah tetapi terhubung."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        <p className="text-sm font-bold text-amber-950">Batas aktivasi account</p>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-amber-950/70">
          Account pegawai dapat disiapkan dalam status invited dan role/scope dapat ditetapkan, tetapi account belum dapat diaktifkan sebelum metode autentikasi employee (Google atau password activation) tersedia. Ini mencegah account aktif tanpa kredensial.
        </p>
      </section>
    </AdminShell>
  );
}
