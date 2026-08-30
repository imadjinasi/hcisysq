import { Link2, RefreshCw, Sparkles, UserCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createAdmsMapping,
  listAdmsDevices,
  type AdmsDevice,
} from "@/lib/attendance";

type MappingCandidate = {
  id: string;
  employeeNumber: string;
  fullName: string;
  unitName: string | null;
  positionName: string | null;
  similarity: number;
  matchKind: "exact_name" | "close_name" | "possible_name";
};

type MappingAssistantItem = {
  pin: string;
  eventCount: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  rosterDisplayName: string | null;
  cardNumber: string | null;
  privilege: string | null;
  verifyMode: string | null;
  rosterObservedAt: string | null;
  rosterSourceRequestId: string | null;
  requiresUserInfo: boolean;
  candidates: MappingCandidate[];
};

type MappingAssistantResponse = {
  inventorySemantics: "observed_union";
  completeSnapshot: false;
  autoMapping: false;
  scoring: {
    basis: "name_only";
    candidateLimit: number;
    minimumSimilarity: number;
    note: string;
  };
  note: string;
  items: MappingAssistantItem[];
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as T | { message?: string } | null;
  if (response.ok) return body as T;
  throw new Error((body as { message?: string } | null)?.message ?? "Mapping assistant tidak dapat dimuat.");
}

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function matchLabel(candidate: MappingCandidate) {
  if (candidate.matchKind === "exact_name") return "Nama sama";
  if (candidate.matchKind === "close_name") return "Sangat mirip";
  return "Mirip";
}

