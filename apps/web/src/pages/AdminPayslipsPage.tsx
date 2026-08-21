import { FileCheck2, Loader2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "@/layouts/AdminShell";
import {
  commitPayslipImport,
  listPayslipImports,
  previewPayslipImport,
  publishPayslipImport,
  type PayslipImportBatch,
} from "@/lib/payslips";

export function AdminPayslipsPage() {
  const [items, setItems] = useState<PayslipImportBatch[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    const result = await listPayslipImports();
    setItems(result.items);
  };

  useEffect(() => {
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Riwayat payslip tidak dapat dimuat."));
  }, []);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operasi payslip gagal diproses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell
      active="payslips"
      title="Payslip MVP"
      description="Import, review, commit draft, lalu publish. HCIS tidak menghitung payroll dan tidak menurunkan nilai baru dari data import."
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-brand-heading">Preview CSV</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Contract: <code>employee_number,period,lines_json</code>. Preview wajib direview sebelum commit/publish.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="max-w-full text-sm"
              />
              <button
                type="button"
                disabled={!file || busy}
                onClick={() => file && void run(() => previewPayslipImport(file), "Preview disimpan. Review validation count sebelum commit.")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Preview
              </button>
            </div>
          </div>
        </section>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
        {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div> : null}

        <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-soft)]">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-bold text-brand-heading">Batch terbaru</h2>
            <p className="mt-1 text-xs text-muted-foreground">Tidak ada nilai payroll yang dihitung pada layar ini.</p>
          </div>

          {items === null ? (
            <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Belum ada batch payslip.</div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-brand-primary" />
                      <p className="font-bold">{item.sourceFilename}</p>
                      <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-bold uppercase tracking-wide">{item.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.rowCount} row · {item.validCount} valid · {item.errorCount} error
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.status === "previewed" ? (
                      <button
                        type="button"
                        disabled={busy || item.errorCount > 0}
                        onClick={() => void run(() => commitPayslipImport(item.id), "Batch di-commit sebagai draft.")}
                        className="rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Commit draft
                      </button>
                    ) : null}
                    {item.status === "committed" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => publishPayslipImport(item.id), "Batch dipublikasikan dan sekarang dapat dibaca employee pemiliknya.")}
                        className="rounded-xl bg-brand-primary px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Publish
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
