import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import ysqMark from "@/assets/brand/ysq-mark.png";
import { HcisButton } from "@/components/hcis/HcisButton";
import {
  decideLeaveApproval,
  EmployeeLeaveApiError,
  getLeaveApprovalInbox,
  leaveApprovalSourceLabel,
  leavePolicyLabel,
  type LeaveApprovalInboxItem,
} from "@/lib/employeeLeave";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

export function FoundationBoardApprovalsPage() {
  const [items, setItems] = useState<LeaveApprovalInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const inbox = await getLeaveApprovalInbox();
      setItems(inbox.items);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof EmployeeLeaveApiError
          ? cause.message
          : "Antrean persetujuan cuti tidak dapat dimuat.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (item: LeaveApprovalInboxItem, decision: "approve" | "reject") => {
    const note = decision === "reject" ? window.prompt("Alasan penolakan (opsional):") : null;
    setActing(item.stepId);
    setError(null);
    try {
      await decideLeaveApproval(item.stepId, { decision, note: note?.trim() || null });
      await load();
    } catch (cause) {
      setError(
        cause instanceof EmployeeLeaveApiError
          ? cause.message
          : "Keputusan persetujuan tidak dapat disimpan.",
      );
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={ysqMark} alt="" className="h-10 w-10 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-brand-heading">Persetujuan Cuti</p>
              <p className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground">Organ Yayasan · Yayasan Sabilul Qur&apos;an</p>
            </div>
          </div>
          <a href="/board" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3.5 text-xs font-bold text-muted-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard Organ Yayasan
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <section>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Kewenangan saya</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-brand-heading sm:text-3xl">Persetujuan Cuti</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Hanya permohonan yang secara khusus ditetapkan kepada akun Organ Yayasan ini yang dapat dilihat dan diputuskan.
          </p>
        </section>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : null}

        <section className="mt-5 overflow-hidden rounded-3xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-yellow/15 text-amber-900">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-brand-heading">Antrean saya</h2>
              <p className="text-xs text-muted-foreground">{items.length} permohonan menunggu keputusan.</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat antrean...
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-700" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-brand-heading">Tidak ada persetujuan yang menunggu</p>
              <p className="mt-1 text-xs text-muted-foreground">Semua permohonan yang ditetapkan kepada akun ini sudah ditangani.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {items.map((item) => (
                <article key={item.stepId} className="p-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-brand-heading">{item.requesterName}</p>
                        <span className="rounded-full bg-brand-primary-pale px-2.5 py-1 text-[10px] font-bold text-brand-primary-deep">
                          {leavePolicyLabel(item.policyKey)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-foreground">
                        {formatDate(item.startOn)} – {formatDate(item.endOn)} · {item.workingDays} hari kerja
                      </p>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-[8rem_1fr]">
                        <span className="font-semibold text-muted-foreground">Alasan</span>
                        <span className="leading-5 text-foreground">{item.reason || "Tidak ada keterangan tambahan"}</span>
                        <span className="font-semibold text-muted-foreground">Sumber kewenangan</span>
                        <span className="font-semibold text-brand-primary-deep">{leaveApprovalSourceLabel(item.sources)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <HcisButton disabled={acting === item.stepId} onClick={() => void decide(item, "reject")} variant="destructive">
                        <XCircle className="h-4 w-4" aria-hidden="true" /> Tolak
                      </HcisButton>
                      <HcisButton disabled={acting === item.stepId} onClick={() => void decide(item, "approve")} className="font-bold">
                        {acting === item.stepId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                        Setujui
                      </HcisButton>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