export function AdminAdmsMappingAssistant() {
  const [devices, setDevices] = useState<AdmsDevice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<MappingAssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mappingKey, setMappingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    const result = await listAdmsDevices();
    setDevices(result.items);
    setSelectedId((current) =>
      current && result.items.some((item) => item.id === current)
        ? current
        : result.items[0]?.id ?? "",
    );
  }, []);

  const loadAssistant = useCallback(async (deviceId: string) => {
    if (!deviceId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const result = await readJson<MappingAssistantResponse>(
        await fetch(`/api/admin/attendance/adms/devices/${deviceId}/mapping-assistant`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
      );
      setData(result);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mapping assistant tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Registry mesin tidak dapat dimuat.");
    });
  }, [loadDevices]);

  useEffect(() => {
    void loadAssistant(selectedId);
  }, [loadAssistant, selectedId]);

  const selected = useMemo(
    () => devices.find((item) => item.id === selectedId) ?? null,
    [devices, selectedId],
  );

  const exactCount = useMemo(
    () => data?.items.filter((item) => item.candidates[0]?.matchKind === "exact_name").length ?? 0,
    [data],
  );
  const needsUserInfoCount = useMemo(
    () => data?.items.filter((item) => item.requiresUserInfo).length ?? 0,
    [data],
  );

  const mapCandidate = useCallback(async (item: MappingAssistantItem, candidate: MappingCandidate) => {
    if (!selectedId) return;
    const confirmed = window.confirm(
      `Map PIN ${item.pin} (${item.rosterDisplayName ?? "nama mesin belum tersedia"}) ke ${candidate.fullName} (${candidate.employeeNumber})?\n\nKemiripan nama hanya alat bantu review. Mapping ini menjadi keputusan eksplisit Admin.`,
    );
    if (!confirmed) return;

    const key = `${item.pin}:${candidate.id}`;
    setMappingKey(key);
    setSuccess(null);
    try {
      await createAdmsMapping(selectedId, { pin: item.pin, employeeId: candidate.id });
      setSuccess(`PIN ${item.pin} berhasil dimapping ke ${candidate.fullName}.`);
      await Promise.all([loadAssistant(selectedId), loadDevices()]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mapping tidak dapat disimpan.");
    } finally {
      setMappingKey(null);
    }
  }, [loadAssistant, loadDevices, selectedId]);

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-brand-heading">
            <Sparkles className="h-4 w-4" /> Mapping Assistant · Mesin ↔ HCIS
          </div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">
            Menyandingkan PIN/nama yang benar-benar teramati di mesin dengan kandidat pegawai aktif HCIS. Ranking hanya memakai kemiripan nama; PIN, card, NIP/nomor pegawai, unit, dan identifier lain tidak dipakai untuk menebak identitas. Tidak ada auto-map.
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedId || loading}
          onClick={() => void loadAssistant(selectedId)}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> {loading ? "Memuat…" : "Segarkan"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-72 text-xs font-semibold text-muted-foreground">
          Mesin
          <select
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setSuccess(null);
            }}
            className="mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-brand-heading"
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.displayName || device.serialNumber} · {device.serialNumber}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <div className="pb-2 text-xs text-muted-foreground">
            {data?.items.length ?? 0} PIN belum termap · {exactCount} kandidat nama sama · {needsUserInfoCount} belum punya USERINFO
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}
      {success ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</div>
      ) : null}

      <p className="mt-4 text-[11px] leading-4 text-muted-foreground">
        {data?.note ?? "Memuat fakta PIN dan safe roster…"}
      </p>

      <div className="mt-3 space-y-3">
        {(data?.items ?? []).map((item) => (
          <article key={item.pin} className="rounded-xl border border-border/70 p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-surface px-2 py-1 font-mono text-xs font-bold text-brand-heading">PIN {item.pin}</span>
                  {item.rosterDisplayName ? (
                    <span className="text-xs text-emerald-700">USERINFO tersedia</span>
                  ) : (
                    <span className="text-xs text-amber-700">Perlu USERINFO</span>
                  )}
                </div>
                <div className="mt-3 text-sm font-bold text-brand-heading">
                  {item.rosterDisplayName ?? "Nama mesin belum dibaca"}
                </div>
                <dl className="mt-2 grid grid-cols-[90px_1fr] gap-x-2 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Card</dt>
                  <dd className="font-mono text-brand-heading">{item.cardNumber ?? "—"}</dd>
                  <dt className="text-muted-foreground">Raw punch</dt>
                  <dd className="text-brand-heading">{item.eventCount}</dd>
                  <dt className="text-muted-foreground">Punch terakhir</dt>
                  <dd className="text-brand-heading">{fmt(item.lastEventAt)}</dd>
                  <dt className="text-muted-foreground">USERINFO</dt>
                  <dd className="text-brand-heading">{fmt(item.rosterObservedAt)}</dd>
                </dl>
              </div>

              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-brand-heading">
                  <UserCheck className="h-3.5 w-3.5" /> Kandidat pegawai HCIS
                </div>
                {item.requiresUserInfo ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Belum ada nama dari mesin, jadi HCIS sengaja tidak membuat kandidat dari PIN/card/NIP. Baca USERINFO untuk PIN ini lewat panel Single-PIN USERINFO Canary, lalu segarkan Mapping Assistant.
                  </div>
                ) : item.candidates.length === 0 ? (
                  <div className="mt-2 rounded-lg border border-border bg-surface p-3 text-xs leading-5 text-muted-foreground">
                    Tidak ada kandidat nama yang melewati ambang kemiripan. Gunakan mapping manual di panel registry jika Admin sudah mengetahui identitas yang benar.
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {item.candidates.map((candidate) => {
                      const key = `${item.pin}:${candidate.id}`;
                      return (
                        <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-brand-heading">{candidate.fullName}</span>
                              <span className={candidate.matchKind === "exact_name" ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" : "rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"}>
                                {matchLabel(candidate)} · {candidate.similarity}/100
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {candidate.employeeNumber}
                              {candidate.unitName ? ` · ${candidate.unitName}` : ""}
                              {candidate.positionName ? ` · ${candidate.positionName}` : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={mappingKey !== null}
                            onClick={() => void mapCandidate(item, candidate)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-primary px-3 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            {mappingKey === key ? "Mapping…" : "Map"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}

        {!loading && (data?.items.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Tidak ada PIN teramati yang belum memiliki mapping aktif pada mesin ini.
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-border/70 bg-surface p-3 text-[11px] leading-4 text-muted-foreground">
        <strong className="text-brand-heading">Boundary:</strong> similarity bukan confidence/probability. Tombol Map memanggil mapping eksplisit yang sudah audited; tidak ada bulk auto-map dan tidak ada inferensi identitas dari nomor pegawai, PIN, card, atau unit.
      </div>
    </section>
  );
}
