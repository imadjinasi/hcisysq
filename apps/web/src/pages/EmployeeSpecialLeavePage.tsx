import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/layouts/AppShell";
import {
  getSpecialLeaveSummary,
  previewSpecialLeave,
  SpecialLeaveApiError,
  submitSpecialLeave,
  type SpecialLeaveEvidenceInput,
  type SpecialLeavePreview,
  type SpecialLeaveSummary,
  type SupportedSpecialLeaveKey,
  uploadSpecialLeaveEvidence,
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

function statusLabel(status: string, hcTaskStatus: string | null) {
  if (hcTaskStatus === "needs_correction") return "Perlu dilengkapi";
  if (hcTaskStatus === "pending") return "Validasi HC";
  if (hcTaskStatus === "validated") return "Tervalidasi";
  if (status === "approved") return "Selesai";
  if (status === "rejected") return "Ditolak";
  if (status === "cancelled") return "Dibatalkan";
  return "Diproses";
}

async function fileToEvidence(file: File): Promise<SpecialLeaveEvidenceInput> {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
    throw new Error("Gunakan PDF, JPG, atau PNG.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Ukuran file maksimal 2 MB.");
  }
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("File tidak dapat dibaca."));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
  return {
    fileName: file.name,
    contentType: file.type as SpecialLeaveEvidenceInput["contentType"],
    contentBase64,
  };
}

