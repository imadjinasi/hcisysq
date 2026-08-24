import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Eye,
  GitBranchPlus,
  LoaderCircle,
  Network,
  PanelRightClose,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import {
  OrganizationChart,
  type OrganizationSelection,
} from "@/components/organization/OrganizationChart";
import { AdminShell } from "@/layouts/AdminShell";
import { AdminApiError } from "@/lib/adminEmployees";
import {
  createOrganizationAuthorityBinding,
  createOrganizationDraft,
  createOrganizationNode,
  createOrganizationPosition,
  deleteOrganizationNode,
  discardOrganizationDraft,
  getOrganizationDesignerView,
  getOrganizationImpact,
  listFoundationBoardAccounts,
  listOrganizationEmployees,
  previewOrganizationResolution,
  publishOrganizationDraft,
  replaceOrganizationIncumbencies,
  replaceOrganizationMemberships,
  updateOrganizationNode,
  updateOrganizationPosition,
  validateOrganizationDraft,
  type OrganizationDesignerView,
  type OrganizationAccountOption,
  type OrganizationEmployeeOption,
  type OrganizationImpactPreview,
  type OrganizationNode,
  type OrganizationPosition,
  type OrganizationResolutionPreview,
  type OrganizationValidationReport,
  type OrganizationVacancyPolicy,
} from "@/lib/organizationDesigner";
import { cn } from "@/lib/utils";
import { organizationNodeTypeLabel } from "@/lib/organizationCanvas";
import {
  activeOrganizationEmployees,
  filterOrganizationEmployees,
  organizationEmployeeUnits,
} from "@/lib/organizationMemberPicker";
import { selectableOrganizationParents } from "@/lib/organizationTree";

type EditorAction =
  | { type: "draft" }
  | { type: "node"; mode: "root" | "child" | "sibling" | "edit" | "move"; node?: OrganizationNode }
  | { type: "position"; mode: "create" | "edit" | "move"; nodeKey: string; parentPositionKey?: string | null; position?: OrganizationPosition }
  | { type: "incumbency"; position: OrganizationPosition; acting: boolean }
  | { type: "members"; node: OrganizationNode }
  | { type: "visual"; item: OrganizationNode | OrganizationPosition; kind: "node" | "position" }
  | { type: "authority"; item: OrganizationNode | OrganizationPosition; kind: "node" | "position" }
  | { type: "delete-node"; node: OrganizationNode }
  | { type: "discard-draft" };

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function initialDesignerState() {
  const params = new URLSearchParams(window.location.search);
  return {
    effectiveDate: params.get("effectiveDate") ?? jakartaToday(),
    draftId: params.get("draftId"),
  };
}

