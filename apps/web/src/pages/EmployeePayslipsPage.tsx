import { FileText, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/layouts/AppShell";
import {
  getEmployeeLeaveSummary,
  type EmployeeLeaveSummary,
} from "@/lib/employeeLeave";
import { employeeShellUser } from "@/lib/employeeIdentity";
import {
  getMyPayslip,
  getMyPayslips,
  type PayslipDetail,
  type PayslipSummary,
} from "@/lib/payslips";

function formatPeriod(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export function EmployeePayslipsPage() {
  const [items, setItems] = useState<PayslipSummary[] | null>(null);
  const [selected, setSelected] = useState<PayslipDetail | null>(null);
  const [employee, setEmployee] = useState<EmployeeLeaveSummary["employee"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getMyPayslips()
      .then((result) => {
        if (!mounted) return;
        setItems(result.items);
      })
      .catch((cause: unknown) => {
        if (!mounted) return;
        setItems([]);
        setError(cause instanceof Error ? cause.message : "Payslip tidak dapat dimuat.");
      });

    void getEmployeeLeaveSummary()
      .then((summary) => {
        if (mounted) setEmployee(summary.employee);
      })
      .catch(() => {
        // Payslip content remains usable with the generic employee shell fallback.
      });

    return () => {
      mounted = false;
    };
  }, []);

  const user = useMemo(() => employeeShellUser(employee), [employee]);

  const openPayslip = async (id: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      setSelected(await getMyPayslip(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payslip tidak dapat dibuka.");
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <AppShell user={user} activeItem="Slip Gaji">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-primary">Dokumen pribadi</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-brand-heading sm:text-3xl">Slip Gaji</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Hanya payslip yang sudah dipublikasikan untuk akun Anda yang ditampilkan. Data ini read-only dan berasal dari import; HCIS tidak menghitung payroll.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : null}

        {items === null ? (
          <div className="flex min-h-48 items-center justify-center rounded-3xl border border-border bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-brand-primary" aria-label="Memuat payslip" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-[var(--shadow-soft)]">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-base font-bold">Belum ada payslip yang dipublikasikan</h2>
            <p className="mt-2 text-sm text-muted-foreground">Payslip draft atau yang masih direview tidak ditampilkan di sini.</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="space-y-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openPayslip(item.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border bg-white p-4 text-left shadow-[var(--shadow-soft)] transition hover:border-brand-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>
                    <span className="block text-sm font-bold">{formatPeriod(item.period)}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">Published</span>
                  </span>
                  <LockKeyhole className="h-5 w-5 text-brand-primary" aria-hidden="true" />
                </button>
              ))}
            </div>

            <section className="min-h-72 rounded-3xl border border-border bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
              {loadingDetail ? (
                <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : selected ? (
                <>
                  <div className="border-b border-border pb-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Periode</p>
                    <h2 className="mt-1 text-xl font-bold text-brand-heading">{formatPeriod(selected.period)}</h2>
                  </div>
                  <dl className="divide-y divide-border">
                    {selected.lines.map((line, index) => (
                      <div key={`${line.label}-${index}`} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-6">
                        <dt className="text-sm font-semibold text-muted-foreground">{line.label}</dt>
                        <dd className="break-words text-sm font-bold sm:text-right">{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <div className="flex min-h-56 items-center justify-center text-center text-sm text-muted-foreground">Pilih periode untuk melihat payslip.</div>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
