import {
  CheckCircle2,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/layouts/AppShell";
import {
  decideHcLeaveValidation,
  getHcLeaveValidationQueue,
  hcEvidenceDownloadHref,
  type HcLeaveQueue,
  SpecialLeaveApiError,
} from "@/lib/specialLeave";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

export function HcLeaveValidationPage() {
  const [queue, setQueue] = useState<HcLeaveQueue | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setQueue(await getHcLeaveValidationQueue());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof SpecialLeaveApiError
          ? cause.message
          : "Antrean validasi Human Capital tidak dapat dimuat.",
      );
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const user = useMemo(
    () => ({
      name: queue?.actor.fullName ?? "Human Capital",
      initials: initials(queue?.actor.fullName ?? "HC"),
      position: queue?.actor.positionName ?? "Human Capital",
      unit: queue?.actor.unitName ?? "Yayasan Sabilul Qur'an",
      additionalRole: "Human Capital",
    }),
    [queue],
  );

  const decide = async (taskId: string, action: "validate" | "request_correction") => {
    const note = notes[taskId]?.trim() || null;
    if (action === "request_correction" && !note) {
      setError("Tuliskan dengan jelas apa yang perlu dilengkapi oleh pegawai.");
      return;
    }
    setBusyTask(taskId);
    setError(null);
    try {
      await decideHcLeaveValidation(taskId, { action, note });
      setNotes((current) => ({ ...current, [taskId]: "" }));
      await load();
    } catch (cause) {
      setError(
        cause instanceof SpecialLeaveApiError
          ? cause.message
          : "Hasil validasi tidak dapat disimpan.",
      );
    } finally {
      setBusyTask(null);
    }
  };

  return (
    <AppShell user={user} activeItem="Validasi Cuti">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Human Capital</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-brand-heading">Validasi administrasi cuti</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Periksa dokumen dan periode, lalu pilih satu hasil. Satu kartu dapat diselesaikan tanpa berpindah halaman.
          </p>
        </div>
        <a
          href="/app/leave"
          className="inline-flex h-10 items-center rounded-xl border border-border bg-white px-4 text-sm font-semibold"
        >
          Cuti & Izin
        </a>
      </section>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="mt-5 rounded-3xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-brand-primary-deep" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-brand-heading">Perlu diperiksa</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Kerjakan dari yang paling atas.</p>
            </div>
          </div>
          <span className="rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-bold text-brand-primary-deep">
            {queue?.items.length ?? 0}
          </span>
        </div>

        <div className="divide-y divide-border/70">
          {!queue ? (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat antrean...
            </div>
          ) : queue.items.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-brand-primary-deep" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-brand-heading">Semua sudah diperiksa</p>
              <p className="mt-1 text-xs text-muted-foreground">Tidak ada validasi cuti yang menunggu.</p>
            </div>
          ) : (
            queue.items.map((item, index) => (
              <article key={item.taskId} className="px-5 py-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
                    #{index + 1}
                  </span>
                  <span className="rounded-full bg-brand-primary-pale px-3 py-1 text-[10px] font-bold text-brand-primary-deep">
                    {item.policyName}
                  </span>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
                  <div>
                    <p className="text-sm font-bold text-brand-heading">{item.requesterName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.employeeNumber} · {item.unitName ?? "Tanpa unit"} · {item.positionName ?? "Tanpa jabatan"}
                    </p>

                    <div className="mt-4 rounded-2xl bg-surface p-4">
                      <p className="text-xs text-muted-foreground">Periode</p>
                      <p className="mt-1 text-sm font-bold text-brand-heading">
                        {formatDate(item.startOn)} – {formatDate(item.endOn)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.workingDays} hari kerja</p>
                    </div>

                    {item.reason ? (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-muted-foreground">Keterangan pegawai</p>
                        <p className="mt-1 text-sm leading-6 text-brand-heading">{item.reason}</p>
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-muted-foreground">Dokumen pendukung</p>
                        <span className={`text-[10px] font-bold ${item.evidence.length ? "text-brand-primary-deep" : "text-amber-800"}`}>
                          {item.evidence.length ? `${item.evidence.length} tersedia` : "Belum tersedia"}
                        </span>
                      </div>
                      {item.evidence.length === 0 ? (
                        <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                          Belum ada dokumen. Jika jenis cuti ini mewajibkan bukti, minta pegawai melengkapinya.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.evidence.map((evidence) => (
                            <a
                              key={evidence.id}
                              href={hcEvidenceDownloadHref(item.requestId, evidence.id)}
                              className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold"
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText className="h-4 w-4" aria-hidden="true" />
                              {evidence.fileName}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-surface p-4">
                    <p className="text-sm font-bold text-brand-heading">Apa hasil pemeriksaannya?</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Jika administrasi belum lengkap, tulis instruksi yang dapat langsung ditindaklanjuti pegawai.
                    </p>

                    <label className="mt-4 block text-xs font-semibold text-muted-foreground">
                      Catatan untuk pegawai
                      <textarea
                        rows={4}
                        value={notes[item.taskId] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [item.taskId]: event.target.value,
                          }))
                        }
                        placeholder="Contoh: mohon unggah surat dokter yang mencakup tanggal 3–4 September."
                        className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-brand-primary"
                      />
                    </label>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <button
                        type="button"
                        disabled={busyTask === item.taskId}
                        onClick={() => void decide(item.taskId, "validate")}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {busyTask === item.taskId ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        )}
                        Administrasi sesuai
                      </button>
                      <button
                        type="button"
                        disabled={busyTask === item.taskId}
                        onClick={() => void decide(item.taskId, "request_correction")}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-bold text-amber-950 disabled:opacity-50"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Minta dilengkapi
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