export function EmployeeSpecialLeavePage() {
  const [summary, setSummary] = useState<SpecialLeaveSummary | null>(null);
  const [policyKey, setPolicyKey] = useState<SupportedSpecialLeaveKey>("sick");
  const [startOn, setStartOn] = useState("");
  const [endOn, setEndOn] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SpecialLeavePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [correctionFile, setCorrectionFile] = useState<File | null>(null);
  const [correctionRequestId, setCorrectionRequestId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setSummary(await getSpecialLeaveSummary());
    } catch (cause) {
      setError(
        cause instanceof SpecialLeaveApiError
          ? cause.message
          : "Data Cuti Khusus tidak dapat dimuat.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedPolicy = summary?.policies.find((policy) => policy.key === policyKey) ?? null;
  const user = useMemo(() => {
    const employee = summary?.employee;
    return {
      name: employee?.fullName ?? "Pegawai",
      initials: initials(employee?.fullName ?? "P"),
      position: employee?.positionName ?? "Pegawai",
      unit: employee?.unitName ?? "Yayasan Sabilul Qur'an",
      ...(summary?.hasHumanCapitalRole ? { additionalRole: "Human Capital" } : {}),
    };
  }, [summary]);

  const handlePreview = async () => {
    setError(null);
    setSuccess(null);
    setPreview(null);
    if (!startOn || !endOn) {
      setError("Pilih tanggal mulai dan selesai.");
      return;
    }
    setBusy(true);
    try {
      setPreview(
        await previewSpecialLeave({
          policyKey,
          startOn,
          endOn,
          hasEvidence: file !== null,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof SpecialLeaveApiError
          ? cause.message
          : "Preview Cuti Khusus tidak dapat dihitung.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const evidence = file ? await fileToEvidence(file) : null;
      const result = await submitSpecialLeave({
        policyKey,
        startOn,
        endOn,
        reason: reason || null,
        idempotencyKey: crypto.randomUUID(),
        evidence,
      });
      setSuccess(
        result.hcHandling === "validate"
          ? "Pengajuan tercatat. Atasan diberi notifikasi dan Human Capital akan memvalidasi administrasinya."
          : "Pemberitahuan cuti tercatat dan pihak terkait telah masuk antrean notifikasi.",
      );
      setStartOn("");
      setEndOn("");
      setReason("");
      setFile(null);
      setPreview(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof SpecialLeaveApiError || cause instanceof Error
          ? cause.message
          : "Pengajuan Cuti Khusus tidak dapat dikirim.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCorrectionUpload = async () => {
    if (!correctionRequestId || !correctionFile) return;
    setBusy(true);
    setError(null);
    try {
      await uploadSpecialLeaveEvidence(
        correctionRequestId,
        await fileToEvidence(correctionFile),
      );
      setSuccess("Dokumen tambahan berhasil dikirim kembali ke antrean validasi Human Capital.");
      setCorrectionFile(null);
      setCorrectionRequestId(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof SpecialLeaveApiError || cause instanceof Error
          ? cause.message
          : "Dokumen tidak dapat diunggah.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell user={user} activeItem="Cuti Khusus">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Cuti & izin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-brand-heading">Cuti Khusus</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Untuk kondisi medis, kedaruratan keluarga, dan hak khusus. Human Capital bertindak sebagai validator administrasi, bukan approver discretionary.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/app/leave" className="inline-flex h-10 items-center rounded-xl border border-border bg-white px-4 text-sm font-semibold">
            Cuti Tahunan
          </a>
          {summary?.hasHumanCapitalRole ? (
            <a href="/app/hc/leave" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Validasi HC
            </a>
          ) : null}
        </div>
      </section>

      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div> : null}

      <section className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-3xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary-pale text-brand-primary-deep"><Stethoscope className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h2 className="text-base font-bold text-brand-heading">Jenis Cuti Khusus</h2>
              <p className="text-xs text-muted-foreground">Pilih sesuai kondisi sebenarnya.</p>
            </div>
          </div>
          {loading ? <p className="mt-5 text-sm text-muted-foreground">Memuat kebijakan...</p> : (
            <div className="mt-4 space-y-2">
              {(summary?.policies ?? []).map((policy) => (
                <button
                  type="button"
                  key={policy.key}
                  onClick={() => { setPolicyKey(policy.key); setPreview(null); }}
                  className={`w-full rounded-2xl border p-3 text-left ${policy.key === policyKey ? "border-brand-primary bg-brand-primary-pale/50" : "border-border/70 bg-white"}`}
                >
                  <p className="text-sm font-semibold text-brand-heading">{policy.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {policy.hcHandling === "validate" ? "HC Validator" : "HC notified"}
                    {policy.emergencyNoticeAllowed ? " · dapat diberitahukan sesegera mungkin" : policy.minimumNoticeDays ? ` · H-${policy.minimumNoticeDays}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-3xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
          <h2 className="text-base font-bold text-brand-heading">Buat pemberitahuan / pengajuan</h2>
          {selectedPolicy ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {selectedPolicy.evidenceRequirement === "required"
                ? "Dokumen pendukung wajib saat dikirim."
                : selectedPolicy.evidenceRequirement === "required_deferred_allowed"
                  ? "Pada kondisi darurat, dokumen boleh dilengkapi setelah pemberitahuan awal."
                  : "Dokumen tidak wajib pada pengajuan awal kecuali diminta sesuai kebijakan."}
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Mulai<input type="date" value={startOn} onChange={(event) => { setStartOn(event.target.value); setPreview(null); }} className="mt-2 h-11 w-full rounded-xl border border-border px-3 font-normal" /></label>
            <label className="text-sm font-semibold">Selesai<input type="date" value={endOn} onChange={(event) => { setEndOn(event.target.value); setPreview(null); }} className="mt-2 h-11 w-full rounded-xl border border-border px-3 font-normal" /></label>
          </div>
          <label className="mt-4 block text-sm font-semibold">Keterangan<textarea rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-xl border border-border px-3 py-2.5 font-normal" /></label>
          <label className="mt-4 block text-sm font-semibold">
            Dokumen pendukung <span className="font-normal text-muted-foreground">PDF/JPG/PNG, maks. 2 MB</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} className="mt-2 block w-full text-sm font-normal" />
          </label>
          <button type="button" disabled={busy} onClick={() => void handlePreview()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />} Cek alur
          </button>

          {preview ? (
            <div className="mt-5 rounded-2xl border border-brand-primary/20 bg-brand-primary-pale/40 p-4">
              <p className="text-sm font-bold text-brand-heading">{preview.workingDays} hari kerja</p>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {preview.flow.map((step) => <p key={step}>• {step}</p>)}
              </div>
              {preview.warnings.length ? (
                <div className="mt-3 space-y-2">
                  {preview.warnings.map((warning) => (
                    <div key={warning.code} className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{warning.message}</div>
                  ))}
                </div>
              ) : null}
              <button type="button" disabled={busy} onClick={() => void handleSubmit()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-primary px-5 text-sm font-bold text-white disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />} Kirim
              </button>
            </div>
          ) : null}
        </article>
      </section>

      <section className="mt-5 overflow-hidden rounded-3xl border border-border/70 bg-white shadow-[var(--shadow-soft)]">
        <div className="border-b border-border/70 px-5 py-4"><h2 className="text-base font-bold text-brand-heading">Riwayat Cuti Khusus</h2></div>
        <div className="divide-y divide-border/70">
          {(summary?.requests ?? []).length === 0 ? <p className="px-5 py-8 text-sm text-muted-foreground">Belum ada pengajuan.</p> : summary?.requests.map((item) => (
            <div key={item.id} className="px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-brand-heading">{item.policyName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.startOn)} – {formatDate(item.endOn)} · {item.workingDays} hari kerja · {item.evidenceCount} dokumen</p>
                </div>
                <span className="w-fit rounded-full bg-surface px-3 py-1 text-xs font-semibold">{statusLabel(item.status, item.hcTaskStatus)}</span>
              </div>
              {item.hcTaskStatus === "needs_correction" ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-950">Perlu dilengkapi</p>
                  <p className="mt-1 text-xs text-amber-900">{item.hcTaskNote ?? "Human Capital meminta dokumen pendukung tambahan."}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => { setCorrectionRequestId(item.id); setCorrectionFile(event.target.files?.[0] ?? null); }} className="text-xs" />
                    <button type="button" disabled={busy || correctionRequestId !== item.id || !correctionFile} onClick={() => void handleCorrectionUpload()} className="h-9 rounded-xl bg-amber-900 px-3 text-xs font-bold text-white disabled:opacity-40">Kirim dokumen</button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