function updateDesignerUrl(effectiveDate: string, draftId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.set("effectiveDate", effectiveDate);
  if (draftId) url.searchParams.set("draftId", draftId);
  else url.searchParams.delete("draftId");
  window.history.replaceState(null, "", url);
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof AdminApiError ? cause.message : fallback;
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-heading/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="organization-dialog-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border/70 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 id="organization-dialog-title" className="text-lg font-bold text-brand-heading">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          <button type="button" aria-label="Tutup dialog" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-brand-heading">{label}</span>
      {hint ? <span className="ml-1 text-[11px] text-muted-foreground">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10";

function SubmitRow({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-border/70 pt-4">
      <button type="button" onClick={onCancel} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">Batal</button>
      <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white hover:bg-brand-primary-deep disabled:opacity-60">
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {saving ? "Menyimpan..." : label}
      </button>
    </div>
  );
}

function statusCopy(mode: OrganizationDesignerView["mode"]) {
  if (mode === "HISTORICAL") return { label: "Historis", className: "bg-slate-100 text-slate-700" };
  if (mode === "FUTURE") return { label: "Terjadwal", className: "bg-blue-50 text-blue-800" };
  if (mode === "DRAFT") return { label: "Draft", className: "bg-amber-100 text-amber-900" };
  return { label: "Saat ini", className: "bg-emerald-50 text-emerald-800" };
}

function ImpactCard({ label, count, tone = "default" }: { label: string; count: number; tone?: "default" | "warning" | "visual" }) {
  return (
    <div className={cn("rounded-xl border px-3 py-3", tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "visual" ? "border-blue-200 bg-blue-50" : "border-border/70 bg-surface")}>
      <p className="text-xl font-bold text-brand-heading">{count}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{label}</p>
    </div>
  );
}

function subtreeDeletionImpact(data: OrganizationDesignerView, selected: OrganizationNode) {
  const nodeKeys = new Set([selected.stableKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of data.nodes) {
      if (node.parentNodeKey && nodeKeys.has(node.parentNodeKey) && !nodeKeys.has(node.stableKey)) {
        nodeKeys.add(node.stableKey);
        changed = true;
      }
    }
  }
  const positionKeys = new Set(
    data.positions.filter((item) => nodeKeys.has(item.nodeKey)).map((item) => item.stableKey),
  );
  return {
    childGroups: nodeKeys.size - 1,
    positions: positionKeys.size,
    memberships: data.memberships.filter((item) => nodeKeys.has(item.nodeKey)).length,
    incumbencies: data.assignments.filter((item) => item.positionKey && positionKeys.has(item.positionKey)).length,
    authorityBindings: data.bindings.filter((item) =>
      positionKeys.has(item.targetPositionKey)
      || (item.sourceType === "NODE" ? nodeKeys.has(item.sourceKey) : positionKeys.has(item.sourceKey))).length,
    reportingOverrides: data.reportingOverrides.filter((item) => positionKeys.has(item.managerPositionKey)).length,
  };
}

function MembershipEditor({
  node,
  employees,
  memberships,
  saving,
  onCancel,
  onSubmit,
}: {
  node: OrganizationNode;
  employees: OrganizationEmployeeOption[];
  memberships: OrganizationDesignerView["memberships"];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [selected, setSelected] = useState(
    () => new Set(memberships.filter((item) => item.nodeKey === node.stableKey).map((item) => item.employeeId)),
  );
  const [legacyUnit, setLegacyUnit] = useState("");
  const [manualUnit, setManualUnit] = useState("");
  const [search, setSearch] = useState("");
  const activeEmployees = useMemo(() => activeOrganizationEmployees(employees), [employees]);
  const legacyUnits = useMemo(() => organizationEmployeeUnits(employees), [employees]);
  const legacyCandidates = useMemo(
    () => legacyUnit ? activeEmployees.filter((employee) => employee.unitName === legacyUnit) : [],
    [activeEmployees, legacyUnit],
  );
  const filteredEmployees = useMemo(
    () => filterOrganizationEmployees(employees, { search, unit: manualUnit }),
    [employees, manualUnit, search],
  );
  const filtersApplied = Boolean(search.trim() || manualUnit);

  const toggle = (employeeId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(employeeId);
      else next.delete(employeeId);
      return next;
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-xs font-bold text-blue-950">Tambahkan anggota dari unit lama</h3>
        <p className="mt-1 text-[11px] leading-4 text-blue-900">
          Bantuan migrasi ini hanya menyalin keanggotaan. Posisi, leader, hierarchy, dan kewenangan tidak dibuat otomatis.
        </p>
        <select
          aria-label="Pilih unit organisasi lama"
          value={legacyUnit}
          onChange={(event) => setLegacyUnit(event.target.value)}
          className={`${inputClass} mt-3`}
        >
          <option value="">Pilih unit lama untuk preview...</option>
          {legacyUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        {legacyUnit ? (
          <div className="mt-3 rounded-lg bg-white/80 p-3">
            <p className="text-xs font-bold text-brand-heading">Preview: {legacyCandidates.length} pegawai aktif</p>
            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
              {legacyCandidates.map((employee) => employee.fullName).join(", ") || "Tidak ada pegawai aktif pada unit ini."}
            </p>
            <button
              type="button"
              disabled={legacyCandidates.length === 0}
              onClick={() => setSelected((current) => new Set([...current, ...legacyCandidates.map((employee) => employee.id)]))}
              className="mt-3 h-9 rounded-lg border border-blue-300 bg-white px-3 text-xs font-bold text-blue-950 disabled:opacity-50"
            >
              Tambahkan {legacyCandidates.length} anggota dari unit lama
            </button>
          </div>
        ) : null}
      </section>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs font-bold text-brand-heading">Anggota terpilih: {selected.size}</p>
        <button type="button" onClick={() => setSelected(new Set())} className="text-[11px] font-semibold text-muted-foreground hover:text-brand-heading">Kosongkan pilihan</button>
      </div>
      <section className="mt-3 rounded-xl border border-border bg-surface/60 p-3" aria-label="Filter pegawai aktif">
        <p className="text-xs font-bold text-brand-heading">Cari pegawai aktif</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Pilih unit atau masukkan nama/nomor pegawai, lalu tinjau hasil sebelum memilih.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            type="search"
            aria-label="Cari nama atau nomor pegawai"
            placeholder="Nama atau nomor pegawai"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
          />
          <select aria-label="Filter unit pegawai" value={manualUnit} onChange={(event) => setManualUnit(event.target.value)} className={inputClass}>
            <option value="">Semua unit</option>
            {legacyUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </div>
      </section>
      {[...selected].map((employeeId) => <input key={employeeId} type="hidden" name="employeeIds" value={employeeId} />)}
      <div className="mt-2 max-h-[18rem] space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border p-2" aria-live="polite">
        {filteredEmployees.map((employee) => (
          <label key={employee.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted">
            <input
              type="checkbox"
              checked={selected.has(employee.id)}
              onChange={(event) => toggle(employee.id, event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-brand-primary)]"
            />
            <span>
              <span className="block text-sm font-semibold text-brand-heading">{employee.fullName}</span>
              <span className="text-[11px] text-muted-foreground">{employee.employeeNumber} · {employee.unitName ?? "Tanpa unit"}</span>
            </span>
          </label>
        ))}
        {activeEmployees.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">Daftar pegawai aktif belum tersedia.</p> : null}
        {activeEmployees.length > 0 && !filtersApplied ? <p className="p-4 text-center text-sm text-muted-foreground">Gunakan pencarian atau filter unit untuk menampilkan pegawai.</p> : null}
        {filtersApplied && filteredEmployees.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">Tidak ada pegawai aktif yang cocok.</p> : null}
      </div>
      <SubmitRow saving={saving} onCancel={onCancel} label="Simpan anggota" />
    </form>
  );
}

export function HolderAssignmentEditor({
  position,
  acting,
  employees,
  accounts,
  effectiveOn,
  saving,
  onCancel,
  onSubmit,
}: {
  position: OrganizationPosition;
  acting: boolean;
  employees: OrganizationEmployeeOption[];
  accounts: OrganizationAccountOption[];
  effectiveOn: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [holderSource, setHolderSource] = useState<"EMPLOYEE" | "ACCOUNT">(
    acting ? "EMPLOYEE" : position.holderSource ?? "EMPLOYEE",
  );

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-holder-source={holderSource}>
      <div className="rounded-xl bg-surface p-3 text-sm font-bold text-brand-heading">
        {position.title}
      </div>
      {!acting ? (
        <Field label="Sumber pemegang posisi" hint="identitas struktur, bukan pemberian izin">
          <select
            name="holderSource"
            value={holderSource}
            onChange={(event) => setHolderSource(event.target.value as "EMPLOYEE" | "ACCOUNT")}
            className={inputClass}
          >
            <option value="EMPLOYEE">Pegawai (EMPLOYEE)</option>
            <option value="ACCOUNT">Account Organ Yayasan (ACCOUNT)</option>
          </select>
        </Field>
      ) : <input type="hidden" name="holderSource" value="EMPLOYEE" />}

      {holderSource === "ACCOUNT" ? (
        <>
          <Field label="Account Organ Yayasan" hint="account FOUNDATION_BOARD yang sudah ada">
            <select
              name="accountId"
              required
              defaultValue={position.primaryIncumbent?.accountId ?? ""}
              className={inputClass}
            >
              <option value="">Pilih account berdasarkan email...</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.email} — {account.principalType} · {account.status}
                </option>
              ))}
            </select>
          </Field>
          {accounts.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-900">
              Belum ada account FOUNDATION_BOARD yang dapat dipilih. Account tidak dibuat atau diaktifkan otomatis.
            </p>
          ) : null}
          <a href="/admin/access" className="inline-flex text-xs font-bold text-brand-primary-deep hover:underline">
            Kelola Account Organ Yayasan
          </a>
        </>
      ) : (
        <Field label={acting ? "Pegawai pelaksana tugas" : "Pegawai"}>
          <select
            name="employeeId"
            required
            defaultValue={acting
              ? position.actingIncumbent?.employeeId ?? ""
              : position.primaryIncumbent?.employeeId ?? ""}
            className={inputClass}
          >
            <option value="">Pilih pegawai...</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} — {employee.employeeNumber}
              </option>
            ))}
          </select>
        </Field>
      )}

      {!acting && holderSource === "EMPLOYEE" ? (
        <Field label="Jenis penugasan" hint="Jabatan utama menjadi jangkar reporting pemohon; rangkap tetap dapat membawa kewenangan.">
          <select name="assignmentType" defaultValue={position.primaryIncumbent?.isPrimaryStructural ? "PRIMARY_STRUCTURAL" : "SECONDARY"} className={inputClass}>
            <option value="PRIMARY_STRUCTURAL">Jabatan utama</option>
            <option value="SECONDARY">Rangkap jabatan</option>
          </select>
        </Field>
      ) : null}

      {acting ? (
        <>
          <Field label="Mulai acting"><input type="date" name="actingFrom" required defaultValue={position.actingIncumbent?.effectiveFrom ?? effectiveOn} className={inputClass} /></Field>
          <Field label="Berakhir acting"><input type="date" name="actingTo" required defaultValue={position.actingIncumbent?.effectiveTo ?? ""} className={inputClass} /></Field>
        </>
      ) : (
        <Field label="Mulai menjabat"><input type="date" name="effectiveFrom" required defaultValue={position.primaryIncumbent?.effectiveFrom ?? effectiveOn} className={inputClass} /></Field>
      )}
      <SubmitRow saving={saving} onCancel={onCancel} label="Simpan penetapan" />
    </form>
  );
}

