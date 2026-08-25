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
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  OrganizationChart,
  type OrganizationSelection,
} from "@/components/organization/OrganizationChart";
import { AdminShell } from "@/layouts/AdminShell";
import { AdminApiError } from "@/lib/adminEmployees";
import {
  createOrganizationAuthorityBinding,
  configureOrganizationApprovalReporting,
  configureOrganizationLeader,
  createOrganizationDraft,
  createOrganizationNode,
  createOrganizationPosition,
  deleteOrganizationGroup,
  deleteOrganizationNode,
  deleteOrganizationPosition,
  discardOrganizationDraft,
  getOrganizationDesignerView,
  getOrganizationImpact,
  getOrganizationRollout,
  listFoundationBoardAccounts,
  listOrganizationEmployees,
  organizationStatusCopy,
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
  type OrganizationRolloutConfiguration,
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
import {
  buildMembershipDeltas,
  currentNodeMemberships,
  defaultMembershipIsPrimary,
  type OrganizationMembershipDelta,
} from "@/lib/organizationMembershipEditor";
import { selectableOrganizationParents } from "@/lib/organizationTree";

type EditorAction =
  | { type: "draft" }
  | {
      type: "node";
      mode: "root" | "child" | "sibling" | "edit" | "move";
      node?: OrganizationNode;
    }
  | {
      type: "position";
      mode: "create" | "edit" | "move";
      nodeKey: string;
      parentPositionKey?: string | null;
      position?: OrganizationPosition;
    }
  | { type: "incumbency"; position: OrganizationPosition; acting: boolean }
  | { type: "leader"; node: OrganizationNode }
  | { type: "members"; node: OrganizationNode }
  | {
      type: "visual";
      item: OrganizationNode | OrganizationPosition;
      kind: "node" | "position";
    }
  | {
      type: "authority";
      item: OrganizationNode | OrganizationPosition;
      kind: "node" | "position";
    }
  | {
      type: "approval-reporting";
      item: OrganizationNode | OrganizationPosition;
      kind: "node" | "position";
    }
  | { type: "delete-group"; node: OrganizationNode }
  | { type: "delete-node"; node: OrganizationNode }
  | { type: "delete-position"; position: OrganizationPosition }
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
  wide = false,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-heading/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="organization-dialog-title"
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-xl",
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border/70 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2
              id="organization-dialog-title"
              className="text-xl font-bold text-brand-heading"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Tutup dialog"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-brand-heading">{label}</span>
      {hint ? (
        <span className="ml-1 text-xs text-muted-foreground">{hint}</span>
      ) : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10";

function SubmitRow({
  saving,
  onCancel,
  label,
  disabled = false,
}: {
  saving: boolean;
  onCancel: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-border/70 pt-4">
      <button
        type="button"
        onClick={onCancel}
        className="h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted"
      >
        Batal
      </button>
      <button
        type="submit"
        disabled={saving || disabled}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white hover:bg-brand-primary-deep disabled:opacity-60"
      >
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {saving ? "Menyimpan..." : label}
      </button>
    </div>
  );
}

function readinessVerdictCopy(value: string) {
  if (value === "READY") return "Siap";
  if (value === "PENDING_USER_ACTIVATION") return "Menunggu aktivasi pengguna";
  if (value === "VACANT_FALLBACK") return "Siap melalui fallback posisi kosong";
  if (value === "BUSINESS_DECISION_REQUIRED") return "Memerlukan keputusan bisnis";
  return "Konfigurasi belum siap";
}

function accountStatusCopy(value: string | null) {
  if (value === "ACTIVE") return "Aktif";
  if (value === "INVITED") return "Menunggu aktivasi";
  if (value === "SUSPENDED") return "Ditangguhkan";
  if (value === "INACTIVE") return "Nonaktif";
  if (value === "MISSING") return "Belum ada akun";
  return "Tidak ada pejabat";
}

function authorityTypeCopy(value: string) {
  if (value === "DIRECT_MANAGER") return "Atasan langsung";
  if (value === "UNIT_APPROVER") return "Penyetuju unit";
  if (value === "GOVERNANCE_APPROVER") return "Penyetuju governance";
  if (value === "OVERSIGHT_PARENT") return "Penerima pemberitahuan oversight";
  if (value === "SUPERVISORY_PARENT") return "Atasan struktural";
  if (value === "LEADER") return "Pimpinan struktur";
  return "Kewenangan organisasi";
}

function validationIssueCopy(code: string) {
  if (code.includes("CYCLE") || code === "AUTHORITY_LOOP") {
    return "Ada hubungan berputar yang harus diputus sebelum draft dapat diterbitkan.";
  }
  if (code.includes("OVERLAP")) {
    return "Ada dua penetapan efektif pada waktu yang sama. Periksa tanggal atau pilihan utama.";
  }
  if (code.includes("REFERENCE") || code.includes("_NODE") || code.includes("_PARENT")) {
    return "Ada referensi struktur atau posisi yang sudah tidak valid.";
  }
  if (code.includes("INCUMBENT") || code.includes("ACCOUNT")) {
    return "Pejabat yang dipilih belum memenuhi konfigurasi struktur yang diperlukan.";
  }
  if (code.includes("MEMBERSHIP")) {
    return "Keanggotaan utama perlu diperiksa agar reporting tidak ambigu.";
  }
  return "Konfigurasi ini perlu diperiksa sebelum draft dapat diterbitkan.";
}

function ImpactCard({
  label,
  count,
  tone = "default",
}: {
  label: string;
  count: number;
  tone?: "default" | "warning" | "visual";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3",
        tone === "warning"
          ? "border-amber-200 bg-amber-50"
          : tone === "visual"
            ? "border-blue-200 bg-blue-50"
            : "border-border/70 bg-surface",
      )}
    >
      <p className="text-xl font-bold text-brand-heading">{count}</p>
      <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function subtreeDeletionImpact(
  data: OrganizationDesignerView,
  selected: OrganizationNode,
) {
  const nodeKeys = new Set([selected.stableKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of data.nodes) {
      if (
        node.parentNodeKey &&
        nodeKeys.has(node.parentNodeKey) &&
        !nodeKeys.has(node.stableKey)
      ) {
        nodeKeys.add(node.stableKey);
        changed = true;
      }
    }
  }
  const positionKeys = new Set(
    data.positions
      .filter((item) => nodeKeys.has(item.nodeKey))
      .map((item) => item.stableKey),
  );
  return {
    childGroups: nodeKeys.size - 1,
    positions: positionKeys.size,
    memberships: data.memberships.filter((item) => nodeKeys.has(item.nodeKey))
      .length,
    incumbencies: data.assignments.filter(
      (item) => item.positionKey && positionKeys.has(item.positionKey),
    ).length,
    authorityBindings: data.bindings.filter(
      (item) =>
        positionKeys.has(item.targetPositionKey) ||
        (item.sourceType === "NODE"
          ? nodeKeys.has(item.sourceKey)
          : positionKeys.has(item.sourceKey)),
    ).length,
    reportingOverrides: data.reportingOverrides.filter((item) =>
      positionKeys.has(item.managerPositionKey),
    ).length,
  };
}

function groupDeletionImpact(
  data: OrganizationDesignerView,
  selected: OrganizationNode,
) {
  const positions = data.positions.filter(
    (item) => item.nodeKey === selected.stableKey,
  );
  const positionKeys = new Set(positions.map((item) => item.stableKey));
  return {
    childGroups: data.nodes.filter(
      (item) => item.parentNodeKey === selected.stableKey,
    ).length,
    positions: positions.length,
    memberships: data.memberships.filter(
      (item) => item.nodeKey === selected.stableKey,
    ).length,
    authorityBindings: data.bindings.filter(
      (item) =>
        item.sourceKey === selected.stableKey ||
        positionKeys.has(item.targetPositionKey) ||
        positionKeys.has(item.sourceKey),
    ).length,
    reportingOverrides: data.reportingOverrides.filter((item) =>
      positionKeys.has(item.managerPositionKey),
    ).length,
  };
}

function positionDeletionImpact(
  data: OrganizationDesignerView,
  selected: OrganizationPosition,
) {
  return {
    childPositions: data.positions.filter(
      (item) => item.parentPositionKey === selected.stableKey,
    ).length,
    authorityBindings: data.bindings.filter(
      (item) =>
        item.targetPositionKey === selected.stableKey ||
        item.sourceKey === selected.stableKey,
    ).length,
    reportingOverrides: data.reportingOverrides.filter(
      (item) => item.managerPositionKey === selected.stableKey,
    ).length,
  };
}

function MembershipEditor({
  node,
  nodes,
  employees,
  memberships,
  saving,
  onCancel,
  onSubmit,
}: {
  node: OrganizationNode;
  nodes: OrganizationNode[];
  employees: OrganizationEmployeeOption[];
  memberships: OrganizationDesignerView["memberships"];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const currentMemberships = useMemo(
    () => currentNodeMemberships(memberships, node.stableKey),
    [memberships, node.stableKey],
  );
  const currentEmployeeIds = useMemo(
    () => new Set(currentMemberships.map((item) => item.employeeId)),
    [currentMemberships],
  );
  const [selected, setSelected] = useState(
    () => new Set(currentMemberships.map((item) => item.employeeId)),
  );
  const [primaryByEmployeeId, setPrimaryByEmployeeId] = useState(
    () => new Map(
      currentMemberships.map((item) => [item.employeeId, Boolean(item.isPrimary)]),
    ),
  );
  const [confirmedPrimarySwitches, setConfirmedPrimarySwitches] = useState(
    () => new Set<string>(),
  );
  const [legacyUnit, setLegacyUnit] = useState("");
  const [manualUnit, setManualUnit] = useState("");
  const [search, setSearch] = useState("");
  const activeEmployees = useMemo(
    () => activeOrganizationEmployees(employees),
    [employees],
  );
  const legacyUnits = useMemo(
    () => organizationEmployeeUnits(employees),
    [employees],
  );
  const legacyCandidates = useMemo(
    () => legacyUnit
      ? activeEmployees.filter((employee) => employee.unitName === legacyUnit)
      : [],
    [activeEmployees, legacyUnit],
  );
  const filteredEmployees = useMemo(
    () => filterOrganizationEmployees(employees, { search, unit: manualUnit })
      .filter((employee) => !currentEmployeeIds.has(employee.id)),
    [currentEmployeeIds, employees, manualUnit, search],
  );
  const deltas = useMemo(
    () => buildMembershipDeltas({
      nodeKey: node.stableKey,
      memberships,
      selectedEmployeeIds: selected,
      primaryByEmployeeId,
    }),
    [memberships, node.stableKey, primaryByEmployeeId, selected],
  );
  const filtersApplied = Boolean(search.trim() || manualUnit);
  const blockedPrimaryRemoval = deltas.some((delta) => delta.blocksLastPrimaryRemoval);
  const missingPrimaryConfirmation = deltas.some(
    (delta) =>
      delta.requiresPrimarySwitchConfirmation &&
      !confirmedPrimarySwitches.has(delta.employeeId),
  );

  const employeeFor = (employeeId: string) =>
    employees.find((employee) => employee.id === employeeId);
  const setMembershipType = (employeeId: string, isPrimary: boolean) => {
    setPrimaryByEmployeeId((current) =>
      new Map(current).set(employeeId, isPrimary),
    );
    if (!isPrimary) {
      setConfirmedPrimarySwitches((current) => {
        const next = new Set(current);
        next.delete(employeeId);
        return next;
      });
    }
  };
  const toggle = (employeeId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(employeeId);
      else next.delete(employeeId);
      return next;
    });
    if (checked && !primaryByEmployeeId.has(employeeId)) {
      setPrimaryByEmployeeId((current) =>
        new Map(current).set(
          employeeId,
          defaultMembershipIsPrimary(memberships, node.stableKey, employeeId),
        ),
      );
    }
  };
  const nodePath = (nodeKey: string) => {
    const parts: string[] = [];
    let current = nodes.find((item) => item.stableKey === nodeKey);
    while (current) {
      parts.unshift(current.name);
      current = current.parentNodeKey
        ? nodes.find((item) => item.stableKey === current!.parentNodeKey)
        : undefined;
    }
    return parts.join(" / ") || nodeKey;
  };
  const deltaLabel = (delta: OrganizationMembershipDelta) => {
    if (delta.kind === "ADDED") return "+ Ditambahkan";
    if (delta.kind === "REMOVED") return "− Dihapus";
    return "~ Perubahan keanggotaan";
  };
  const addLegacyCandidates = () => {
    for (const employee of legacyCandidates) {
      if (currentEmployeeIds.has(employee.id)) continue;
      toggle(employee.id, true);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <details className="rounded-xl border border-border bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-bold text-brand-heading hover:bg-muted">
          <span>{currentMemberships.length} anggota saat ini</span>
          <span className="text-xs font-semibold text-brand-primary-deep">
            Lihat anggota saat ini
          </span>
        </summary>
        <div className="max-h-48 space-y-1 overflow-y-auto border-t border-border px-2 py-2">
          {currentMemberships.map((membership) => {
            const employee = employeeFor(membership.employeeId);
            return (
              <div
                key={membership.employeeId}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-muted"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(membership.employeeId)}
                    onChange={(event) => toggle(membership.employeeId, event.target.checked)}
                    aria-label={`Pertahankan ${employee?.fullName ?? membership.employeeId} sebagai anggota`}
                    className="h-4 w-4 accent-[var(--color-brand-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-brand-heading">
                      {employee?.fullName ?? membership.employeeName ?? membership.employeeId}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {membership.isPrimary ? "Anggota utama" : "Tambahan / rangkap unit"}
                    </span>
                  </span>
                </label>
                {!membership.isPrimary && selected.has(membership.employeeId) ? (
                  <button
                    type="button"
                    onClick={() => setMembershipType(membership.employeeId, true)}
                    className="shrink-0 rounded-lg border border-border px-2 py-1.5 text-xs font-bold text-brand-primary-deep hover:bg-brand-primary-pale"
                  >
                    Jadikan unit utama
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </details>

      <section
        className="mt-4 rounded-xl border border-border bg-surface/60 p-3"
        aria-label="Filter pegawai aktif"
      >
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            type="search"
            aria-label="Cari nama atau nomor pegawai"
            placeholder="Cari nama / NIP..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
          />
          <select
            aria-label="Filter unit pegawai"
            value={manualUnit}
            onChange={(event) => setManualUnit(event.target.value)}
            className={inputClass}
          >
            <option value="">Semua unit</option>
            {legacyUnits.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="mt-3" aria-label="Pegawai tersedia">
        <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Pegawai tersedia
        </p>
        <div
          className="mt-2 max-h-56 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border p-2"
          aria-live="polite"
        >
          {filteredEmployees.map((employee) => (
            <label
              key={employee.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.has(employee.id)}
                onChange={(event) => toggle(employee.id, event.target.checked)}
                className="mt-1 h-4 w-4 accent-[var(--color-brand-primary)]"
              />
              <span>
                <span className="block text-sm font-semibold text-brand-heading">
                  {employee.fullName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {employee.employeeNumber} · {employee.unitName ?? "Tanpa unit"}
                </span>
              </span>
            </label>
          ))}
          {activeEmployees.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Daftar pegawai aktif belum tersedia.
            </p>
          ) : null}
          {activeEmployees.length > 0 && !filtersApplied ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Cari nama/NIP atau pilih filter unit untuk menampilkan pegawai.
            </p>
          ) : null}
          {filtersApplied && filteredEmployees.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Tidak ada pegawai tersedia yang cocok.
            </p>
          ) : null}
        </div>
      </section>

      {[...selected].map((employeeId) => (
        <input
          key={employeeId}
          type="hidden"
          name="employeeIds"
          value={employeeId}
        />
      ))}
      {[...selected].filter((employeeId) =>
        primaryByEmployeeId.get(employeeId) ??
        defaultMembershipIsPrimary(memberships, node.stableKey, employeeId),
      ).map((employeeId) => (
        <input key={`primary-${employeeId}`} type="hidden" name="primaryEmployeeIds" value={employeeId} />
      ))}

      <section className="mt-4" aria-label="Perubahan keanggotaan">
        <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Perubahan ({deltas.length})
        </p>
        {deltas.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Belum ada perubahan. Anggota yang tidak diubah tidak akan ditulis ulang.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {deltas.map((delta) => {
              const employee = employeeFor(delta.employeeId);
              return (
                <article key={delta.employeeId} className="rounded-xl border border-border bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-brand-heading">
                        {employee?.fullName ?? delta.employeeId}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-brand-primary-deep">
                        {deltaLabel(delta)}
                      </p>
                    </div>
                    {delta.kind !== "REMOVED" ? (
                      <span className="rounded-full bg-surface px-2 py-1 text-xs font-bold text-brand-heading">
                        {delta.after === "PRIMARY" ? "Anggota utama" : "Tambahan / rangkap unit"}
                      </span>
                    ) : null}
                  </div>
                  {delta.primaryElsewhere ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Unit utama saat ini: <span className="font-semibold text-brand-heading">{nodePath(delta.primaryElsewhere.nodeKey)}</span>
                    </p>
                  ) : null}
                  {delta.kind !== "REMOVED" ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Perubahan: + {nodePath(node.stableKey)} sebagai {delta.after === "PRIMARY" ? "Anggota utama" : "Tambahan / rangkap unit"}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Keanggotaan pada {nodePath(node.stableKey)} akan dihapus saat disimpan.
                    </p>
                  )}
                  {delta.after === "SECONDARY" && delta.primaryElsewhere ? (
                    <button
                      type="button"
                      onClick={() => setMembershipType(delta.employeeId, true)}
                      className="mt-3 rounded-lg border border-border px-3 py-2 text-xs font-bold text-brand-primary-deep hover:bg-brand-primary-pale"
                    >
                      Jadikan ini unit utama
                    </button>
                  ) : null}
                  {delta.requiresPrimarySwitchConfirmation ? (
                    <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      <input
                        type="checkbox"
                        checked={confirmedPrimarySwitches.has(delta.employeeId)}
                        onChange={(event) => setConfirmedPrimarySwitches((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(delta.employeeId);
                          else next.delete(delta.employeeId);
                          return next;
                        })}
                        className="mt-1 h-4 w-4"
                      />
                      Saya konfirmasi unit utama sebelumnya tetap disimpan sebagai keanggotaan tambahan.
                    </label>
                  ) : null}
                  {delta.blocksLastPrimaryRemoval ? (
                    <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                      Unit utama terakhir tidak dapat dihapus. Jadikan keanggotaan di unit lain sebagai unit utama terlebih dahulu.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {[...confirmedPrimarySwitches].map((employeeId) => (
        <input key={`confirm-primary-${employeeId}`} type="hidden" name="confirmPrimarySwitchEmployeeIds" value={employeeId} />
      ))}

      <details className="mt-4 rounded-xl border border-border bg-surface p-3">
        <summary className="cursor-pointer text-xs font-bold text-brand-heading">
          Bantuan migrasi unit lama
        </summary>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Bantuan ini hanya menyalin keanggotaan. Posisi, pimpinan, hierarchy,
          dan kewenangan tidak dibuat otomatis.
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
          <div className="mt-3 rounded-lg bg-white p-3">
            <p className="text-xs font-bold text-brand-heading">
              Preview: {legacyCandidates.length} pegawai aktif
            </p>
            <button
              type="button"
              disabled={legacyCandidates.length === 0}
              onClick={addLegacyCandidates}
              className="mt-3 h-9 rounded-lg border border-border bg-white px-3 text-xs font-bold text-brand-primary-deep disabled:opacity-50"
            >
              Tambahkan {legacyCandidates.length} pegawai tersedia
            </button>
          </div>
        ) : null}
      </details>

      <SubmitRow
        saving={saving}
        onCancel={onCancel}
        label={`Simpan ${deltas.length} perubahan`}
        disabled={deltas.length === 0 || blockedPrimaryRemoval || missingPrimaryConfirmation}
      />
    </form>
  );
}

function organizationPositionHolder(position: OrganizationPosition | null | undefined) {
  if (!position) return "Belum ditetapkan";
  return position.actingIncumbent?.employeeName
    ? `${position.actingIncumbent.employeeName} · PLT`
    : position.primaryIncumbent?.accountEmail
      ?? position.primaryIncumbent?.employeeName
      ?? "VACANT";
}

export function ApprovalReportingEditor({
  item,
  kind,
  data,
  saving,
  onCancel,
  onSubmit,
}: {
  item: OrganizationNode | OrganizationPosition;
  kind: "node" | "position";
  data: OrganizationDesignerView;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const bindingTarget = (
    sourceType: "NODE" | "POSITION",
    sourceKey: string,
    authorityType: OrganizationDesignerView["bindings"][number]["authorityType"],
  ) => data.bindings.find((binding) =>
    binding.sourceType === sourceType &&
    binding.sourceKey === sourceKey &&
    binding.authorityType === authorityType,
  )?.targetPositionKey ?? null;
  const positionFor = (stableKey: string | null) =>
    stableKey
      ? data.positions.find((position) => position.stableKey === stableKey) ?? null
      : null;
  const reportingTargetFor = (stableKey: string | null) => {
    const position = positionFor(stableKey);
    if (!position) return null;
    return bindingTarget("POSITION", stableKey!, "SUPERVISORY_PARENT")
      ?? position.parentPositionKey;
  };

  const node = kind === "node" ? item as OrganizationNode : null;
  const sourcePosition = kind === "position" ? item as OrganizationPosition : null;
  const initialLeaderKey = node
    ? bindingTarget("NODE", node.stableKey, "LEADER")
    : null;
  const [leaderKey, setLeaderKey] = useState(initialLeaderKey);
  const [reportsToKey, setReportsToKey] = useState(
    reportingTargetFor(sourcePosition?.stableKey ?? initialLeaderKey),
  );
  const [unitApproverKey, setUnitApproverKey] = useState(
    node ? bindingTarget("NODE", node.stableKey, "UNIT_APPROVER") : null,
  );
  const [governanceApproverKey, setGovernanceApproverKey] = useState(
    sourcePosition
      ? bindingTarget("POSITION", sourcePosition.stableKey, "GOVERNANCE_APPROVER")
      : null,
  );
  const [oversightParentKey, setOversightParentKey] = useState(
    sourcePosition
      ? bindingTarget("POSITION", sourcePosition.stableKey, "OVERSIGHT_PARENT")
      : null,
  );
  const currentSubject = sourcePosition ?? positionFor(initialLeaderKey);
  const currentReportsTo = positionFor(reportingTargetFor(currentSubject?.stableKey ?? null));

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-guided-approval-reporting={kind}>
      <section className="rounded-xl border border-border bg-surface p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Konfigurasi saat ini
        </p>
        <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{node ? "Pimpinan struktur" : "Posisi"}</dt>
            <dd className="font-bold text-brand-heading">{currentSubject?.title ?? "Belum ditetapkan"}</dd>
            <dd className="text-xs text-muted-foreground">{organizationPositionHolder(currentSubject)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Melapor kepada</dt>
            <dd className="font-bold text-brand-heading">{currentReportsTo?.title ?? "Belum ditetapkan"}</dd>
            <dd className="text-xs text-muted-foreground">{organizationPositionHolder(currentReportsTo)}</dd>
          </div>
        </dl>
      </section>

      {node ? (
        <Field label="Pimpinan struktur" hint="posisi pimpinan yang dipilih secara eksplisit">
          <PositionPicker
            name="leaderPositionKey"
            value={leaderKey}
            onChange={(key) => {
              setLeaderKey(key);
              setReportsToKey(reportingTargetFor(key));
            }}
            positions={data.positions.filter((position) => position.nodeKey === node.stableKey)}
            nodes={data.nodes}
            emptyLabel="Belum ditetapkan"
          />
        </Field>
      ) : null}

      <Field label="Atasan posisi" hint="hubungan reporting; tidak mengikuti tampilan chart">
        <PositionPicker
          name="reportsToPositionKey"
          value={reportsToKey}
          onChange={setReportsToKey}
          positions={data.positions.filter((position) =>
            position.stableKey !== (sourcePosition?.stableKey ?? leaderKey),
          )}
          nodes={data.nodes}
          emptyLabel="Atasan struktural belum ditetapkan"
        />
      </Field>
      {!reportsToKey ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Atasan struktural belum ditetapkan.
        </p>
      ) : null}

      {node ? (
        <Field label="Penyetuju unit" hint="posisi authority untuk permintaan baru saat Struktur aktif">
          <PositionPicker
            name="unitApproverPositionKey"
            value={unitApproverKey}
            onChange={setUnitApproverKey}
            positions={data.positions}
            nodes={data.nodes}
            emptyLabel="Belum ditetapkan"
          />
        </Field>
      ) : (
        <details className="rounded-xl border border-border bg-surface p-3">
          <summary className="cursor-pointer text-sm font-bold text-brand-heading">
            Governance
          </summary>
          <div className="mt-4 space-y-4">
            <Field label="Penyetuju governance" hint="opsional dan selalu dipilih eksplisit">
              <PositionPicker
                name="governanceApproverPositionKey"
                value={governanceApproverKey}
                onChange={setGovernanceApproverKey}
                positions={data.positions.filter((position) => position.stableKey !== sourcePosition?.stableKey)}
                nodes={data.nodes}
                emptyLabel="Belum ditetapkan"
              />
            </Field>
            <Field label="Atasan / oversight governance" hint="penerima informasi di atas authority ini">
              <PositionPicker
                name="oversightParentPositionKey"
                value={oversightParentKey}
                onChange={setOversightParentKey}
                positions={data.positions.filter((position) => position.stableKey !== sourcePosition?.stableKey)}
                nodes={data.nodes}
                emptyLabel="Belum ditetapkan"
              />
            </Field>
          </div>
        </details>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        Hanya hubungan yang Anda pilih yang disimpan. Sistem tidak membuat authority dari nama jabatan, hierarchy, atau rank visual.
      </p>
      <SubmitRow saving={saving} onCancel={onCancel} label="Simpan Approval & Reporting" />
    </form>
  );
}

export function LeaderEditor({
  node,
  data,
  employees,
  accounts,
  saving,
  onCancel,
  onSubmit,
}: {
  node: OrganizationNode;
  data: OrganizationDesignerView;
  employees: OrganizationEmployeeOption[];
  accounts: OrganizationAccountOption[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const positions = data.positions.filter((position) => position.nodeKey === node.stableKey);
  const currentLeader = positions.find((position) => position.stableKey === node.leaderPositionKey) ?? null;
  const [leaderMode, setLeaderMode] = useState<"existing" | "new">(
    positions.length > 0 ? "existing" : "new",
  );
  const [positionKey, setPositionKey] = useState<string | null>(
    currentLeader?.stableKey ?? positions[0]?.stableKey ?? null,
  );
  const [holderMode, setHolderMode] = useState<"KEEP" | "EMPLOYEE" | "ACCOUNT" | "VACANT">(
    currentLeader ? "KEEP" : "VACANT",
  );
  const reportTargetFor = (key: string | null) => {
    if (!key) return null;
    const binding = data.bindings.find((item) =>
      item.sourceType === "POSITION" &&
      item.sourceKey === key &&
      item.authorityType === "SUPERVISORY_PARENT",
    );
    return binding?.targetPositionKey
      ?? data.positions.find((position) => position.stableKey === key)?.parentPositionKey
      ?? null;
  };
  const [reportsToKey, setReportsToKey] = useState(reportTargetFor(positionKey));
  const selectedPosition = data.positions.find((position) => position.stableKey === positionKey) ?? null;

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-guided-leader>
      <section className="rounded-xl border border-border bg-surface p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pimpinan saat ini</p>
        <p className="mt-1 text-sm font-bold text-brand-heading">
          {currentLeader?.title ?? "Belum ditetapkan"}
        </p>
        <p className="text-xs text-muted-foreground">{organizationPositionHolder(currentLeader)}</p>
      </section>

      <Field label="Jabatan">
        <select
          name="leaderMode"
          value={leaderMode}
          onChange={(event) => {
            const mode = event.target.value as "existing" | "new";
            setLeaderMode(mode);
            setHolderMode(mode === "existing" && currentLeader ? "KEEP" : "VACANT");
          }}
          className={inputClass}
        >
          {positions.length > 0 ? <option value="existing">Gunakan jabatan yang ada</option> : null}
          <option value="new">Buat jabatan pimpinan baru</option>
        </select>
      </Field>
      {leaderMode === "existing" ? (
        <PositionPicker
          name="positionKey"
          value={positionKey}
          onChange={(key) => {
            setPositionKey(key);
            setReportsToKey(reportTargetFor(key));
            setHolderMode("KEEP");
          }}
          positions={positions}
          nodes={data.nodes}
        />
      ) : (
        <Field label="Nama jabatan pimpinan">
          <input name="title" required placeholder="Contoh: Wakil Kepala Sekolah" className={inputClass} />
        </Field>
      )}

      <Field label="Pejabat">
        <select
          name="holderMode"
          value={holderMode}
          onChange={(event) => setHolderMode(event.target.value as typeof holderMode)}
          className={inputClass}
        >
          {leaderMode === "existing" ? <option value="KEEP">Pertahankan pejabat saat ini</option> : null}
          <option value="EMPLOYEE">Pegawai</option>
          <option value="ACCOUNT">Organ Yayasan</option>
          <option value="VACANT">VACANT · belum ada pejabat</option>
        </select>
      </Field>
      <input
        type="hidden"
        name="holderSource"
        value={holderMode === "ACCOUNT"
          ? "ACCOUNT"
          : holderMode === "KEEP" || holderMode === "VACANT"
            ? selectedPosition?.holderSource ?? "EMPLOYEE"
            : "EMPLOYEE"}
      />
      {holderMode === "EMPLOYEE" ? (
        <Field label="Pilih pegawai">
          <select name="employeeId" required className={inputClass}>
            <option value="">Pilih pegawai...</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.fullName} — {employee.employeeNumber}</option>
            ))}
          </select>
        </Field>
      ) : null}
      {holderMode === "ACCOUNT" ? (
        <Field label="Pilih Organ Yayasan" hint="account governance yang sudah ada">
          <select name="accountId" required className={inputClass}>
            <option value="">Pilih berdasarkan email...</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.email} · {account.status}</option>
            ))}
          </select>
        </Field>
      ) : null}
      {holderMode === "EMPLOYEE" ? (
        <Field label="Jenis penugasan">
          <select name="assignmentType" className={inputClass}>
            <option value="PRIMARY_STRUCTURAL">Jabatan utama</option>
            <option value="SECONDARY">Rangkap jabatan</option>
          </select>
        </Field>
      ) : (
        <input type="hidden" name="assignmentType" value="SECONDARY" />
      )}

      <Field label="Melapor kepada" hint="pilihan eksplisit; tidak diinferensikan dari hierarchy">
        <PositionPicker
          name="parentPositionKey"
          value={reportsToKey}
          onChange={setReportsToKey}
          positions={data.positions.filter((position) => position.stableKey !== positionKey)}
          nodes={data.nodes}
          emptyLabel="Atasan struktural belum ditetapkan"
        />
      </Field>
      {!reportsToKey ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Atasan struktural belum ditetapkan.
        </p>
      ) : null}
      <SubmitRow saving={saving} onCancel={onCancel} label="Simpan pimpinan" />
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
    acting ? "EMPLOYEE" : (position.holderSource ?? "EMPLOYEE"),
  );

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
      data-holder-source={holderSource}
    >
      <div className="rounded-xl bg-surface p-3 text-sm font-bold text-brand-heading">
        {position.title}
      </div>
      {!acting ? (
        <Field
          label="Jenis pejabat"
          hint="pilihan ini tidak memberikan permission"
        >
          <select
            name="holderSource"
            value={holderSource}
            onChange={(event) =>
              setHolderSource(event.target.value as "EMPLOYEE" | "ACCOUNT")
            }
            className={inputClass}
          >
            <option value="EMPLOYEE">Pegawai</option>
            <option value="ACCOUNT">Organ Yayasan</option>
          </select>
        </Field>
      ) : (
        <input type="hidden" name="holderSource" value="EMPLOYEE" />
      )}

      {holderSource === "ACCOUNT" ? (
        <>
          <Field
            label="Account Organ Yayasan"
            hint="account FOUNDATION_BOARD yang sudah ada"
          >
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
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-4 text-amber-900">
              Belum ada account FOUNDATION_BOARD yang dapat dipilih. Account
              tidak dibuat atau diaktifkan otomatis.
            </p>
          ) : null}
          <a
            href="/admin/access"
            className="inline-flex text-xs font-bold text-brand-primary-deep hover:underline"
          >
            Kelola Account Organ Yayasan
          </a>
        </>
      ) : (
        <Field label={acting ? "Pegawai pelaksana tugas" : "Pegawai"}>
          <select
            name="employeeId"
            required
            defaultValue={
              acting
                ? (position.actingIncumbent?.employeeId ?? "")
                : (position.primaryIncumbent?.employeeId ?? "")
            }
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
        <Field
          label="Jenis penugasan"
          hint="Jabatan utama menjadi jangkar reporting pemohon; rangkap tetap dapat membawa kewenangan."
        >
          <select
            name="assignmentType"
            defaultValue={
              position.primaryIncumbent?.isPrimaryStructural
                ? "PRIMARY_STRUCTURAL"
                : "SECONDARY"
            }
            className={inputClass}
          >
            <option value="PRIMARY_STRUCTURAL">Jabatan utama</option>
            <option value="SECONDARY">Rangkap jabatan</option>
          </select>
        </Field>
      ) : null}

      {acting ? (
        <>
          <Field label="Mulai acting">
            <input
              type="date"
              name="actingFrom"
              required
              defaultValue={
                position.actingIncumbent?.effectiveFrom ?? effectiveOn
              }
              className={inputClass}
            />
          </Field>
          <Field label="Berakhir acting">
            <input
              type="date"
              name="actingTo"
              required
              defaultValue={position.actingIncumbent?.effectiveTo ?? ""}
              className={inputClass}
            />
          </Field>
        </>
      ) : (
        <Field label="Mulai menjabat">
          <input
            type="date"
            name="effectiveFrom"
            required
            defaultValue={
              position.primaryIncumbent?.effectiveFrom ?? effectiveOn
            }
            className={inputClass}
          />
        </Field>
      )}
      <SubmitRow saving={saving} onCancel={onCancel} label="Simpan penetapan" />
    </form>
  );
}

export function AdminOrganizationPage() {
  const [initialState] = useState(initialDesignerState);
  const [effectiveDate, setEffectiveDate] = useState(
    initialState.effectiveDate,
  );
  const [draftId, setDraftId] = useState<string | null>(initialState.draftId);
  const [data, setData] = useState<OrganizationDesignerView | null>(null);
  const [employees, setEmployees] = useState<OrganizationEmployeeOption[]>([]);
  const [boardAccounts, setBoardAccounts] = useState<
    OrganizationAccountOption[]
  >([]);
  const [selection, setSelection] = useState<OrganizationSelection>(null);
  const [action, setAction] = useState<EditorAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [validation, setValidation] =
    useState<OrganizationValidationReport | null>(null);
  const [impact, setImpact] = useState<OrganizationImpactPreview | null>(null);
  const [preview, setPreview] = useState<OrganizationResolutionPreview | null>(
    null,
  );
  const [previewEmployeeId, setPreviewEmployeeId] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rollout, setRollout] = useState<OrganizationRolloutConfiguration | null>(null);

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
  useEffect(() => {
    void listOrganizationEmployees()
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);
  useEffect(() => {
    void listFoundationBoardAccounts()
      .then(setBoardAccounts)
      .catch(() => setBoardAccounts([]));
  }, []);
  useEffect(() => {
    void getOrganizationRollout()
      .then(setRollout)
      .catch(() => setRollout(null));
  }, []);

  const selectedNode = useMemo(
    () =>
      selection?.kind === "node"
        ? (data?.nodes.find((node) => node.stableKey === selection.key) ?? null)
        : null,
    [data?.nodes, selection],
  );
  const selectedPosition = useMemo(
    () =>
      selection?.kind === "position"
        ? (data?.positions.find(
            (position) => position.stableKey === selection.key,
          ) ?? null)
        : null,
    [data?.positions, selection],
  );
  const selectedPositionNode = useMemo(
    () =>
      selectedPosition
        ? (data?.nodes.find(
            (node) => node.stableKey === selectedPosition.nodeKey,
          ) ?? null)
        : null,
    [data?.nodes, selectedPosition],
  );
  const selectedParentNode = useMemo(
    () =>
      selectedNode?.parentNodeKey
        ? (data?.nodes.find(
            (node) => node.stableKey === selectedNode.parentNodeKey,
          ) ?? null)
        : null,
    [data?.nodes, selectedNode],
  );
  const selectedParentPosition = useMemo(
    () =>
      selectedPosition?.parentPositionKey
        ? (data?.positions.find(
            (position) =>
              position.stableKey === selectedPosition.parentPositionKey,
          ) ?? null)
        : null,
    [data?.positions, selectedPosition],
  );
  const selectedLeaderPosition = useMemo(
    () => selectedNode?.leaderPositionKey
      ? data?.positions.find((position) => position.stableKey === selectedNode.leaderPositionKey) ?? null
      : null,
    [data?.positions, selectedNode],
  );
  const approvalSubjectPosition = selectedPosition ?? selectedLeaderPosition;
  const selectedReportsToPosition = useMemo(() => {
    if (!approvalSubjectPosition) return null;
    const bindingTarget = data?.bindings.find((binding) =>
      binding.sourceType === "POSITION" &&
      binding.sourceKey === approvalSubjectPosition.stableKey &&
      binding.authorityType === "SUPERVISORY_PARENT",
    )?.targetPositionKey;
    const targetKey = bindingTarget ?? approvalSubjectPosition.parentPositionKey;
    return targetKey
      ? data?.positions.find((position) => position.stableKey === targetKey) ?? null
      : null;
  }, [approvalSubjectPosition, data?.bindings, data?.positions]);
  const selectedUnitApproverPosition = useMemo(() => {
    const nodeKey = selectedNode?.stableKey ?? selectedPositionNode?.stableKey;
    const targetKey = nodeKey
      ? data?.bindings.find((binding) =>
        binding.sourceType === "NODE" &&
        binding.sourceKey === nodeKey &&
        binding.authorityType === "UNIT_APPROVER",
      )?.targetPositionKey
      : null;
    return targetKey
      ? data?.positions.find((position) => position.stableKey === targetKey) ?? null
      : null;
  }, [data?.bindings, data?.positions, selectedNode, selectedPositionNode]);
  const selectedGovernancePosition = useMemo(() => {
    if (!selectedPosition) return null;
    const targetKey = data?.bindings.find((binding) =>
      binding.sourceType === "POSITION" &&
      binding.sourceKey === selectedPosition.stableKey &&
      binding.authorityType === "GOVERNANCE_APPROVER",
    )?.targetPositionKey;
    return targetKey
      ? data?.positions.find((position) => position.stableKey === targetKey) ?? null
      : null;
  }, [data?.bindings, data?.positions, selectedPosition]);
  const selectedOversightPosition = useMemo(() => {
    if (!selectedPosition) return null;
    const targetKey = data?.bindings.find((binding) =>
      binding.sourceType === "POSITION" &&
      binding.sourceKey === selectedPosition.stableKey &&
      binding.authorityType === "OVERSIGHT_PARENT",
    )?.targetPositionKey;
    return targetKey
      ? data?.positions.find((position) => position.stableKey === targetKey) ?? null
      : null;
  }, [data?.bindings, data?.positions, selectedPosition]);
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
      current = current.parentNodeKey
        ? byKey.get(current.parentNodeKey)
        : undefined;
    }
    return path;
  }, [data, selectedNode, selectedPositionNode]);
  const canEdit = data?.draft?.status === "DRAFT";
  const hasActiveDraft =
    data?.draft?.status === "DRAFT" || data?.draft?.status === "VALIDATED";
  const status = organizationStatusCopy(data?.mode ?? "CURRENT", data?.draft?.status);
  const pendingDeletionImpact = useMemo(
    () =>
      action?.type === "delete-node" && data
        ? subtreeDeletionImpact(data, action.node)
        : null,
    [action, data],
  );
  const pendingGroupDeletionImpact = useMemo(
    () =>
      action?.type === "delete-group" && data
        ? groupDeletionImpact(data, action.node)
        : null,
    [action, data],
  );
  const pendingPositionDeletionImpact = useMemo(
    () =>
      action?.type === "delete-position" && data
        ? positionDeletionImpact(data, action.position)
        : null,
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

  const startFromEmpty = () =>
    canEdit
      ? setAction({ type: "node", mode: "root" })
      : setAction({ type: "draft" });

  const handleDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    void createOrganizationDraft({
      name: String(form.get("name")),
      effectiveOn: String(form.get("effectiveOn")),
    })
      .then((draft) => {
        setDraftId(draft.id);
        setEffectiveDate(draft.effectiveOn);
        setAction(null);
        setNotice("Draft restrukturisasi siap diedit.");
      })
      .catch((cause: unknown) =>
        setError(errorMessage(cause, "Draft tidak dapat dibuat.")),
      )
      .finally(() => setSaving(false));
  };

  const handleNode = (
    event: FormEvent<HTMLFormElement>,
    editor: Extract<EditorAction, { type: "node" }>,
  ) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    if (editor.mode === "move" && editor.node) {
      void mutate(
        () =>
          updateOrganizationNode(data.draft!.id, editor.node!.id, {
            parentNodeKey: String(form.get("parentNodeKey")) || null,
          }),
        "Kelompok dipindahkan ke induk struktural baru.",
      );
      return;
    }
    const input = {
      name: String(form.get("name")),
      nodeType: String(form.get("nodeType")),
      parentNodeKey: editor.mode === "child" && String(form.get("placement")) === "sibling"
        ? (editor.node?.parentNodeKey ?? null)
        : String(form.get("parentNodeKey")) || null,
      visualRankOffset: Number(form.get("visualRankOffset")),
      integrationCode: String(form.get("integrationCode")) || null,
    };
    void mutate(
      () =>
        editor.mode === "edit" && editor.node
          ? updateOrganizationNode(data.draft!.id, editor.node.id, input)
          : createOrganizationNode(data.draft!.id, input),
      editor.mode === "edit"
        ? "Kelompok diperbarui."
        : "Kelompok ditambahkan ke chart.",
    );
  };

  const handlePosition = (
    event: FormEvent<HTMLFormElement>,
    editor: Extract<EditorAction, { type: "position" }>,
  ) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    if (editor.mode === "move" && editor.position) {
      void mutate(
        () =>
          updateOrganizationPosition(data.draft!.id, editor.position!.id, {
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
      vacancyPolicy: String(
        form.get("vacancyPolicy"),
      ) as OrganizationVacancyPolicy,
      singleIncumbent: true,
      visualRankOffset: Number(form.get("visualRankOffset")),
      holderSource: String(form.get("holderSource") || "EMPLOYEE") as
        "EMPLOYEE" | "ACCOUNT",
    };
    void mutate(
      () =>
        editor.mode === "edit" && editor.position
          ? updateOrganizationPosition(
              data.draft!.id,
              editor.position.id,
              input,
            )
          : createOrganizationPosition(data.draft!.id, input),
      editor.mode === "edit" ? "Posisi diperbarui." : "Posisi ditambahkan.",
    );
  };

  const handleIncumbency = (
    event: FormEvent<HTMLFormElement>,
    editor: Extract<EditorAction, { type: "incumbency" }>,
  ) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    const holderSource = String(
      form.get("holderSource") || editor.position.holderSource || "EMPLOYEE",
    ) as "EMPLOYEE" | "ACCOUNT";
    void mutate(
      () =>
        replaceOrganizationIncumbencies(data.draft!.id, {
          positionKey: editor.position.stableKey,
          holderSource,
          primaryEmployeeId:
            holderSource === "ACCOUNT"
              ? null
              : editor.acting
                ? (editor.position.primaryIncumbent?.employeeId ?? null)
                : String(form.get("employeeId")) || null,
          primaryAccountId:
            holderSource === "ACCOUNT"
              ? String(form.get("accountId")) || null
              : null,
          actingEmployeeId:
            holderSource === "ACCOUNT"
              ? null
              : editor.acting
                ? String(form.get("employeeId")) || null
                : (editor.position.actingIncumbent?.employeeId ?? null),
          actingFrom:
            holderSource === "ACCOUNT"
              ? null
              : editor.acting
                ? String(form.get("actingFrom"))
                : (editor.position.actingIncumbent?.effectiveFrom ?? null),
          actingTo:
            holderSource === "ACCOUNT"
              ? null
              : editor.acting
                ? String(form.get("actingTo"))
                : (editor.position.actingIncumbent?.effectiveTo ?? null),
          effectiveFrom: String(
            form.get("effectiveFrom") || data.draft!.effectiveOn,
          ),
          assignmentType: editor.acting
            ? undefined
            : (String(form.get("assignmentType") || "SECONDARY") as
                "PRIMARY_STRUCTURAL" | "SECONDARY"),
        }),
      editor.acting
        ? "Pelaksana tugas diperbarui."
        : "Pejabat utama diperbarui.",
    );
  };

  const handleLeader = (
    event: FormEvent<HTMLFormElement>,
    editor: Extract<EditorAction, { type: "leader" }>,
  ) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    const useExisting = String(form.get("leaderMode")) === "existing";
    const holderSource = String(form.get("holderSource")) as "EMPLOYEE" | "ACCOUNT";
    const holderMode = String(form.get("holderMode"));
    const replaceHolder = holderMode !== "KEEP";
    void mutate(
      () => configureOrganizationLeader(data.draft!.id, {
        nodeKey: editor.node.stableKey,
        positionKey: useExisting ? String(form.get("positionKey")) || null : null,
        title: useExisting ? undefined : String(form.get("title")),
        holderSource,
        primaryEmployeeId: holderSource === "EMPLOYEE" && replaceHolder
          ? holderMode === "EMPLOYEE" ? String(form.get("employeeId")) || null : null
          : undefined,
        primaryAccountId: holderSource === "ACCOUNT" && replaceHolder
          ? holderMode === "ACCOUNT" ? String(form.get("accountId")) || null : null
          : undefined,
        assignmentType: String(form.get("assignmentType") || "PRIMARY_STRUCTURAL") as "PRIMARY_STRUCTURAL" | "SECONDARY",
        parentPositionKey: String(form.get("parentPositionKey")) || null,
        effectiveFrom: data.draft!.effectiveOn,
      }),
      "Pimpinan struktur diperbarui.",
    );
  };

  const markVacant = (position: OrganizationPosition) => {
    if (!data?.draft) return;
    void mutate(
      () =>
        replaceOrganizationIncumbencies(data.draft!.id, {
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
      () =>
        replaceOrganizationIncumbencies(data.draft!.id, {
          positionKey: position.stableKey,
          primaryEmployeeId: position.primaryIncumbent?.employeeId ?? null,
          actingEmployeeId: null,
          effectiveFrom: data.draft!.effectiveOn,
        }),
      "Penugasan pelaksana tugas dihapus.",
    );
  };

  const handleMembers = (
    event: FormEvent<HTMLFormElement>,
    editor: Extract<EditorAction, { type: "members" }>,
  ) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    void mutate(
      () =>
        replaceOrganizationMemberships(data.draft!.id, {
          nodeKey: editor.node.stableKey,
          memberships: form.getAll("employeeIds").map(String).map((employeeId) => ({
            employeeId,
            isPrimary: form.getAll("primaryEmployeeIds").map(String).includes(employeeId),
          })),
          confirmPrimarySwitchEmployeeIds: form.getAll("confirmPrimarySwitchEmployeeIds").map(String),
          effectiveFrom: data.draft!.effectiveOn,
        }),
      "Keanggotaan kelompok diperbarui.",
    );
  };

  const handleVisual = (
    event: FormEvent<HTMLFormElement>,
    editor: Extract<EditorAction, { type: "visual" }>,
  ) => {
    event.preventDefault();
    if (!data?.draft) return;
    const offset = Number(
      new FormData(event.currentTarget).get("visualRankOffset"),
    );
    void mutate(
      () =>
        editor.kind === "node"
          ? updateOrganizationNode(data.draft!.id, editor.item.id, {
              visualRankOffset: offset,
            })
          : updateOrganizationPosition(data.draft!.id, editor.item.id, {
              visualRankOffset: offset,
            }),
      "Rank visual diperbarui tanpa mengubah hubungan struktural.",
    );
  };

  const handleAuthority = (
    event: FormEvent<HTMLFormElement>,
    editor: Extract<EditorAction, { type: "authority" }>,
  ) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    void mutate(
      () =>
        createOrganizationAuthorityBinding(data.draft!.id, {
          sourceType: editor.kind === "node" ? "NODE" : "POSITION",
          sourceKey: editor.item.stableKey,
          authorityType: String(form.get("authorityType")) as
            | "SUPERVISORY_PARENT"
            | "LEADER"
            | "UNIT_APPROVER"
            | "GOVERNANCE_APPROVER"
            | "OVERSIGHT_PARENT",
          targetPositionKey: String(form.get("targetPositionKey")),
          vacancyPolicy: String(
            form.get("vacancyPolicy"),
          ) as OrganizationVacancyPolicy,
          effectiveFrom: data.draft!.effectiveOn,
          effectiveTo: null,
        }),
      "Hubungan kewenangan disimpan.",
    );
  };

  const handleApprovalReporting = (
    event: FormEvent<HTMLFormElement>,
    editor: Extract<EditorAction, { type: "approval-reporting" }>,
  ) => {
    event.preventDefault();
    if (!data?.draft) return;
    const form = new FormData(event.currentTarget);
    const positionKey = (name: string) => String(form.get(name)) || null;
    void mutate(
      () => configureOrganizationApprovalReporting(data.draft!.id, {
        sourceType: editor.kind === "node" ? "NODE" : "POSITION",
        sourceKey: editor.item.stableKey,
        ...(editor.kind === "node" ? {
          leaderPositionKey: positionKey("leaderPositionKey"),
          reportsToPositionKey: positionKey("reportsToPositionKey"),
          unitApproverPositionKey: positionKey("unitApproverPositionKey"),
        } : {
          reportsToPositionKey: positionKey("reportsToPositionKey"),
          governanceApproverPositionKey: positionKey("governanceApproverPositionKey"),
          oversightParentPositionKey: positionKey("oversightParentPositionKey"),
        }),
        effectiveFrom: data.draft!.effectiveOn,
      }),
      "Approval & Reporting diperbarui tanpa inferensi authority.",
    );
  };

  const runValidation = async () => {
    if (!data?.draft) return;
    setSaving(true);
    setError(null);
    try {
      const report = await validateOrganizationDraft(data.draft.id);
      setValidation(report);
      setNotice(
        report.valid ? "Draft valid dan siap ditinjau dampaknya." : null,
      );
      await reload();
    } catch (cause) {
      setError(errorMessage(cause, "Validasi draft gagal dijalankan."));
    } finally {
      setSaving(false);
    }
  };

  const runImpact = async () => {
    if (!data?.draft) return;
    setSaving(true);
    setError(null);
    try {
      setImpact(await getOrganizationImpact(data.draft.id));
    } catch (cause) {
      setError(errorMessage(cause, "Preview dampak tidak dapat dimuat."));
    } finally {
      setSaving(false);
    }
  };

  const runPublish = async () => {
    if (
      !data?.draft ||
      !window.confirm(
        data.isSameDayRevision
          ? `Publikasikan revisi struktur untuk ${displayDate(data.draft.effectiveOn)}? Versi sebelumnya tetap tersimpan sebagai histori. Revisi ini menjadi versi aktif terbaru untuk tanggal tersebut.`
          : `Publikasikan struktur efektif ${displayDate(data.draft.effectiveOn)}?`,
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      await publishOrganizationDraft(data.draft.id);
      setDraftId(null);
      setSelection(null);
      setValidation(null);
      setImpact(null);
      setNotice(
        "Struktur dipublikasikan. Struktur masa depan tidak aktif sebelum tanggal efektifnya.",
      );
    } catch (cause) {
      setError(errorMessage(cause, "Draft tidak dapat dipublikasikan."));
    } finally {
      setSaving(false);
    }
  };

  const deleteNodeSubtree = (node: OrganizationNode) => {
    if (!data?.draft) return;
    void mutate(
      () => deleteOrganizationNode(data.draft!.id, node.id),
      "Kelompok dan seluruh subtree draft-nya dihapus. Histori terpublikasi tidak berubah.",
    ).then(() => setSelection(null));
  };
  const deleteGroup = (node: OrganizationNode) => {
    if (!data?.draft) return;
    void mutate(
      () => deleteOrganizationGroup(data.draft!.id, node.id),
      "Kelompok draft dihapus. Histori terpublikasi tidak berubah.",
    ).then(() => setSelection(null));
  };
  const deletePosition = (position: OrganizationPosition) => {
    if (!data?.draft) return;
    void mutate(
      () => deleteOrganizationPosition(data.draft!.id, position.id),
      "Posisi draft dihapus. Histori terpublikasi tidak berubah.",
    ).then(() => setSelection(null));
  };

  const discardDraft = async () => {
    if (!data?.draft) return;
    setSaving(true);
    setError(null);
    try {
      await discardOrganizationDraft(data.draft.id);
      setAction(null);
      setDraftId(null);
      setSelection(null);
      setNotice(
        "Draft yang belum dipublikasikan telah dibuang. Histori terpublikasi tetap utuh.",
      );
    } catch (cause) {
      setError(errorMessage(cause, "Draft tidak dapat dibuang."));
    } finally {
      setSaving(false);
    }
  };

  const runResolutionPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data?.draft || !previewEmployeeId) return;
    setPreviewLoading(true);
    setError(null);
    try {
      setPreview(
        await previewOrganizationResolution(data.draft.id, {
          employeeId: previewEmployeeId,
          workflowKey: "LEAVE",
          effectiveDate: data.draft.effectiveOn,
        }),
      );
    } catch (cause) {
      setError(
        errorMessage(cause, "Preview rantai approval tidak dapat dimuat."),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <AdminShell
      active="organization"
      title="Organization Designer"
      description="Gambar struktur, posisi, dan kewenangan berdasarkan tanggal efektif. Hubungan approval tetap dihitung dan divalidasi oleh server."
      workspace
    >
      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}
      <section
        className={cn(
          "flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-soft)] lg:h-full lg:min-h-0",
          canEdit
            ? "border-amber-300 ring-4 ring-amber-100/60"
            : "border-border/70",
        )}
        data-organization-workspace
      >
        {selectedPath.length > 0 ? (
          <nav
            aria-label="Jalur struktural terpilih"
            className="flex flex-wrap items-center gap-1 border-b border-border/70 bg-white px-5 py-2.5 text-xs text-muted-foreground"
          >
            {selectedPath.map((node, index) => (
              <span key={node.stableKey} className="contents">
                {index > 0 ? (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setSelection({ kind: "node", key: node.stableKey })
                  }
                  className="rounded-md px-1.5 py-1 font-semibold hover:bg-muted hover:text-brand-heading"
                >
                  {node.name}
                </button>
              </span>
            ))}
            {selectedPosition ? (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="rounded-md bg-brand-primary-pale px-1.5 py-1 font-bold text-brand-primary-deep">
                  {selectedPosition.title}
                </span>
              </>
            ) : null}
          </nav>
        ) : null}

        <div
          className={cn(
            "relative grid min-h-0 flex-1 bg-[#f8fbfa]",
            selectedNode || selectedPosition
              ? "xl:grid-cols-[minmax(0,1fr)_20rem]"
              : "grid-cols-1",
          )}
        >
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm font-semibold text-muted-foreground">
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Memuat
              chart...
            </div>
          ) : null}
          <OrganizationChart
            nodes={data?.nodes ?? []}
            positions={data?.positions ?? []}
            selection={selection}
            onSelect={setSelection}
            canEdit={Boolean(canEdit)}
            onStart={startFromEmpty}
            toolbarContext={
              <>
                <label className="sr-only" htmlFor="organization-effective-date">Lihat struktur pada tanggal</label>
                <span className="relative block">
                  <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input id="organization-effective-date" type="date" value={effectiveDate} onChange={(event) => { setDraftId(null); setEffectiveDate(event.target.value); setSelection(null); }} className="h-8 w-[8.7rem] rounded-lg border border-border bg-white pl-7 pr-1.5 text-xs font-semibold outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10" />
                </span>
                <span className={cn("ml-1 rounded-full px-2 py-1 text-xs font-bold", status.className)}>{data?.draft?.status === "PUBLISHED" ? data.mode === "FUTURE" ? "Diterbitkan · belum aktif" : "Diterbitkan · hanya baca" : status.label}</span>
                {data?.draft ? <div className="ml-1 hidden min-w-0 sm:block" data-organization-version-summary><p className={cn("max-w-40 truncate text-xs font-bold", canEdit ? "text-amber-900" : "text-brand-heading")}>{data.draft.name}</p><p className={cn("text-xs", canEdit ? "text-amber-800" : "text-muted-foreground")}>Efektif {displayDate(data.draft.effectiveOn)}{data.isSameDayRevision ? " · Koreksi tanggal yang sama" : ""}</p>{data.draft.status !== "PUBLISHED" ? <p className="text-xs text-amber-800">{data.draft.baseChangeSetId ? "Berdasarkan versi terbit sebelumnya" : "Dimulai dari struktur kosong"}</p> : null}</div> : null}
              </>
            }
            toolbarActions={
              !hasActiveDraft ? <button type="button" onClick={() => setAction({ type: "draft" })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2 text-xs font-bold hover:bg-muted"><CalendarClock className="h-3.5 w-3.5" /> {data?.draft?.status === "PUBLISHED" ? "Buat draft koreksi" : "Jadwalkan perubahan"}</button> : <>{canEdit ? <button type="button" disabled={saving} onClick={() => void runValidation()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2 text-xs font-bold text-amber-900 hover:bg-amber-50 disabled:opacity-60"><ShieldCheck className="h-3.5 w-3.5" /> Validasi</button> : null}<button type="button" disabled={saving} onClick={() => void runImpact()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2 text-xs font-bold hover:bg-muted disabled:opacity-60"><Eye className="h-3.5 w-3.5" /> Preview dampak</button><button type="button" disabled={saving || data?.draft?.status !== "VALIDATED"} onClick={() => void runPublish()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-primary px-2 text-xs font-bold text-white hover:bg-brand-primary-deep disabled:opacity-50"><Rocket className="h-3.5 w-3.5" /> Publikasikan</button><button type="button" disabled={saving} onClick={() => setAction({ type: "discard-draft" })} className="hidden h-8 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50 xl:inline-flex"><Trash2 className="h-3.5 w-3.5" /> Buang draft</button></>
            }
          />

          {selectedNode || selectedPosition ? (
            <aside
              aria-label="Inspector pilihan struktur"
              className="min-h-0 overflow-y-auto border-t border-border/70 bg-white p-4 xl:border-t-0 xl:border-l"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Dipilih
                  </p>
                  <h2 className="mt-1 break-words text-base font-bold text-brand-heading">
                    {selectedNode?.name ?? selectedPosition?.title}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedNode
                      ? organizationNodeTypeLabel(selectedNode.nodeType)
                      : "Posisi organisasi"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Tutup inspector"
                  onClick={() => setSelection(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <dl className="mt-4 space-y-3 rounded-xl bg-surface p-3 text-xs">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Induk struktural
                  </dt>
                  <dd className="mt-1 font-semibold text-brand-heading">
                    {selectedNode
                      ? (selectedParentNode?.name ?? "Paling atas")
                      : (selectedParentPosition?.title ??
                        selectedPositionNode?.name ??
                        "Paling atas")}
                  </dd>
                </div>
                {selectedNode ? (
                  <>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Posisi
                      </dt>
                      <dd className="mt-1 font-semibold text-brand-heading">
                        {data?.positions.filter(
                          (position) =>
                            position.nodeKey === selectedNode.stableKey,
                        ).length ?? 0}{" "}
                        posisi
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Anggota
                      </dt>
                      <dd className="mt-1 font-semibold text-brand-heading">
                        {selectedNode.memberCount} anggota
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Kelompok
                      </dt>
                      <dd className="mt-1 font-semibold text-brand-heading">
                        {selectedPositionNode?.name ?? "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Pejabat
                      </dt>
                      <dd
                        title={
                          selectedPosition?.primaryIncumbent?.accountEmail ??
                          selectedPosition?.primaryIncumbent?.employeeName
                        }
                        className="mt-1 truncate font-semibold text-brand-heading"
                      >
                        {selectedPosition?.holderSource === "ACCOUNT"
                          ? (selectedPosition.primaryIncumbent?.accountEmail ??
                            selectedPosition.primaryIncumbent?.employeeName ??
                            "VACANT")
                          : (selectedPosition?.primaryIncumbent?.employeeName ??
                            "VACANT")}
                      </dd>
                      {selectedPosition?.holderSource === "ACCOUNT" ? (
                        <dd className="mt-0.5 truncate text-xs text-muted-foreground">
                          Organ Yayasan ·{" "}
                          {selectedPosition.primaryIncumbent?.accountStatus ??
                            "belum ditetapkan"}
                        </dd>
                      ) : null}
                    </div>
                    {selectedPosition?.actingIncumbent ? (
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-wide text-blue-800">
                          Pelaksana tugas
                        </dt>
                        <dd className="mt-1 font-bold text-blue-950">
                          {selectedPosition.actingIncumbent.employeeName}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Penugasan
                      </dt>
                      <dd className="mt-1 font-semibold text-brand-heading">
                        {selectedPosition?.primaryIncumbent?.isPrimaryStructural ? "Utama" : "Rangkap"}
                      </dd>
                    </div>
                  </>
                )}
                <div className="border-t border-border pt-3">
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Approval & Reporting
                  </dt>
                  <dd className="mt-3 space-y-3 text-sm text-brand-heading">
                    <span className="block">
                      <span className="block text-xs text-muted-foreground">Pimpinan</span>
                      <span className="block font-bold">{approvalSubjectPosition?.title ?? "Belum ditetapkan"}</span>
                      <span className="block text-xs text-muted-foreground">{organizationPositionHolder(approvalSubjectPosition)}</span>
                    </span>
                    <span className="block">
                      <span className="block text-xs text-muted-foreground">Melapor kepada</span>
                      <span className="block font-bold">{selectedReportsToPosition?.title ?? "Belum ditetapkan"}</span>
                      {selectedReportsToPosition ? <span className="block text-xs text-muted-foreground">{organizationPositionHolder(selectedReportsToPosition)}</span> : null}
                    </span>
                    <span className="block">
                      <span className="block text-xs text-muted-foreground">Penyetuju unit</span>
                      <span className="block font-bold">{selectedUnitApproverPosition?.title ?? "Belum ditetapkan"}</span>
                      {selectedUnitApproverPosition ? <span className="block text-xs text-muted-foreground">{organizationPositionHolder(selectedUnitApproverPosition)}</span> : null}
                    </span>
                    <span className="block">
                      <span className="block text-xs text-muted-foreground">Governance</span>
                      <span className="block font-bold">
                        {selectedPosition ? selectedGovernancePosition?.title ?? "Belum ditetapkan" : "Tidak berlaku"}
                      </span>
                      {selectedPosition && selectedOversightPosition ? (
                        <span className="block text-xs text-muted-foreground">
                          Oversight: {selectedOversightPosition.title} · {organizationPositionHolder(selectedOversightPosition)}
                        </span>
                      ) : null}
                    </span>
                    <span className="block">
                      <span className="block text-xs text-muted-foreground">Rollout</span>
                      <span className="block font-bold">
                        {rollout?.mode === "STRUCTURE" ? "Struktur" : rollout?.mode === "SHADOW" ? "Shadow" : rollout?.mode === "LEGACY" ? "Legacy" : "Tidak dapat dimuat"}
                      </span>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Penempatan tampilan
                  </dt>
                  <dd className="mt-1 font-semibold text-brand-heading">
                    {(selectedNode?.visualRankOffset ??
                      selectedPosition?.visualRankOffset ??
                      0) > 0
                      ? `Tampilkan ${selectedNode?.visualRankOffset ?? selectedPosition?.visualRankOffset} tingkat lebih rendah`
                      : "Tingkat normal"}
                  </dd>
                </div>
              </dl>

              {(selectedNode?.visualRankOffset ??
                selectedPosition?.visualRankOffset ??
                0) > 0 ? (
                <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-4 text-blue-900">
                  Penempatan ini hanya untuk tampilan chart. Hubungan
                  struktural, reporting, dan approval tidak berubah.
                </p>
              ) : null}

              {canEdit ? (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Tindakan
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {selectedNode ? (
                      <>
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "node",
                              mode: "child",
                              node: selectedNode,
                            })
                          }
                          icon={<GitBranchPlus />}
                        >
                          Tambah bagian / unit
                        </ActionButton>
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "leader",
                              node: selectedNode,
                            })
                          }
                          icon={<UserCog />}
                        >
                          Tetapkan pimpinan
                        </ActionButton>
                        <ActionButton
                          onClick={() =>
                            setAction({ type: "members", node: selectedNode })
                          }
                          icon={<UsersRound />}
                        >
                          Kelola anggota
                        </ActionButton>
                        <ActionButton
                          onClick={() => setAction({
                            type: "approval-reporting",
                            item: selectedNode,
                            kind: "node",
                          })}
                          icon={<Network />}
                        >
                          Approval & Reporting
                        </ActionButton>
                        <ActionButton onClick={() => setAction({ type: "node", mode: "edit", node: selectedNode })} icon={<ArrowRightLeft />}>
                          Edit struktur
                        </ActionButton>
                        <details className="col-span-2 mt-2 rounded-lg border border-border bg-surface p-2">
                          <summary className="cursor-pointer text-xs font-bold text-brand-heading">Pengaturan lanjutan</summary>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            <ActionButton onClick={() => setAction({ type: "position", mode: "create", nodeKey: selectedNode.stableKey })} icon={<BriefcaseBusiness />}>Tambah posisi tambahan</ActionButton>
                            <ActionButton onClick={() => setAction({ type: "authority", item: selectedNode, kind: "node" })} icon={<Network />}>Editor authority mentah</ActionButton>
                            <ActionButton onClick={() => setAction({ type: "visual", item: selectedNode, kind: "node" })} icon={<ArrowDownToLine />}>Tampilan</ActionButton>
                            <ActionButton onClick={() => setAction({ type: "node", mode: "move", node: selectedNode })} icon={<ArrowRightLeft />}>Pindahkan</ActionButton>
                          </div>
                        </details>
                        <div className="col-span-2 mt-2 rounded-lg border border-red-200 bg-red-50 p-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-red-800">Zona berbahaya</p>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            <ActionButton onClick={() => setAction({ type: "delete-group", node: selectedNode })} icon={<Trash2 />}>Hapus kelompok</ActionButton>
                            <ActionButton onClick={() => setAction({ type: "delete-node", node: selectedNode })} icon={<Trash2 />}>Hapus subtree</ActionButton>
                          </div>
                        </div>
                      </>
                    ) : selectedPosition ? (
                      <>
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "incumbency",
                              position: selectedPosition,
                              acting: false,
                            })
                          }
                          icon={<CircleUserRound />}
                        >
                          {selectedPosition.holderSource === "ACCOUNT"
                            ? "Ubah pejabat"
                            : "Ubah pejabat"}
                        </ActionButton>
                        {selectedPosition.holderSource !== "ACCOUNT" ? (
                          <ActionButton
                            onClick={() =>
                              setAction({
                                type: "incumbency",
                                position: selectedPosition,
                                acting: true,
                              })
                            }
                            icon={<UserCog />}
                          >
                            Atur PLT
                          </ActionButton>
                        ) : null}
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "position",
                              mode: "edit",
                              nodeKey: selectedPosition.nodeKey,
                              position: selectedPosition,
                            })
                          }
                          icon={<ArrowRightLeft />}
                        >
                          Edit jabatan
                        </ActionButton>
                        <ActionButton
                          onClick={() => setAction({
                            type: "approval-reporting",
                            item: selectedPosition,
                            kind: "position",
                          })}
                          icon={<Network />}
                        >
                          Approval & Reporting
                        </ActionButton>
                        <details className="col-span-2 mt-2 rounded-lg border border-border bg-surface p-2">
                          <summary className="cursor-pointer text-xs font-bold text-brand-heading">Pengaturan lanjutan</summary>
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <ActionButton
                          onClick={() => markVacant(selectedPosition)}
                          icon={<PanelRightClose />}
                        >
                          Tandai VACANT
                        </ActionButton>
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "position",
                              mode: "edit",
                              nodeKey: selectedPosition.nodeKey,
                              position: selectedPosition,
                            })
                          }
                          icon={<ShieldCheck />}
                        >
                          Kebijakan vacancy
                        </ActionButton>
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "authority",
                              item: selectedPosition,
                              kind: "position",
                            })
                          }
                          icon={<Network />}
                        >
                          Editor authority mentah
                        </ActionButton>
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "visual",
                              item: selectedPosition,
                              kind: "position",
                            })
                          }
                          icon={<ArrowDownToLine />}
                        >
                          Tampilan
                        </ActionButton>
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "position",
                              mode: "move",
                              nodeKey: selectedPosition.nodeKey,
                              position: selectedPosition,
                            })
                          }
                          icon={<ArrowRightLeft />}
                        >
                          Pindahkan
                        </ActionButton>
                        {selectedPosition.actingIncumbent ? (
                          <ActionButton
                            onClick={() => clearActing(selectedPosition)}
                            icon={<X />}
                          >
                            Hapus acting
                          </ActionButton>
                        ) : null}
                          </div>
                        </details>
                        <div className="col-span-2 mt-2 rounded-lg border border-red-200 bg-red-50 p-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-red-800">Zona berbahaya</p>
                        <ActionButton
                          onClick={() =>
                            setAction({
                              type: "delete-position",
                              position: selectedPosition,
                            })
                          }
                          icon={<Trash2 />}
                        >
                          Hapus posisi
                        </ActionButton>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Buat atau buka draft untuk mengubah item ini.
                </p>
              )}
            </aside>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 bg-white px-5 py-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-brand-primary bg-brand-primary-pale" />{" "}
            Posisi terisi
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-amber-400 bg-amber-50" />{" "}
            Posisi vacant nyata
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-5 bg-brand-primary/40" /> Hubungan
            struktural
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5 text-blue-700" /> Rank
            visual tidak mengubah reporting / approval
          </span>
        </div>
      </section>

      {validation ? (
        <section
          className={cn(
            "mt-5 rounded-2xl border p-5",
            validation.valid
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50",
          )}
        >
          <div className="flex items-center gap-2">
            {validation.valid ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-700" />
            )}
            <h2 className="text-base font-bold text-brand-heading">
              {validation.valid ? "Draft valid" : "Draft perlu diperbaiki"}
            </h2>
          </div>
          {validation.issues.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {validation.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`} className="rounded-xl border border-red-200 bg-white/70 p-3">
                  <p className="font-semibold text-red-900">{validationIssueCopy(issue.code)}</p>
                  <details className="mt-2 text-xs text-red-800">
                    <summary className="cursor-pointer font-semibold">Detail teknis</summary>
                    <p className="mt-1"><code>{issue.code}</code> · {issue.message}</p>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-emerald-800">
              Tidak ada cycle, overlap, atau authority configuration error yang
              ditemukan server.
            </p>
          )}
        </section>
      ) : null}

      {impact ? (
        <section className="mt-5 rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-brand-heading">
                Dampak restrukturisasi
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Hasil perbandingan dari server untuk tanggal efektif draft.
              </p>
            </div>
            {impact.noApprovalRoutingImpact ? (
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">
                Tidak ada dampak routing approval
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
                Routing perlu ditinjau
              </span>
            )}
          </div>
          <h3 className="mt-5 text-sm font-bold text-brand-heading">Perubahan draft</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <ImpactCard label="Struktur" count={impact.structureChanges.nodes} />
            <ImpactCard label="Posisi pimpinan" count={impact.structureChanges.positions} />
            <ImpactCard label="Keanggotaan" count={impact.structureChanges.memberships} />
            <ImpactCard label="Pejabat / penugasan" count={impact.structureChanges.incumbencies} />
            <ImpactCard label="Hubungan authority" count={impact.structureChanges.authorityRelationships} />
            <ImpactCard label="Hubungan reporting" count={impact.structureChanges.reportingRelationships} />
          </div>
          <h3 className="mt-5 text-sm font-bold text-brand-heading">Dampak resolusi workflow</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <ImpactCard
              label="Atasan langsung berubah"
              count={impact.directManagerChanges.length}
            />
            <ImpactCard
              label="Unit approver berubah"
              count={impact.unitApproverChanges.length}
            />
            <ImpactCard
              label="Jalur kewenangan"
              count={impact.authorityPathsAffected.length}
            />
            <ImpactCard
              label="Kewenangan vacant"
              count={impact.vacantAuthorities.length}
              tone="warning"
            />
            <ImpactCard
              label="Pegawai unresolved"
              count={impact.unresolvedEmployees.length}
              tone="warning"
            />
            <ImpactCard
              label="Perubahan visual saja"
              count={impact.visualOnlyChanges.length}
              tone="visual"
            />
          </div>
        </section>
      ) : null}

      {hasActiveDraft ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
          <article className="rounded-2xl border border-border/70 bg-white p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-primary-deep" />
              <h2 className="text-base font-bold text-brand-heading">
                Preview rantai approval
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Server membaca revisi yang dipilih, lalu memisahkan maksud struktur
              dari kesiapan akun workflow. Preview ini tidak membuat langkah approval.
            </p>
            <form
              onSubmit={(event) => void runResolutionPreview(event)}
              className="mt-4 flex flex-col gap-2 sm:flex-row"
            >
              <select
                required
                value={previewEmployeeId}
                onChange={(event) => setPreviewEmployeeId(event.target.value)}
                className={`${inputClass} min-w-0 flex-1`}
              >
                <option value="">Pilih pegawai...</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} — {employee.employeeNumber}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={previewLoading || !previewEmployeeId}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {previewLoading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}{" "}
                Preview
              </button>
            </form>
            {preview ? (
              <div className="mt-4 rounded-xl bg-surface p-4">
                <p className="text-xs font-bold text-brand-heading">
                  {preview.employee.fullName}
                </p>
                {preview.snapshot ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Revisi {preview.snapshot.status === "VALIDATED" ? "tervalidasi" : preview.snapshot.status === "DRAFT" ? "draft" : "terbit"}
                    {preview.requiredCapability === null ? " · capability tambahan tidak disyaratkan runtime Leave" : ""}
                  </p>
                ) : null}
                {preview.structuralIntents?.length ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Maksud struktur
                    </p>
                    {preview.structuralIntents.map((intent) => (
                      <div key={intent.authorityType} className="rounded-xl border border-border bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-brand-heading">
                              {authorityTypeCopy(intent.authorityType)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Target: {intent.targetPositionTitle ?? "Belum terselesaikan"}
                              {intent.targetNodeName ? ` · ${intent.targetNodeName}` : ""}
                            </p>
                          </div>
                          <span className={cn(
                            "rounded-full px-2 py-1 text-xs font-bold",
                            intent.readiness.runtimeEligible
                              ? "bg-emerald-50 text-emerald-800"
                              : intent.readiness.runtimeVerdict === "PENDING_USER_ACTIVATION"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-red-50 text-red-800",
                          )}>
                            {readinessVerdictCopy(intent.readiness.runtimeVerdict)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {intent.path.map((item, index) => (
                            <div key={`${intent.authorityType}-${item.positionKey}`} className="contents">
                              <span className="rounded-lg bg-surface px-2 py-1 text-xs text-brand-heading">
                                {item.positionTitle} · {item.nodeName}
                                <span className="block text-muted-foreground">
                                  {item.state === "VACANT"
                                    ? "VACANT"
                                    : `${item.incumbentEmployeeName ?? "Pejabat tidak dikenal"} · ${accountStatusCopy(item.accountStatus)}`}
                                </span>
                              </span>
                              {index < intent.path.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                          Pejabat dimaksud: <span className="font-bold text-brand-heading">{intent.intendedIncumbentEmployeeName}</span>
                          {` · Pegawai ${intent.readiness.employeeActive ? "aktif" : "nonaktif"}`}
                          {` · Akun ${accountStatusCopy(intent.readiness.accountStatus).toLowerCase()}`}
                          {` · Capability ${intent.readiness.capabilityStatus === "NOT_REQUIRED" ? "tidak disyaratkan" : intent.readiness.capabilityStatus === "READY" ? "siap" : "belum tersedia"}`}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {preview.structuralErrors?.length ? (
                  <div className="mt-3 space-y-2">
                    {preview.structuralErrors.map((item) => (
                      <p key={`${item.authorityType}-${item.code}`} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                        <span className="font-bold">{authorityTypeCopy(item.authorityType)}:</span>{" "}
                        {item.code === "MEMBERSHIP_NOT_CONFIGURED"
                          ? "Pegawai belum memiliki keanggotaan utama efektif pada revisi ini."
                          : item.message}
                      </p>
                    ))}
                  </div>
                ) : null}
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Kesiapan workflow aktual
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {preview.steps.map((step, index) => (
                    <div
                      key={`${step.employeeId}-${index}`}
                      className="contents"
                    >
                      <span className="rounded-xl border border-border bg-white px-3 py-2 text-xs">
                        <span className="font-bold">{step.employeeName}</span>
                        {step.authorityType ? (
                          <span className="block text-xs text-muted-foreground">
                            {authorityTypeCopy(step.authorityType)}
                          </span>
                        ) : null}
                      </span>
                      {index < preview.steps.length - 1 ? (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      ) : null}
                    </div>
                  ))}
                  {preview.steps.length === 0 ? (
                    <span className="text-xs text-red-800">
                      Tidak ada approver yang dapat ditindaklanjuti. Workflow tetap gagal tertutup.
                    </span>
                  ) : null}
                </div>
                {preview.runtime?.error ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    {preview.runtime.error.code === "AUTHORITY_INELIGIBLE"
                      && preview.runtime.error.details.lastIneligibility === "ACCOUNT_NOT_ACTIVE"
                      ? "Jalur struktur ditemukan, tetapi akun pejabat tujuan belum aktif."
                      : preview.runtime.error.message}
                  </p>
                ) : null}
                {preview.oversight ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Setelah final approved, notifikasi oversight:{" "}
                    <span className="font-bold text-brand-heading">
                      {preview.oversight.employeeName}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </article>
          <article className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <h2 className="text-sm font-bold text-blue-950">
              Snapshot approval tetap aman
            </h2>
            <p className="mt-2 text-xs leading-5 text-blue-900">
              Publikasi struktur hanya memengaruhi transaksi baru pada tanggal
              efektif. Approver konkret pada permintaan yang sudah disubmit
              tidak dihitung ulang.
            </p>
          </article>
        </section>
      ) : null}

      {action?.type === "draft" ? (
        <Modal
          title="Jadwalkan perubahan struktur"
          description="Buat draft terpisah agar struktur terpublikasi dan riwayat sebelumnya tidak tertimpa."
          onClose={() => setAction(null)}
        >
          <form onSubmit={handleDraft} className="space-y-4">
            <Field label="Nama draft">
              <input
                name="name"
                required
                defaultValue={`Restrukturisasi ${effectiveDate}`}
                className={inputClass}
              />
            </Field>
            <Field label="Tanggal efektif" hint="Asia/Jakarta">
              <input
                name="effectiveOn"
                type="date"
                required
                min={jakartaToday()}
                defaultValue={
                  effectiveDate < jakartaToday()
                    ? jakartaToday()
                    : effectiveDate
                }
                className={inputClass}
              />
            </Field>
            <SubmitRow
              saving={saving}
              onCancel={() => setAction(null)}
              label="Buat draft"
            />
          </form>
        </Modal>
      ) : null}

      {action?.type === "node" ? (
        <Modal
          title={
            action.mode === "move"
              ? "Pindahkan kelompok"
              : action.mode === "edit"
                ? "Edit kelompok"
                : action.mode === "sibling"
                  ? "Tambah kelompok sejajar"
                  : action.mode === "child"
                    ? "Tambah kelompok di bawah"
                    : "Tambah kelompok pertama"
          }
          description={
            action.mode === "move"
              ? "Pemindahan mengubah induk struktural dan harus dilakukan secara sengaja. Tinjau dampak approval sebelum publish."
              : "Kelompok adalah container organisasi. Posisi dan kewenangan ditambahkan secara terpisah."
          }
          onClose={() => setAction(null)}
        >
          <form
            onSubmit={(event) => handleNode(event, action)}
            className="space-y-4"
          >
            {action.mode === "move" ? (
              <>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Pindahkan
                  </p>
                  <p className="mt-1 text-sm font-bold text-brand-heading">
                    {action.node?.name}
                  </p>
                </div>
                <Field label="Induk struktural baru">
                  <select
                    name="parentNodeKey"
                    defaultValue={action.node?.parentNodeKey ?? ""}
                    className={inputClass}
                  >
                    <option value="">Tidak ada — paling atas</option>
                    {selectableOrganizationParents(
                      data?.nodes ?? [],
                      "edit",
                      action.node?.stableKey,
                    ).map((node) => (
                      <option key={node.stableKey} value={node.stableKey}>
                        {node.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Nama">
                  <input
                    name="name"
                    required
                    defaultValue={
                      action.mode === "edit" ? action.node?.name : ""
                    }
                    placeholder="Contoh: Bidang Pendidikan"
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Jenis kelompok"
                  hint="contoh: Direktorat, Unit, Divisi, atau Tim"
                >
                  <select
                    name="nodeType"
                    defaultValue={action.node?.nodeType ?? "UNIT"}
                    className={inputClass}
                  >
                    <option value="FOUNDATION">Yayasan</option>
                    <option value="DIRECTORATE">Bidang</option>
                    <option value="UNIT">Unit / Lembaga</option>
                    <option value="DIVISION">Bagian / Fungsi</option>
                    <option value="TEAM">Tim</option>
                  </select>
                </Field>
                {action.mode === "child" ? (
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-xs font-bold text-brand-heading">Penempatan</p>
                    <label className="mt-2 flex items-center gap-2 text-xs"><input type="radio" name="placement" value="child" defaultChecked /> Di bawah {action.node?.name}</label>
                    <label className="mt-2 flex items-center gap-2 text-xs"><input type="radio" name="placement" value="sibling" /> Sejajar dengan {action.node?.name}</label>
                    <input
                      type="hidden"
                      name="parentNodeKey"
                      value={action.node?.stableKey ?? ""}
                    />
                  </div>
                ) : action.mode === "sibling" ? (
                  <input type="hidden" name="parentNodeKey" value={action.node?.parentNodeKey ?? ""} />
                ) : (
                  <input
                    type="hidden"
                    name="parentNodeKey"
                    value={action.node?.parentNodeKey ?? ""}
                  />
                )}
                <Field
                  label="Tampilan"
                  hint="opsional, tidak mengubah reporting atau approval"
                >
                  <select
                    name="visualRankOffset"
                    defaultValue={action.node?.visualRankOffset ?? 0}
                    className={inputClass}
                  >
                    <option value="0">Tingkat normal</option>
                    <option value="1">Tampilkan 1 tingkat lebih rendah</option>
                    <option value="2">Tampilkan 2 tingkat lebih rendah</option>
                    <option value="3">Tampilkan 3 tingkat lebih rendah</option>
                  </select>
                </Field>
                <details className="rounded-xl border border-border bg-surface p-3">
                  <summary className="cursor-pointer text-xs font-bold text-brand-heading">
                    Pengaturan lanjutan
                  </summary>
                  <div className="mt-3">
                    <Field
                      label="Kode integrasi"
                      hint="opsional, untuk integrasi teknis"
                    >
                      <input
                        name="integrationCode"
                        defaultValue={action.node?.integrationCode ?? ""}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </details>
              </>
            )}
            <SubmitRow
              saving={saving}
              onCancel={() => setAction(null)}
              label={
                action.mode === "move"
                  ? "Pindahkan kelompok"
                  : action.mode === "edit"
                    ? "Simpan perubahan"
                    : "Tambah kelompok"
              }
            />
          </form>
        </Modal>
      ) : null}

      {action?.type === "position" ? (
        <Modal
          title={
            action.mode === "move"
              ? "Pindahkan posisi"
              : action.mode === "edit"
                ? "Edit posisi"
                : "Tambah posisi"
          }
          description={
            action.mode === "move"
              ? "Pemindahan ini mengubah konteks struktural posisi."
              : "Judul posisi adalah data tampilan; resolver memakai hubungan kewenangan yang dikonfigurasi."
          }
          onClose={() => setAction(null)}
        >
          <form
            onSubmit={(event) => handlePosition(event, action)}
            className="space-y-4"
          >
            {action.mode === "move" ? (
              <>
                <div className="rounded-xl bg-surface p-3 text-sm font-bold text-brand-heading">
                  {action.position?.title}
                </div>
                <Field label="Kelompok baru">
                  <select
                    name="nodeKey"
                    required
                    defaultValue={action.position?.nodeKey ?? action.nodeKey}
                    className={inputClass}
                  >
                    {data?.nodes.map((node) => (
                      <option key={node.stableKey} value={node.stableKey}>
                        {node.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Posisi atasan struktural baru">
                  <PositionPicker
                    name="parentPositionKey"
                    defaultValue={action.position?.parentPositionKey}
                    positions={(data?.positions ?? []).filter((position) => position.stableKey !== action.position?.stableKey)}
                    nodes={data?.nodes ?? []}
                    emptyLabel="Tidak ada / mengikuti pimpinan struktur"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Judul posisi">
                  <input
                    name="title"
                    required
                    defaultValue={action.position?.title ?? ""}
                    placeholder="Contoh: Kepala Bidang Pendidikan"
                    className={inputClass}
                  />
                </Field>
                {action.mode === "create" ? (
                  <>
                    <Field label="Berada di kelompok">
                      <select
                        name="nodeKey"
                        required
                        defaultValue={action.nodeKey}
                        className={inputClass}
                      >
                        {data?.nodes.map((node) => (
                          <option key={node.stableKey} value={node.stableKey}>
                            {node.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Posisi atasan struktural">
                      <PositionPicker
                        name="parentPositionKey"
                        defaultValue={action.parentPositionKey}
                        positions={data?.positions ?? []}
                        nodes={data?.nodes ?? []}
                        emptyLabel="Tidak ada / mengikuti pimpinan struktur"
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-border bg-surface p-3 text-xs">
                      <span className="text-muted-foreground">Kelompok: </span>
                      <span className="font-bold text-brand-heading">
                        {
                          data?.nodes.find(
                            (node) =>
                              node.stableKey === action.position?.nodeKey,
                          )?.name
                        }
                      </span>
                    </div>
                    <input
                      type="hidden"
                      name="nodeKey"
                      value={action.position?.nodeKey}
                    />
                    <input
                      type="hidden"
                      name="parentPositionKey"
                      value={action.position?.parentPositionKey ?? ""}
                    />
                  </>
                )}
                <details className="rounded-xl border border-border bg-surface p-3">
                  <summary className="cursor-pointer text-sm font-bold text-brand-heading">
                    Pengaturan lanjutan
                  </summary>
                  <div className="mt-4 space-y-4">
                <Field label="Ketika posisi VACANT">
                  <select
                    name="vacancyPolicy"
                    defaultValue={
                      action.position?.vacancyPolicy ?? "CLIMB_TO_PARENT"
                    }
                    className={inputClass}
                  >
                    <option value="CLIMB_TO_PARENT">
                      Naik ke kewenangan struktural di atas
                    </option>
                    <option value="REQUIRE_ACTING_OR_BLOCK">
                      Wajib pelaksana tugas atau blokir
                    </option>
                    <option value="BLOCK">Blokir jika vacant</option>
                  </select>
                </Field>
                <Field
                  label="Jenis pejabat"
                  hint="identitas teknis; tidak memberikan permission"
                >
                  <select
                    name="holderSource"
                    defaultValue={action.position?.holderSource ?? "EMPLOYEE"}
                    className={inputClass}
                  >
                    <option value="EMPLOYEE">Pegawai</option>
                    <option value="ACCOUNT">Account Organ Yayasan</option>
                  </select>
                </Field>
                <Field label="Tampilan" hint="presentasi saja">
                  <select
                    name="visualRankOffset"
                    defaultValue={action.position?.visualRankOffset ?? 0}
                    className={inputClass}
                  >
                    <option value="0">Tingkat normal</option>
                    <option value="1">Tampilkan 1 tingkat lebih rendah</option>
                    <option value="2">Tampilkan 2 tingkat lebih rendah</option>
                    <option value="3">Tampilkan 3 tingkat lebih rendah</option>
                  </select>
                </Field>
                  </div>
                </details>
              </>
            )}
            <SubmitRow
              saving={saving}
              onCancel={() => setAction(null)}
              label={
                action.mode === "move"
                  ? "Pindahkan posisi"
                  : action.mode === "edit"
                    ? "Simpan perubahan"
                    : "Tambah posisi"
              }
            />
          </form>
        </Modal>
      ) : null}

      {action?.type === "incumbency" ? (
        <Modal
          title={
            action.acting
              ? "Tetapkan pelaksana tugas"
              : "Tetapkan pemegang posisi"
          }
          description={
            action.acting
              ? "Acting authority selalu eksplisit dan berbatas tanggal; sistem tidak menginferensikannya dari absensi."
              : "Pilih pegawai atau account governance yang sudah ada. Penetapan tidak membuat account, mengaktifkan account, atau memberikan permission."
          }
          onClose={() => setAction(null)}
        >
          <HolderAssignmentEditor
            position={action.position}
            acting={action.acting}
            employees={employees}
            accounts={boardAccounts}
            effectiveOn={data?.draft?.effectiveOn ?? effectiveDate}
            saving={saving}
            onCancel={() => setAction(null)}
            onSubmit={(event) => handleIncumbency(event, action)}
          />
        </Modal>
      ) : null}

      {action?.type === "leader" ? (
        <Modal
          wide
          title={`Tetapkan pimpinan · ${action.node.name}`}
          description="Pilih jabatan yang sudah ada atau buat jabatan pimpinan. Atasan struktural hanya ditulis bila dipilih secara eksplisit."
          onClose={() => setAction(null)}
        >
          {data ? (
            <LeaderEditor
              node={action.node}
              data={data}
              employees={employees}
              accounts={boardAccounts}
              saving={saving}
              onCancel={() => setAction(null)}
              onSubmit={(event) => handleLeader(event, action)}
            />
          ) : null}
        </Modal>
      ) : null}

      {action?.type === "members" ? (
        <Modal
          wide
          title={`Kelola anggota · ${action.node.name}`}
          description="Pilih satu per satu atau gunakan unit lama sebagai bantuan migrasi keanggotaan yang eksplisit."
          onClose={() => setAction(null)}
        >
          <MembershipEditor
            node={action.node}
            nodes={data?.nodes ?? []}
            employees={employees}
            memberships={data?.memberships ?? []}
            saving={saving}
            onCancel={() => setAction(null)}
            onSubmit={(event) => handleMembers(event, action)}
          />
        </Modal>
      ) : null}

      {action?.type === "visual" ? (
        <Modal
          title="Atur tampilan"
          description="Pengaturan ini hanya mengubah posisi kotak pada chart. Reporting, Direct Manager, Unit Approver, dan kewenangan lain tidak berubah."
          onClose={() => setAction(null)}
        >
          <form onSubmit={(event) => handleVisual(event, action)}>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-950">
              {"name" in action.item ? action.item.name : action.item.title}
            </div>
            <div className="mt-4 space-y-2">
              {[0, 1, 2, 3].map((offset) => (
                <label
                  key={offset}
                  className="flex cursor-pointer gap-3 rounded-xl border border-border p-3 hover:bg-muted"
                >
                  <input
                    type="radio"
                    name="visualRankOffset"
                    value={offset}
                    defaultChecked={action.item.visualRankOffset === offset}
                    className="mt-0.5 accent-[var(--color-brand-primary)]"
                  />
                  <span>
                    <span className="block text-sm font-bold text-brand-heading">
                      {offset === 0
                        ? "Tingkat normal"
                        : `Tampilkan ${offset} tingkat lebih rendah`}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {offset === 0
                        ? "Ikuti kedalaman hubungan induk."
                        : "Garis konektor tetap menunjuk ke induk struktural sebenarnya."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <SubmitRow
              saving={saving}
              onCancel={() => setAction(null)}
              label="Simpan tampilan"
            />
          </form>
        </Modal>
      ) : null}

      {action?.type === "delete-node" ? (
        <Modal
          title="Hapus kelompok dan subtree?"
          description="Tindakan ini hanya tersedia pada DRAFT dan tidak mengubah histori yang sudah dipublikasikan."
          onClose={() => setAction(null)}
        >
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">{action.node.name}</p>
            <p className="mt-2 text-xs leading-5">
              Seluruh referensi draft yang bergantung ikut dihapus secara
              atomik. Stable key yatim tidak akan dipertahankan.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {Object.entries({
                "Kelompok anak": pendingDeletionImpact?.childGroups ?? 0,
                Posisi: pendingDeletionImpact?.positions ?? 0,
                Membership: pendingDeletionImpact?.memberships ?? 0,
                Incumbency: pendingDeletionImpact?.incumbencies ?? 0,
                "Authority binding":
                  pendingDeletionImpact?.authorityBindings ?? 0,
                "Reporting override":
                  pendingDeletionImpact?.reportingOverrides ?? 0,
              }).map(([label, count]) => (
                <div key={label} className="rounded-lg bg-white/80 p-2">
                  <dt className="text-xs text-red-700">{label}</dt>
                  <dd className="mt-0.5 font-bold">{count}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAction(null)}
              className="h-10 rounded-xl border border-border px-4 text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => deleteNodeSubtree(action.node)}
              className="h-10 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              Hapus subtree
            </button>
          </div>
        </Modal>
      ) : null}

      {action?.type === "delete-group" ? (
        <Modal
          title="Hapus kelompok?"
          description="Hanya kelompok terpilih yang akan dihapus. Ini bukan aksi hapus subtree."
          onClose={() => setAction(null)}
        >
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">{action.node.name}</p>
            <p className="mt-2 text-xs leading-5">
              Penghapusan aman ditolak jika masih ada dependensi. Pindahkan atau
              hapus dependensi terlebih dahulu.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {Object.entries({
                "Kelompok anak": pendingGroupDeletionImpact?.childGroups ?? 0,
                Posisi: pendingGroupDeletionImpact?.positions ?? 0,
                Membership: pendingGroupDeletionImpact?.memberships ?? 0,
                "Authority binding":
                  pendingGroupDeletionImpact?.authorityBindings ?? 0,
                "Reporting override":
                  pendingGroupDeletionImpact?.reportingOverrides ?? 0,
              }).map(([label, count]) => (
                <div key={label} className="rounded-lg bg-white/80 p-2">
                  <dt className="text-xs text-red-700">{label}</dt>
                  <dd className="mt-0.5 font-bold">{count}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAction(null)}
              className="h-10 rounded-xl border border-border px-4 text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => deleteGroup(action.node)}
              className="h-10 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              Hapus kelompok
            </button>
          </div>
        </Modal>
      ) : null}

      {action?.type === "delete-position" ? (
        <Modal
          title="Hapus posisi?"
          description="Hanya posisi terpilih yang akan dihapus; tidak ada cascade otomatis."
          onClose={() => setAction(null)}
        >
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">{action.position.title}</p>
            <p className="mt-2 text-xs leading-5">
              Pemegang utama:{" "}
              {action.position.primaryIncumbent?.employeeName ??
                action.position.primaryIncumbent?.accountEmail ??
                "VACANT"}
              <br />
              Pelaksana tugas:{" "}
              {action.position.actingIncumbent?.employeeName ?? "Tidak ada"}
            </p>
            <p className="mt-2 text-xs leading-5">
              Jika dependensi masih ada, penghapusan aman ditolak. Pindahkan
              atau hapus dependensi terlebih dahulu.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {Object.entries({
                "Posisi di bawahnya":
                  pendingPositionDeletionImpact?.childPositions ?? 0,
                "Authority binding":
                  pendingPositionDeletionImpact?.authorityBindings ?? 0,
                "Reporting override":
                  pendingPositionDeletionImpact?.reportingOverrides ?? 0,
              }).map(([label, count]) => (
                <div key={label} className="rounded-lg bg-white/80 p-2">
                  <dt className="text-xs text-red-700">{label}</dt>
                  <dd className="mt-0.5 font-bold">{count}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAction(null)}
              className="h-10 rounded-xl border border-border px-4 text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => deletePosition(action.position)}
              className="h-10 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              Hapus posisi
            </button>
          </div>
        </Modal>
      ) : null}

      {action?.type === "discard-draft" ? (
        <Modal
          title="Buang seluruh draft?"
          description="DRAFT atau hasil validasi yang belum dipublikasikan dapat dibuang. PUBLISHED tidak pernah dapat dihapus."
          onClose={() => setAction(null)}
        >
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p className="font-bold">{data?.draft?.name}</p>
            <p className="mt-2 text-xs leading-5">
              Semua perubahan yang belum dipublikasikan dalam draft ini akan
              dihapus. Versi terpublikasi dan audit event tetap tersimpan.
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAction(null)}
              className="h-10 rounded-xl border border-border px-4 text-sm font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void discardDraft()}
              className="h-10 rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              Buang draft
            </button>
          </div>
        </Modal>
      ) : null}

      {action?.type === "approval-reporting" && data ? (
        <Modal
          wide
          title={`Atur Approval & Reporting · ${"name" in action.item ? action.item.name : action.item.title}`}
          description="Pilih hubungan reporting dan approval secara eksplisit. Posisi VACANT tetap dapat dipilih; resolver menerapkan kebijakan posisi di server."
          onClose={() => setAction(null)}
        >
          <ApprovalReportingEditor
            item={action.item}
            kind={action.kind}
            data={data}
            saving={saving}
            onCancel={() => setAction(null)}
            onSubmit={(event) => handleApprovalReporting(event, action)}
          />
        </Modal>
      ) : null}

      {action?.type === "authority" ? (
        <Modal
          title="Pengaturan lanjutan · authority mentah"
          description="Gunakan editor teknis ini hanya untuk hubungan yang tidak tersedia pada alur Approval & Reporting. Nama jabatan tidak dipakai sebagai business rule."
          onClose={() => setAction(null)}
        >
          <form
            onSubmit={(event) => handleAuthority(event, action)}
            className="space-y-4"
          >
            <Field label="Jenis kewenangan">
              <select name="authorityType" className={inputClass}>
                {action.kind === "position" ? (
                  <>
                    <option value="SUPERVISORY_PARENT">
                      Atasan struktural
                    </option>
                    <option value="GOVERNANCE_APPROVER">
                      Governance approver
                    </option>
                    <option value="OVERSIGHT_PARENT">
                      Oversight di atas approver
                    </option>
                  </>
                ) : (
                  <>
                    <option value="LEADER">Leader kelompok</option>
                    <option value="UNIT_APPROVER">Unit approver</option>
                  </>
                )}
              </select>
            </Field>
            <Field label="Posisi target">
              <PositionPicker name="targetPositionKey" positions={data?.positions ?? []} nodes={data?.nodes ?? []} />
            </Field>
            <Field label="Jika posisi target vacant">
              <select
                name="vacancyPolicy"
                defaultValue="CLIMB_TO_PARENT"
                className={inputClass}
              >
                <option value="CLIMB_TO_PARENT">Naik ke atas</option>
                <option value="REQUIRE_ACTING_OR_BLOCK">
                  Wajib acting atau blokir
                </option>
                <option value="BLOCK">Blokir</option>
              </select>
            </Field>
            <SubmitRow
              saving={saving}
              onCancel={() => setAction(null)}
              label="Simpan kewenangan"
            />
          </form>
        </Modal>
      ) : null}
    </AdminShell>
  );
}

export function PositionPicker({
  name,
  positions,
  nodes,
  defaultValue = null,
  value,
  onChange,
  placeholder = "Pilih posisi...",
  emptyLabel,
}: {
  name: string;
  positions: OrganizationPosition[];
  nodes: OrganizationNode[];
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [internalSelectedKey, setInternalSelectedKey] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const selectedKey = value === undefined ? internalSelectedKey : value ?? "";
  const select = (key: string) => {
    if (value === undefined) setInternalSelectedKey(key);
    onChange?.(key || null);
  };
  const selected = positions.find((position) => position.stableKey === selectedKey);
  const pathFor = (position: OrganizationPosition) => {
    const names: string[] = [];
    let node = nodes.find((item) => item.stableKey === position.nodeKey);
    while (node) {
      names.unshift(node.name);
      node = node.parentNodeKey
        ? nodes.find((item) => item.stableKey === node!.parentNodeKey)
        : undefined;
    }
    return names.length > 2 ? `… / ${names.slice(-2).join(" / ")}` : names.join(" / ");
  };
  const holderFor = (position: OrganizationPosition) =>
    position.primaryIncumbent?.accountEmail
    ?? position.primaryIncumbent?.employeeName
    ?? "VACANT";
  const filtered = positions.filter((position) => {
    const needle = query.trim().toLocaleLowerCase("id-ID");
    if (!needle) return true;
    return [position.title, pathFor(position), holderFor(position)]
      .some((value) => value.toLocaleLowerCase("id-ID").includes(needle));
  });

  return (
    <div className="rounded-xl border border-border bg-white p-2" data-position-picker={name}>
      <input type="hidden" name={name} value={selectedKey} />
      <div className="flex items-center gap-2 border-b border-border/70 px-2 pb-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          aria-label={`${placeholder} — cari jabatan, struktur, atau pejabat`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari jabatan, struktur, atau pejabat"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="max-h-52 space-y-1 overflow-y-auto py-2">
        {emptyLabel ? (
          <button type="button" onClick={() => select("")} className={cn("w-full rounded-lg px-2 py-2 text-left text-xs", !selectedKey ? "bg-brand-primary-pale font-bold text-brand-primary-deep" : "hover:bg-muted")}>
            {emptyLabel}
          </button>
        ) : null}
        {filtered.map((position) => {
          const path = pathFor(position);
          return (
            <button
              key={position.stableKey}
              type="button"
              onClick={() => select(position.stableKey)}
              className={cn("w-full rounded-lg px-2 py-2 text-left hover:bg-muted", selectedKey === position.stableKey && "bg-brand-primary-pale")}
            >
              <span className="block text-sm font-bold text-brand-heading">{position.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{path || "Struktur belum ditetapkan"}</span>
              <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">{holderFor(position)}</span>
            </button>
          );
        })}
        {filtered.length === 0 ? <p className="px-2 py-3 text-xs text-muted-foreground">Tidak ada posisi yang cocok.</p> : null}
      </div>
      {selected ? <p className="border-t border-border/70 px-2 pt-2 text-xs font-semibold text-brand-heading">Dipilih: {selected.title} — {pathFor(selected)}</p> : null}
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-lg border border-border bg-white px-2 text-left text-xs font-bold leading-4 hover:border-brand-primary/40 hover:bg-brand-primary-pale/30 [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0"
    >
      <span className="contents">{icon}</span>
      <span
        className="min-w-0 truncate"
        title={typeof children === "string" ? children : undefined}
      >
        {children}
      </span>
    </button>
  );
}
