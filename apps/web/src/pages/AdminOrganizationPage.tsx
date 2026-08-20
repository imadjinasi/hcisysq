import { Building2, Network, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "@/layouts/AdminShell";
import { AdminApiError } from "@/lib/adminEmployees";
import {
  getOrganizationAdmin,
  type OrganizationAdminResponse,
} from "@/lib/adminOrgAccess";

export function AdminOrganizationPage() {
  const [data, setData] = useState<OrganizationAdminResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void getOrganizationAdmin()
      .then((result) => {
        if (mounted) setData(result);
      })
      .catch((cause: unknown) => {
        if (!mounted) return;
        setError(
          cause instanceof AdminApiError
            ? cause.message
            : "Struktur organisasi tidak dapat dimuat.",
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  const coverage = data?.reportingLines;
  const coveragePercent = coverage?.activeEmployees
    ? Math.round((coverage.assignedManagers / coverage.activeEmployees) * 100)
    : 0;

  return (
    <AdminShell
      active="organization"
      title="Struktur Organisasi"
      description="Unit, jabatan, dan kelengkapan reporting line menjadi fondasi resolver approval. Data unit dan jabatan saat ini berasal dari employee master."
    >
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <Building2 className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
          <p className="mt-4 text-2xl font-bold text-brand-heading">{data?.units.length ?? 0}</p>
          <p className="mt-1 text-sm font-semibold">Unit organisasi</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <UsersRound className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
          <p className="mt-4 text-2xl font-bold text-brand-heading">{data?.positions.length ?? 0}</p>
          <p className="mt-1 text-sm font-semibold">Jabatan</p>
        </article>
        <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <Network className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
          <p className="mt-4 text-2xl font-bold text-brand-heading">{coveragePercent}%</p>
          <p className="mt-1 text-sm font-semibold">Reporting line terisi</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {coverage?.missingManagers ?? 0} pegawai aktif belum memiliki atasan langsung.
          </p>
        </article>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <article className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-border/70 px-5 py-4">
            <h2 className="text-base font-bold text-brand-heading">Unit organisasi</h2>
            <p className="mt-1 text-xs text-muted-foreground">Jumlah pegawai mengikuti assignment unit pada employee master.</p>
          </div>
          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Unit</th>
                  <th className="px-5 py-3 text-right font-semibold">Aktif</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data?.units.map((unit) => (
                  <tr key={unit.id}>
                    <td className="px-5 py-3 font-semibold">{unit.name}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{unit.activeCount}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{unit.employeeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-border/70 px-5 py-4">
            <h2 className="text-base font-bold text-brand-heading">Jabatan</h2>
            <p className="mt-1 text-xs text-muted-foreground">Daftar jabatan ternormalisasi dari employee master.</p>
          </div>
          <div className="max-h-[34rem] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Jabatan</th>
                  <th className="px-5 py-3 text-right font-semibold">Aktif</th>
                  <th className="px-5 py-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {data?.positions.map((position) => (
                  <tr key={position.id}>
                    <td className="px-5 py-3 font-semibold">{position.name}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{position.activeCount}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{position.employeeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </AdminShell>
  );
}