export function AdminOrganizationPage() {
  const [initialState] = useState(initialDesignerState);
  const [effectiveDate, setEffectiveDate] = useState(initialState.effectiveDate);
  const [draftId, setDraftId] = useState<string | null>(initialState.draftId);
  const [data, setData] = useState<OrganizationDesignerView | null>(null);
  const [employees, setEmployees] = useState<OrganizationEmployeeOption[]>([]);
  const [boardAccounts, setBoardAccounts] = useState<OrganizationAccountOption[]>([]);
  const [selection, setSelection] = useState<OrganizationSelection>(null);
  const [action, setAction] = useState<EditorAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validation, setValidation] = useState<OrganizationValidationReport | null>(null);
  const [impact, setImpact] = useState<OrganizationImpactPreview | null>(null);
  const [preview, setPreview] = useState<OrganizationResolutionPreview | null>(null);
  const [previewEmployeeId, setPreviewEmployeeId] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOrganizationDesignerView({ effectiveDate, draftId }));
    } catch (cause) {
      setError(errorMessage(cause, "Struktur organisasi tidak dapat dimuat."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    updateDesignerUrl(effectiveDate, draftId);
    void reload();
  }, [effectiveDate, draftId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void listOrganizationEmployees().then(setEmployees).catch(() => setEmployees([])); }, []);
  useEffect(() => { void listFoundationBoardAccounts().then(setBoardAccounts).catch(() => setBoardAccounts([])); }, []);

  const selectedNode = useMemo(
    () => selection?.kind === "node" ? data?.nodes.find((node) => node.stableKey === selection.key) ?? null : null,
    [data?.nodes, selection],
  );
  const selectedPosition = useMemo(
    () => selection?.kind === "position" ? data?.positions.find((position) => position.stableKey === selection.key) ?? null : null,
    [data?.positions, selection],
  );
  const selectedPositionNode = useMemo(
    () => selectedPosition ? data?.nodes.find((node) => node.stableKey === selectedPosition.nodeKey) ?? null : null,
    [data?.nodes, selectedPosition],
  );
  const selectedParentNode = useMemo(
    () => selectedNode?.parentNodeKey ? data?.nodes.find((node) => node.stableKey === selectedNode.parentNodeKey) ?? null : null,
    [data?.nodes, selectedNode],
  );
  const selectedParentPosition = useMemo(
    () => selectedPosition?.parentPositionKey ? data?.positions.find((position) => position.stableKey === selectedPosition.parentPositionKey) ?? null : null,
    [data?.positions, selectedPosition],
  );
  const selectedBindings = useMemo(() => {
    const key = selectedNode?.stableKey ?? selectedPosition?.stableKey;
    return key ? data?.bindings.filter((binding) => binding.sourceKey === key) ?? [] : [];
  }, [data?.bindings, selectedNode, selectedPosition]);
  const selectedPath = useMemo(() => {
    const target = selectedNode ?? selectedPositionNode;
    if (!target || !data) return [];
    const byKey = new Map(data.nodes.map((node) => [node.stableKey, node]));
    const path: OrganizationNode[] = [];
    const seen = new Set<string>();
    let current: OrganizationNode | undefined = target;
    while (current && !seen.has(current.stableKey)) {
      path.unshift(current);
      seen.add(current.stableKey);
      current = current.parentNodeKey ? byKey.get(current.parentNodeKey) : undefined;
    }
    return path;
  }, [data, selectedNode, selectedPositionNode]);
  const canEdit = data?.draft?.status === "DRAFT";
  const hasActiveDraft = data?.draft?.status === "DRAFT" || data?.draft?.status === "VALIDATED";
  const status = statusCopy(data?.mode ?? "CURRENT");
  const pendingDeletionImpact = useMemo(
    () => action?.type === "delete-node" && data ? subtreeDeletionImpact(data, action.node) : null,
    [action, data],
  );

  const mutate = async (operation: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await operation();
      setAction(null);
      setValidation(null);
      setImpact(null);
      setNotice(success);
      await reload();
    } catch (cause) {
      setError(errorMessage(cause, "Perubahan struktur tidak dapat disimpan."));
    } finally {
      setSaving(false);
    }
  };

  const startFromEmpty = () => canEdit ? setAction({ type: "node", mode: "root" }) : setAction({ type: "draft" });

  const handleDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    void createOrganizationDraft({ name: String(form.get("name")), effectiveOn: String(form.get("effectiveOn")) })
      .then((draft) => {
        setDraftId(draft.id);
        setEffectiveDate(draft.effectiveOn);
        setAction(null);
        setNotice("Draft restrukturisasi siap diedit.");
      })
      .catch((cause: unknown) => setError(errorMessage(cause, "Draft tidak dapat dibuat.")))
      .finally(() => setSaving(false));
  };

  const handleNode = (event: FormEvent<HTMLFormElement>, editor: Extract<EditorAction, { type: "node" }>) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    if (editor.mode === "move" && editor.node) {
      void mutate(
        () => updateOrganizationNode(data.draft!.id, editor.node!.id, {
          parentNodeKey: String(form.get("parentNodeKey")) || null,
        }),
        "Kelompok dipindahkan ke induk struktural baru.",
      );
      return;
    }
    const input = {
      name: String(form.get("name")),
      nodeType: String(form.get("nodeType")),
      parentNodeKey: String(form.get("parentNodeKey")) || null,
      visualRankOffset: Number(form.get("visualRankOffset")),
      integrationCode: String(form.get("integrationCode")) || null,
    };
    void mutate(
      () => editor.mode === "edit" && editor.node ? updateOrganizationNode(data.draft!.id, editor.node.id, input) : createOrganizationNode(data.draft!.id, input),
      editor.mode === "edit" ? "Kelompok diperbarui." : "Kelompok ditambahkan ke chart.",
    );
  };

  const handlePosition = (event: FormEvent<HTMLFormElement>, editor: Extract<EditorAction, { type: "position" }>) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    if (editor.mode === "move" && editor.position) {
      void mutate(
        () => updateOrganizationPosition(data.draft!.id, editor.position!.id, {
          nodeKey: String(form.get("nodeKey")),
          parentPositionKey: String(form.get("parentPositionKey")) || null,
        }),
        "Posisi dipindahkan secara struktural.",
      );
      return;
    }
    const input = {
      nodeKey: String(form.get("nodeKey")),
      title: String(form.get("title")),
      parentPositionKey: String(form.get("parentPositionKey")) || null,
      vacancyPolicy: String(form.get("vacancyPolicy")) as OrganizationVacancyPolicy,
      singleIncumbent: true,
      visualRankOffset: Number(form.get("visualRankOffset")),
      holderSource: String(form.get("holderSource") || "EMPLOYEE") as "EMPLOYEE" | "ACCOUNT",
    };
    void mutate(
      () => editor.mode === "edit" && editor.position ? updateOrganizationPosition(data.draft!.id, editor.position.id, input) : createOrganizationPosition(data.draft!.id, input),
      editor.mode === "edit" ? "Posisi diperbarui." : "Posisi ditambahkan.",
    );
  };

  const handleIncumbency = (event: FormEvent<HTMLFormElement>, editor: Extract<EditorAction, { type: "incumbency" }>) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    const holderSource = String(form.get("holderSource") || editor.position.holderSource || "EMPLOYEE") as "EMPLOYEE" | "ACCOUNT";
    void mutate(
      () => replaceOrganizationIncumbencies(data.draft!.id, {
        positionKey: editor.position.stableKey,
        holderSource,
        primaryEmployeeId: holderSource === "ACCOUNT" ? null
          : editor.acting ? editor.position.primaryIncumbent?.employeeId ?? null : String(form.get("employeeId")) || null,
        primaryAccountId: holderSource === "ACCOUNT" ? String(form.get("accountId")) || null : null,
        actingEmployeeId: holderSource === "ACCOUNT" ? null
          : editor.acting ? String(form.get("employeeId")) || null : editor.position.actingIncumbent?.employeeId ?? null,
        actingFrom: holderSource === "ACCOUNT" ? null
          : editor.acting ? String(form.get("actingFrom")) : editor.position.actingIncumbent?.effectiveFrom ?? null,
        actingTo: holderSource === "ACCOUNT" ? null
          : editor.acting ? String(form.get("actingTo")) : editor.position.actingIncumbent?.effectiveTo ?? null,
        effectiveFrom: String(form.get("effectiveFrom") || data.draft!.effectiveOn),
        assignmentType: editor.acting ? undefined : String(form.get("assignmentType") || "SECONDARY") as "PRIMARY_STRUCTURAL" | "SECONDARY",
      }),
      editor.acting ? "Pelaksana tugas diperbarui." : "Pejabat utama diperbarui.",
    );
  };

  const markVacant = (position: OrganizationPosition) => {
    if (!data?.draft) return;
    void mutate(
      () => replaceOrganizationIncumbencies(data.draft!.id, {
        positionKey: position.stableKey,
        primaryEmployeeId: null,
        primaryAccountId: null,
        actingEmployeeId: position.actingIncumbent?.employeeId ?? null,
        actingFrom: position.actingIncumbent?.effectiveFrom ?? null,
        actingTo: position.actingIncumbent?.effectiveTo ?? null,
        effectiveFrom: data.draft!.effectiveOn,
      }),
      "Posisi ditandai vacant. Kebijakan vacancy tetap diproses oleh resolver server.",
    );
  };

  const clearActing = (position: OrganizationPosition) => {
    if (!data?.draft) return;
    void mutate(
      () => replaceOrganizationIncumbencies(data.draft!.id, {
        positionKey: position.stableKey,
        primaryEmployeeId: position.primaryIncumbent?.employeeId ?? null,
        actingEmployeeId: null,
        effectiveFrom: data.draft!.effectiveOn,
      }),
      "Penugasan pelaksana tugas dihapus.",
    );
  };

  const handleMembers = (event: FormEvent<HTMLFormElement>, editor: Extract<EditorAction, { type: "members" }>) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    void mutate(
      () => replaceOrganizationMemberships(data.draft!.id, { nodeKey: editor.node.stableKey, employeeIds: form.getAll("employeeIds").map(String), effectiveFrom: data.draft!.effectiveOn }),
      "Keanggotaan kelompok diperbarui.",
    );
  };

  const handleVisual = (event: FormEvent<HTMLFormElement>, editor: Extract<EditorAction, { type: "visual" }>) => {
    event.preventDefault();
    if (!data?.draft) return;
    const offset = Number(new FormData(event.currentTarget).get("visualRankOffset"));
    void mutate(
      () => editor.kind === "node" ? updateOrganizationNode(data.draft!.id, editor.item.id, { visualRankOffset: offset }) : updateOrganizationPosition(data.draft!.id, editor.item.id, { visualRankOffset: offset }),
      "Rank visual diperbarui tanpa mengubah hubungan struktural.",
    );
  };

  const handleAuthority = (event: FormEvent<HTMLFormElement>, editor: Extract<EditorAction, { type: "authority" }>) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    void mutate(
      () => createOrganizationAuthorityBinding(data.draft!.id, {
        sourceType: editor.kind === "node" ? "NODE" : "POSITION",
        sourceKey: editor.item.stableKey,
        authorityType: String(form.get("authorityType")) as "SUPERVISORY_PARENT" | "LEADER" | "UNIT_APPROVER" | "GOVERNANCE_APPROVER" | "OVERSIGHT_PARENT",
        targetPositionKey: String(form.get("targetPositionKey")),
        vacancyPolicy: String(form.get("vacancyPolicy")) as OrganizationVacancyPolicy,
        effectiveFrom: data.draft!.effectiveOn,
        effectiveTo: null,
      }),
      "Hubungan kewenangan disimpan.",
    );
  };

  const runValidation = async () => {
    if (!data?.draft) return;
    setSaving(true);
    setError(null);
    try {
      const report = await validateOrganizationDraft(data.draft.id);
      setValidation(report);
      setNotice(report.valid ? "Draft valid dan siap ditinjau dampaknya." : null);
      await reload();
    } catch (cause) {
      setError(errorMessage(cause, "Validasi draft gagal dijalankan."));
    } finally { setSaving(false); }
  };

  const runImpact = async () => {
    if (!data?.draft) return;
    setSaving(true);
    setError(null);
    try { setImpact(await getOrganizationImpact(data.draft.id)); }
    catch (cause) { setError(errorMessage(cause, "Preview dampak tidak dapat dimuat.")); }
    finally { setSaving(false); }
  };

  const runPublish = async () => {
    if (!data?.draft || !window.confirm(data.isSameDayRevision
      ? `Publikasikan revisi struktur untuk ${displayDate(data.draft.effectiveOn)}? Versi sebelumnya tetap tersimpan sebagai histori. Revisi ini menjadi versi aktif terbaru untuk tanggal tersebut.`
      : `Publikasikan struktur efektif ${displayDate(data.draft.effectiveOn)}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await publishOrganizationDraft(data.draft.id);
      setDraftId(null);
      setSelection(null);
      setValidation(null);
      setImpact(null);
      setNotice("Struktur dipublikasikan. Struktur masa depan tidak aktif sebelum tanggal efektifnya.");
    } catch (cause) { setError(errorMessage(cause, "Draft tidak dapat dipublikasikan.")); }
    finally { setSaving(false); }
  };

  const deleteNodeSubtree = (node: OrganizationNode) => {
    if (!data?.draft) return;
    void mutate(
      () => deleteOrganizationNode(data.draft!.id, node.id),
      "Kelompok dan seluruh subtree draft-nya dihapus. Histori terpublikasi tidak berubah.",
    ).then(() => setSelection(null));
  };

  const discardDraft = async () => {
    if (!data?.draft) return;
    setSaving(true); setError(null);
    try {
      await discardOrganizationDraft(data.draft.id);
      setAction(null); setDraftId(null); setSelection(null);
      setNotice("Draft yang belum dipublikasikan telah dibuang. Histori terpublikasi tetap utuh.");
    } catch (cause) { setError(errorMessage(cause, "Draft tidak dapat dibuang.")); }
    finally { setSaving(false); }
  };

  const runResolutionPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data?.draft || !previewEmployeeId) return;
    setPreviewLoading(true);
    setError(null);
    try { setPreview(await previewOrganizationResolution(data.draft.id, { employeeId: previewEmployeeId, workflowKey: "LEAVE", effectiveDate: data.draft.effectiveOn })); }
    catch (cause) { setError(errorMessage(cause, "Preview rantai approval tidak dapat dimuat.")); }
    finally { setPreviewLoading(false); }
  };

  return (
    <AdminShell active="organization" title="Organization Designer" description="Gambar struktur, posisi, dan kewenangan berdasarkan tanggal efektif. Hubungan approval tetap dihitung dan divalidasi oleh server.">
      {error ? <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}
      {notice ? <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div> : null}

      <section className={cn("overflow-hidden rounded-3xl border bg-white shadow-[var(--shadow-soft)]", canEdit ? "border-amber-300 ring-4 ring-amber-100/60" : "border-border/70")}>
        <div className={cn("flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-end lg:justify-between", canEdit ? "border-amber-200 bg-amber-50/60" : "border-border/70")}>
          <div className="flex flex-wrap items-center gap-3">
            <Field label="Lihat struktur pada tanggal"><span className="relative block"><CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="date" value={effectiveDate} onChange={(event) => { setDraftId(null); setEffectiveDate(event.target.value); setSelection(null); }} className={`${inputClass} w-48 pl-9`} /></span></Field>
            <span className={cn("mb-0.5 self-end rounded-full px-3 py-2 text-xs font-bold", status.className)}>{status.label}</span>
            {data?.draft ? <div className="mb-0.5 self-end"><p className="text-xs font-bold text-amber-900">{data.isSameDayRevision ? `Revisi struktur untuk ${displayDate(data.draft.effectiveOn)}` : data.draft.name}</p><p className="text-[11px] text-amber-800">Efektif {displayDate(data.draft.effectiveOn)} · {data.draft.status}</p></div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {!hasActiveDraft ? <button type="button" onClick={() => setAction({ type: "draft" })} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-xs font-bold hover:bg-muted"><CalendarClock className="h-4 w-4" /> Jadwalkan perubahan</button> : <>
              {canEdit ? <button type="button" disabled={saving} onClick={() => void runValidation()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-50 disabled:opacity-60"><ShieldCheck className="h-4 w-4" /> Validasi</button> : null}
              <button type="button" disabled={saving} onClick={() => void runImpact()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-xs font-bold hover:bg-muted disabled:opacity-60"><Eye className="h-4 w-4" /> Preview dampak</button>
              <button type="button" disabled={saving || data?.draft?.status !== "VALIDATED"} onClick={() => void runPublish()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-3 text-xs font-bold text-white hover:bg-brand-primary-deep disabled:opacity-50"><Rocket className="h-4 w-4" /> Publikasikan</button>
              <button type="button" disabled={saving} onClick={() => setAction({ type: "discard-draft" })} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300 bg-white px-3 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Buang draft</button>
            </>}
          </div>
        </div>

        {selectedPath.length > 0 ? (
          <nav aria-label="Jalur struktural terpilih" className="flex flex-wrap items-center gap-1 border-b border-border/70 bg-white px-5 py-2.5 text-[11px] text-muted-foreground">
            {selectedPath.map((node, index) => (
              <span key={node.stableKey} className="contents">
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                <button type="button" onClick={() => setSelection({ kind: "node", key: node.stableKey })} className="rounded-md px-1.5 py-1 font-semibold hover:bg-muted hover:text-brand-heading">{node.name}</button>
              </span>
            ))}
            {selectedPosition ? <><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /><span className="rounded-md bg-brand-primary-pale px-1.5 py-1 font-bold text-brand-primary-deep">{selectedPosition.title}</span></> : null}
          </nav>
        ) : null}

        <div className={cn("relative grid min-h-[34rem] bg-[#f8fbfa]", selectedNode || selectedPosition ? "xl:grid-cols-[minmax(0,1fr)_20rem]" : "grid-cols-1")}>
          {loading ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm font-semibold text-muted-foreground"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Memuat chart...</div> : null}
          <OrganizationChart nodes={data?.nodes ?? []} positions={data?.positions ?? []} selection={selection} onSelect={setSelection} canEdit={Boolean(canEdit)} onStart={startFromEmpty} />

          {selectedNode || selectedPosition ? (
            <aside aria-label="Inspector pilihan struktur" className="border-t border-border/70 bg-white p-4 xl:border-t-0 xl:border-l">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Dipilih</p>
                  <h2 className="mt-1 break-words text-base font-bold text-brand-heading">{selectedNode?.name ?? selectedPosition?.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedNode ? organizationNodeTypeLabel(selectedNode.nodeType) : "Posisi organisasi"}</p>
                </div>
                <button type="button" aria-label="Tutup inspector" onClick={() => setSelection(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>

              <dl className="mt-4 space-y-3 rounded-xl bg-surface p-3 text-xs">
                <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Induk struktural</dt><dd className="mt-1 font-semibold text-brand-heading">{selectedNode ? selectedParentNode?.name ?? "Paling atas" : selectedParentPosition?.title ?? selectedPositionNode?.name ?? "Paling atas"}</dd></div>
                {selectedNode ? <>
                  <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Posisi</dt><dd className="mt-1 font-semibold text-brand-heading">{data?.positions.filter((position) => position.nodeKey === selectedNode.stableKey).length ?? 0} posisi</dd></div>
                  <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Anggota</dt><dd className="mt-1 font-semibold text-brand-heading">{selectedNode.memberCount} anggota</dd></div>
                </> : <>
                  <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Kelompok</dt><dd className="mt-1 font-semibold text-brand-heading">{selectedPositionNode?.name ?? "—"}</dd></div>
                  <div className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pemegang utama · {selectedPosition?.holderSource === "ACCOUNT" ? "ACCOUNT" : "EMPLOYEE"}</dt><dd title={selectedPosition?.primaryIncumbent?.accountEmail ?? selectedPosition?.primaryIncumbent?.employeeName} className="mt-1 truncate font-semibold text-brand-heading">{selectedPosition?.holderSource === "ACCOUNT" ? selectedPosition.primaryIncumbent?.accountEmail ?? selectedPosition.primaryIncumbent?.employeeName ?? "VACANT" : selectedPosition?.primaryIncumbent?.employeeName ?? "VACANT"}</dd>{selectedPosition?.holderSource === "ACCOUNT" ? <dd className="mt-0.5 truncate text-[10px] text-muted-foreground">FOUNDATION_BOARD · {selectedPosition.primaryIncumbent?.accountStatus ?? "belum ditetapkan"}</dd> : null}</div>
                  {selectedPosition?.actingIncumbent ? <div><dt className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Pelaksana tugas</dt><dd className="mt-1 font-bold text-blue-950">{selectedPosition.actingIncumbent.employeeName}</dd></div> : null}
                  <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Kebijakan vacancy</dt><dd className="mt-1 font-semibold text-brand-heading">{selectedPosition?.vacancyPolicy}</dd></div>
                </>}
                <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Kewenangan terkait</dt><dd className="mt-1 font-semibold text-brand-heading">{selectedBindings.length > 0 ? selectedBindings.map((binding) => binding.authorityType).join(", ") : "Belum ada binding langsung"}</dd></div>
                <div><dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Penempatan tampilan</dt><dd className="mt-1 font-semibold text-brand-heading">{(selectedNode?.visualRankOffset ?? selectedPosition?.visualRankOffset ?? 0) > 0 ? `Tampilkan ${selectedNode?.visualRankOffset ?? selectedPosition?.visualRankOffset} tingkat lebih rendah` : "Tingkat normal"}</dd></div>
              </dl>

              {(selectedNode?.visualRankOffset ?? selectedPosition?.visualRankOffset ?? 0) > 0 ? <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] leading-4 text-blue-900">Penempatan ini hanya untuk tampilan chart. Hubungan struktural, reporting, dan approval tidak berubah.</p> : null}

              {canEdit ? <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Tindakan</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {selectedNode ? <>
                    <ActionButton onClick={() => setAction({ type: "node", mode: "edit", node: selectedNode })} icon={<ArrowRightLeft />}>Edit</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "node", mode: "child", node: selectedNode })} icon={<GitBranchPlus />}>Tambah di bawah</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "node", mode: "sibling", node: selectedNode })} icon={<Plus />}>Tambah sejajar</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "position", mode: "create", nodeKey: selectedNode.stableKey })} icon={<BriefcaseBusiness />}>Tambah posisi</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "members", node: selectedNode })} icon={<UsersRound />}>Anggota</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "authority", item: selectedNode, kind: "node" })} icon={<Network />}>Kewenangan</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "visual", item: selectedNode, kind: "node" })} icon={<ArrowDownToLine />}>Tampilan</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "node", mode: "move", node: selectedNode })} icon={<ArrowRightLeft />}>Pindahkan</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "delete-node", node: selectedNode })} icon={<Trash2 />}>Hapus subtree</ActionButton>
                  </> : selectedPosition ? <>
                    <ActionButton onClick={() => setAction({ type: "position", mode: "edit", nodeKey: selectedPosition.nodeKey, position: selectedPosition })} icon={<ArrowRightLeft />}>Edit posisi</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "incumbency", position: selectedPosition, acting: false })} icon={<CircleUserRound />}>{selectedPosition.holderSource === "ACCOUNT" ? "Account holder" : "Pejabat utama"}</ActionButton>
                    {selectedPosition.holderSource !== "ACCOUNT" ? <ActionButton onClick={() => setAction({ type: "incumbency", position: selectedPosition, acting: true })} icon={<UserCog />}>Pelaksana tugas</ActionButton> : null}
                    <ActionButton onClick={() => markVacant(selectedPosition)} icon={<PanelRightClose />}>Tandai vacant</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "position", mode: "edit", nodeKey: selectedPosition.nodeKey, position: selectedPosition })} icon={<ShieldCheck />}>Aturan vacancy</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "authority", item: selectedPosition, kind: "position" })} icon={<Network />}>Kewenangan</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "visual", item: selectedPosition, kind: "position" })} icon={<ArrowDownToLine />}>Tampilan</ActionButton>
                    <ActionButton onClick={() => setAction({ type: "position", mode: "move", nodeKey: selectedPosition.nodeKey, position: selectedPosition })} icon={<ArrowRightLeft />}>Pindahkan</ActionButton>
                    {selectedPosition.actingIncumbent ? <ActionButton onClick={() => clearActing(selectedPosition)} icon={<X />}>Hapus acting</ActionButton> : null}
                  </> : null}
                </div>
              </div> : <p className="mt-4 text-xs text-muted-foreground">Buat atau buka draft untuk mengubah item ini.</p>}
            </aside>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 bg-white px-5 py-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-brand-primary bg-brand-primary-pale" /> Posisi terisi</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-amber-400 bg-amber-50" /> Posisi vacant nyata</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-brand-primary/40" /> Hubungan struktural</span>
          <span className="inline-flex items-center gap-1.5"><ArrowDownToLine className="h-3.5 w-3.5 text-blue-700" /> Rank visual tidak mengubah reporting / approval</span>
        </div>
      </section>

      {validation ? <section className={cn("mt-5 rounded-2xl border p-5", validation.valid ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50")}>
        <div className="flex items-center gap-2">{validation.valid ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-red-700" />}<h2 className="text-base font-bold text-brand-heading">{validation.valid ? "Draft valid" : "Draft perlu diperbaiki"}</h2></div>
        {validation.issues.length > 0 ? <ul className="mt-3 space-y-2 text-sm">{validation.issues.map((issue, index) => <li key={`${issue.code}-${index}`}><span className="font-bold">{issue.code}</span> — {issue.message}</li>)}</ul> : <p className="mt-2 text-sm text-emerald-800">Tidak ada cycle, overlap, atau authority configuration error yang ditemukan server.</p>}
      </section> : null}

      {impact ? <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-bold text-brand-heading">Dampak restrukturisasi</h2><p className="mt-1 text-xs text-muted-foreground">Hasil perbandingan dari server untuk tanggal efektif draft.</p></div>{impact.noApprovalRoutingImpact ? <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">Tidak ada dampak routing approval</span> : <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">Routing perlu ditinjau</span>}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><ImpactCard label="Atasan langsung berubah" count={impact.directManagerChanges.length} /><ImpactCard label="Unit approver berubah" count={impact.unitApproverChanges.length} /><ImpactCard label="Jalur kewenangan" count={impact.authorityPathsAffected.length} /><ImpactCard label="Kewenangan vacant" count={impact.vacantAuthorities.length} tone="warning" /><ImpactCard label="Pegawai unresolved" count={impact.unresolvedEmployees.length} tone="warning" /><ImpactCard label="Perubahan visual saja" count={impact.visualOnlyChanges.length} tone="visual" /></div>
      </section> : null}

      {hasActiveDraft ? <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
        <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-brand-primary-deep" /><h2 className="text-base font-bold text-brand-heading">Preview rantai approval</h2></div>
          <p className="mt-1 text-xs text-muted-foreground">Server menyelesaikan kewenangan, vacancy, acting, capability, dan deduplikasi. Chart tidak menebak approver.</p>
          <form onSubmit={(event) => void runResolutionPreview(event)} className="mt-4 flex flex-col gap-2 sm:flex-row"><select required value={previewEmployeeId} onChange={(event) => setPreviewEmployeeId(event.target.value)} className={`${inputClass} min-w-0 flex-1`}><option value="">Pilih pegawai...</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName} — {employee.employeeNumber}</option>)}</select><button type="submit" disabled={previewLoading || !previewEmployeeId} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white disabled:opacity-50">{previewLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview</button></form>
          {preview ? <div className="mt-4 rounded-xl bg-surface p-4"><p className="text-xs font-bold text-brand-heading">{preview.employee.fullName}</p><div className="mt-3 flex flex-wrap items-center gap-2">{preview.steps.map((step, index) => <div key={`${step.employeeId}-${index}`} className="contents"><span className="rounded-xl border border-border bg-white px-3 py-2 text-xs"><span className="font-bold">{step.employeeName}</span>{step.authorityType ? <span className="block text-[10px] text-muted-foreground">{step.authorityType}</span> : null}</span>{index < preview.steps.length - 1 ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : null}</div>)}{preview.steps.length === 0 ? <span className="text-xs text-muted-foreground">Tidak ada approver yang terselesaikan.</span> : null}</div>{preview.oversight ? <p className="mt-3 text-xs text-muted-foreground">Setelah final approved, notifikasi oversight: <span className="font-bold text-brand-heading">{preview.oversight.employeeName}</span></p> : null}</div> : null}
        </article>
        <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><h2 className="text-sm font-bold text-blue-950">Snapshot approval tetap aman</h2><p className="mt-2 text-xs leading-5 text-blue-900">Publikasi struktur hanya memengaruhi transaksi baru pada tanggal efektif. Approver konkret pada permintaan yang sudah disubmit tidak dihitung ulang.</p></article>
      </section> : null}

      {action?.type === "draft" ? <Modal title="Jadwalkan perubahan struktur" description="Buat draft terpisah agar struktur terpublikasi dan riwayat sebelumnya tidak tertimpa." onClose={() => setAction(null)}><form onSubmit={handleDraft} className="space-y-4"><Field label="Nama draft"><input name="name" required defaultValue={`Restrukturisasi ${effectiveDate}`} className={inputClass} /></Field><Field label="Tanggal efektif" hint="Asia/Jakarta"><input name="effectiveOn" type="date" required min={jakartaToday()} defaultValue={effectiveDate < jakartaToday() ? jakartaToday() : effectiveDate} className={inputClass} /></Field><SubmitRow saving={saving} onCancel={() => setAction(null)} label="Buat draft" /></form></Modal> : null}

      {action?.type === "node" ? (
        <Modal
          title={action.mode === "move" ? "Pindahkan kelompok" : action.mode === "edit" ? "Edit kelompok" : action.mode === "sibling" ? "Tambah kelompok sejajar" : action.mode === "child" ? "Tambah kelompok di bawah" : "Tambah kelompok pertama"}
          description={action.mode === "move" ? "Pemindahan mengubah induk struktural dan harus dilakukan secara sengaja. Tinjau dampak approval sebelum publish." : "Kelompok adalah container organisasi. Posisi dan kewenangan ditambahkan secara terpisah."}
          onClose={() => setAction(null)}
        >
          <form onSubmit={(event) => handleNode(event, action)} className="space-y-4">
            {action.mode === "move" ? <>
              <div className="rounded-xl bg-surface p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pindahkan</p><p className="mt-1 text-sm font-bold text-brand-heading">{action.node?.name}</p></div>
              <Field label="Induk struktural baru"><select name="parentNodeKey" defaultValue={action.node?.parentNodeKey ?? ""} className={inputClass}><option value="">Tidak ada — paling atas</option>{selectableOrganizationParents(data?.nodes ?? [], "edit", action.node?.stableKey).map((node) => <option key={node.stableKey} value={node.stableKey}>{node.name}</option>)}</select></Field>
            </> : <>
              <Field label="Nama"><input name="name" required defaultValue={action.mode === "edit" ? action.node?.name : ""} placeholder="Contoh: Bidang Pendidikan" className={inputClass} /></Field>
              <Field label="Jenis kelompok" hint="contoh: Direktorat, Unit, Divisi, atau Tim"><select name="nodeType" defaultValue={action.node?.nodeType ?? "UNIT"} className={inputClass}><option value="FOUNDATION">Yayasan / Foundation</option><option value="DIRECTORATE">Direktorat / Bidang</option><option value="UNIT">Unit</option><option value="DIVISION">Divisi</option><option value="DEPARTMENT">Departemen</option><option value="TEAM">Tim</option></select></Field>
              {action.mode === "child" || action.mode === "sibling" ? <div className="rounded-xl border border-border bg-surface p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{action.mode === "child" ? "Di bawah" : "Induk bersama"}</p><p className="mt-1 text-sm font-bold text-brand-heading">{action.mode === "child" ? action.node?.name : data?.nodes.find((node) => node.stableKey === action.node?.parentNodeKey)?.name ?? "Tingkat paling atas"}</p><input type="hidden" name="parentNodeKey" value={action.mode === "child" ? action.node?.stableKey ?? "" : action.node?.parentNodeKey ?? ""} /></div> : <input type="hidden" name="parentNodeKey" value={action.node?.parentNodeKey ?? ""} />}
              <Field label="Tampilan" hint="opsional, tidak mengubah reporting atau approval"><select name="visualRankOffset" defaultValue={action.node?.visualRankOffset ?? 0} className={inputClass}><option value="0">Tingkat normal</option><option value="1">Tampilkan 1 tingkat lebih rendah</option><option value="2">Tampilkan 2 tingkat lebih rendah</option><option value="3">Tampilkan 3 tingkat lebih rendah</option></select></Field>
              <details className="rounded-xl border border-border bg-surface p-3"><summary className="cursor-pointer text-xs font-bold text-brand-heading">Pengaturan lanjutan</summary><div className="mt-3"><Field label="Kode integrasi" hint="opsional, untuk integrasi teknis"><input name="integrationCode" defaultValue={action.node?.integrationCode ?? ""} className={inputClass} /></Field></div></details>
            </>}
            <SubmitRow saving={saving} onCancel={() => setAction(null)} label={action.mode === "move" ? "Pindahkan kelompok" : action.mode === "edit" ? "Simpan perubahan" : "Tambah kelompok"} />
          </form>
        </Modal>
      ) : null}

      {action?.type === "position" ? (
        <Modal title={action.mode === "move" ? "Pindahkan posisi" : action.mode === "edit" ? "Edit posisi" : "Tambah posisi"} description={action.mode === "move" ? "Pemindahan ini mengubah konteks struktural posisi." : "Judul posisi adalah data tampilan; resolver memakai hubungan kewenangan yang dikonfigurasi."} onClose={() => setAction(null)}>
          <form onSubmit={(event) => handlePosition(event, action)} className="space-y-4">
            {action.mode === "move" ? <>
              <div className="rounded-xl bg-surface p-3 text-sm font-bold text-brand-heading">{action.position?.title}</div>
              <Field label="Kelompok baru"><select name="nodeKey" required defaultValue={action.position?.nodeKey ?? action.nodeKey} className={inputClass}>{data?.nodes.map((node) => <option key={node.stableKey} value={node.stableKey}>{node.name}</option>)}</select></Field>
              <Field label="Posisi atasan struktural baru"><select name="parentPositionKey" defaultValue={action.position?.parentPositionKey ?? ""} className={inputClass}><option value="">Tidak ada / mengikuti leader kelompok</option>{data?.positions.filter((position) => position.stableKey !== action.position?.stableKey).map((position) => <option key={position.stableKey} value={position.stableKey}>{position.title}</option>)}</select></Field>
            </> : <>
              <Field label="Judul posisi"><input name="title" required defaultValue={action.position?.title ?? ""} placeholder="Contoh: Kepala Bidang Pendidikan" className={inputClass} /></Field>
              {action.mode === "create" ? <><Field label="Berada di kelompok"><select name="nodeKey" required defaultValue={action.nodeKey} className={inputClass}>{data?.nodes.map((node) => <option key={node.stableKey} value={node.stableKey}>{node.name}</option>)}</select></Field><Field label="Posisi atasan struktural"><select name="parentPositionKey" defaultValue={action.parentPositionKey ?? ""} className={inputClass}><option value="">Tidak ada / mengikuti leader kelompok</option>{data?.positions.map((position) => <option key={position.stableKey} value={position.stableKey}>{position.title}</option>)}</select></Field></> : <><div className="rounded-xl border border-border bg-surface p-3 text-xs"><span className="text-muted-foreground">Kelompok: </span><span className="font-bold text-brand-heading">{data?.nodes.find((node) => node.stableKey === action.position?.nodeKey)?.name}</span></div><input type="hidden" name="nodeKey" value={action.position?.nodeKey} /><input type="hidden" name="parentPositionKey" value={action.position?.parentPositionKey ?? ""} /></>}
              <Field label="Ketika posisi vacant"><select name="vacancyPolicy" defaultValue={action.position?.vacancyPolicy ?? "CLIMB_TO_PARENT"} className={inputClass}><option value="CLIMB_TO_PARENT">Naik ke kewenangan struktural di atas</option><option value="REQUIRE_ACTING_OR_BLOCK">Wajib pelaksana tugas atau blokir</option><option value="BLOCK">Blokir jika vacant</option></select></Field>
              <Field label="Sumber pemegang posisi" hint="eksplisit, bukan berdasarkan judul"><select name="holderSource" defaultValue={action.position?.holderSource ?? "EMPLOYEE"} className={inputClass}><option value="EMPLOYEE">Pegawai</option><option value="ACCOUNT">Account Organ Yayasan</option></select></Field>
              <Field label="Tampilan" hint="presentasi saja"><select name="visualRankOffset" defaultValue={action.position?.visualRankOffset ?? 0} className={inputClass}><option value="0">Tingkat normal</option><option value="1">Tampilkan 1 tingkat lebih rendah</option><option value="2">Tampilkan 2 tingkat lebih rendah</option><option value="3">Tampilkan 3 tingkat lebih rendah</option></select></Field>
            </>}
            <SubmitRow saving={saving} onCancel={() => setAction(null)} label={action.mode === "move" ? "Pindahkan posisi" : action.mode === "edit" ? "Simpan perubahan" : "Tambah posisi"} />
          </form>
        </Modal>
      ) : null}

      {action?.type === "incumbency" ? <Modal title={action.acting ? "Tetapkan pelaksana tugas" : "Tetapkan pemegang posisi"} description={action.acting ? "Acting authority selalu eksplisit dan berbatas tanggal; sistem tidak menginferensikannya dari absensi." : "Pilih pegawai atau account governance yang sudah ada. Penetapan tidak membuat account, mengaktifkan account, atau memberikan permission."} onClose={() => setAction(null)}><HolderAssignmentEditor position={action.position} acting={action.acting} employees={employees} accounts={boardAccounts} effectiveOn={data?.draft?.effectiveOn ?? effectiveDate} saving={saving} onCancel={() => setAction(null)} onSubmit={(event) => handleIncumbency(event, action)} /></Modal> : null}

      {action?.type === "members" ? <Modal title={`Kelola anggota · ${action.node.name}`} description="Pilih satu per satu atau gunakan unit lama sebagai bantuan migrasi keanggotaan yang eksplisit." onClose={() => setAction(null)}><MembershipEditor node={action.node} employees={employees} memberships={data?.memberships ?? []} saving={saving} onCancel={() => setAction(null)} onSubmit={(event) => handleMembers(event, action)} /></Modal> : null}

      {action?.type === "visual" ? <Modal title="Atur tampilan" description="Pengaturan ini hanya mengubah posisi kotak pada chart. Reporting, Direct Manager, Unit Approver, dan kewenangan lain tidak berubah." onClose={() => setAction(null)}><form onSubmit={(event) => handleVisual(event, action)}><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-950">{"name" in action.item ? action.item.name : action.item.title}</div><div className="mt-4 space-y-2">{[0, 1, 2, 3].map((offset) => <label key={offset} className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 hover:bg-muted"><input type="radio" name="visualRankOffset" value={offset} defaultChecked={action.item.visualRankOffset === offset} className="mt-0.5 accent-[var(--color-brand-primary)]" /><span><span className="block text-sm font-bold text-brand-heading">{offset === 0 ? "Tingkat normal" : `Tampilkan ${offset} tingkat lebih rendah`}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{offset === 0 ? "Ikuti kedalaman hubungan induk." : "Garis konektor tetap menunjuk ke induk struktural sebenarnya."}</span></span></label>)}</div><SubmitRow saving={saving} onCancel={() => setAction(null)} label="Simpan tampilan" /></form></Modal> : null}

      {action?.type === "delete-node" ? <Modal title="Hapus kelompok dan subtree?" description="Tindakan ini hanya tersedia pada DRAFT dan tidak mengubah histori yang sudah dipublikasikan." onClose={() => setAction(null)}><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">{action.node.name}</p><p className="mt-2 text-xs leading-5">Seluruh referensi draft yang bergantung ikut dihapus secara atomik. Stable key yatim tidak akan dipertahankan.</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">{Object.entries({ "Kelompok anak": pendingDeletionImpact?.childGroups ?? 0, Posisi: pendingDeletionImpact?.positions ?? 0, Membership: pendingDeletionImpact?.memberships ?? 0, Incumbency: pendingDeletionImpact?.incumbencies ?? 0, "Authority binding": pendingDeletionImpact?.authorityBindings ?? 0, "Reporting override": pendingDeletionImpact?.reportingOverrides ?? 0 }).map(([label, count]) => <div key={label} className="rounded-lg bg-white/80 p-2"><dt className="text-[10px] text-red-700">{label}</dt><dd className="mt-0.5 font-bold">{count}</dd></div>)}</dl></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setAction(null)} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold">Batal</button><button type="button" disabled={saving} onClick={() => deleteNodeSubtree(action.node)} className="h-10 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60">Hapus subtree</button></div></Modal> : null}

      {action?.type === "discard-draft" ? <Modal title="Buang seluruh draft?" description="DRAFT atau hasil validasi yang belum dipublikasikan dapat dibuang. PUBLISHED tidak pernah dapat dihapus." onClose={() => setAction(null)}><div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">{data?.draft?.name}</p><p className="mt-2 text-xs leading-5">Semua perubahan yang belum dipublikasikan dalam draft ini akan dihapus. Versi terpublikasi dan audit event tetap tersimpan.</p></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setAction(null)} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold">Batal</button><button type="button" disabled={saving} onClick={() => void discardDraft()} className="h-10 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60">Buang draft</button></div></Modal> : null}

      {action?.type === "authority" ? <Modal title="Konfigurasi kewenangan" description="Pilih hubungan semantik dan posisi target. Nama jabatan tidak dipakai sebagai business rule." onClose={() => setAction(null)}><form onSubmit={(event) => handleAuthority(event, action)} className="space-y-4"><Field label="Jenis kewenangan"><select name="authorityType" className={inputClass}>{action.kind === "position" ? <><option value="SUPERVISORY_PARENT">Atasan struktural</option><option value="GOVERNANCE_APPROVER">Governance approver</option><option value="OVERSIGHT_PARENT">Oversight di atas approver</option></> : <><option value="LEADER">Leader kelompok</option><option value="UNIT_APPROVER">Unit approver</option></>}</select></Field><Field label="Posisi target"><select name="targetPositionKey" required className={inputClass}><option value="">Pilih posisi...</option>{data?.positions.map((position) => <option key={position.stableKey} value={position.stableKey}>{position.title}</option>)}</select></Field><Field label="Jika posisi target vacant"><select name="vacancyPolicy" defaultValue="CLIMB_TO_PARENT" className={inputClass}><option value="CLIMB_TO_PARENT">Naik ke atas</option><option value="REQUIRE_ACTING_OR_BLOCK">Wajib acting atau blokir</option><option value="BLOCK">Blokir</option></select></Field><SubmitRow saving={saving} onCancel={() => setAction(null)} label="Simpan kewenangan" /></form></Modal> : null}
    </AdminShell>
  );
}

function ActionButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button type="button" onClick={onClick} className="inline-flex h-8 min-w-0 items-center gap-1 rounded-lg border border-border bg-white px-2 text-left text-[10px] font-bold leading-3 hover:border-brand-primary/40 hover:bg-brand-primary-pale/30 [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0"><span className="contents">{icon}</span><span className="min-w-0 truncate" title={typeof children === "string" ? children : undefined}>{children}</span></button>;
}
