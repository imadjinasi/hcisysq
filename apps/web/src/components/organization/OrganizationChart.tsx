import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Focus,
  LocateFixed,
  Maximize2,
  Minus,
  Plus,
  UserCheck,
  UsersRound,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  OrganizationNode,
  OrganizationPosition,
} from "@/lib/organizationDesigner";
import {
  buildOrganizationTree,
  type OrganizationLayoutPosition,
  type OrganizationTreeNode,
} from "@/lib/organizationTree";
import {
  clampCanvasZoom,
  fitZoomForViewport,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  ORGANIZATION_NODE_VISUAL_BAND_HEIGHT,
  ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT,
  organizationNodeTypeLabel,
  visualBandGap,
} from "@/lib/organizationCanvas";
import { cn } from "@/lib/utils";

export type OrganizationSelection =
  | { kind: "node"; key: string }
  | { kind: "position"; key: string }
  | null;

const ZOOM_STEP = 0.1;

function PositionCard({
  position,
  isLeader,
  selected,
  onSelect,
}: {
  position: OrganizationLayoutPosition;
  isLeader: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const acting = position.actingIncumbent;
  const primary = position.primaryIncumbent;
  const vacant = !primary && !acting;
  const accountHolder = (position.holderSource ?? "EMPLOYEE") === "ACCOUNT";
  const primaryLabel = accountHolder
    ? primary?.accountEmail ?? primary?.employeeName
    : primary?.employeeName;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-brand-primary bg-brand-primary-pale/60 ring-2 ring-brand-primary/15"
          : vacant
            ? "border-dashed border-amber-400 bg-amber-50/70 hover:border-amber-500"
            : acting
              ? "border-blue-300 bg-blue-50/60 hover:border-blue-400"
              : "border-border/70 bg-surface/70 hover:border-brand-primary/40",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span title={position.title} className="block break-words text-xs font-bold leading-4 text-brand-heading">
            {position.title}
          </span>
          <span
            className={cn(
              "mt-0.5 block break-words text-[11px] leading-4",
              vacant ? "font-bold text-amber-900" : acting ? "font-semibold text-blue-900" : "text-muted-foreground",
            )}
          >
            {acting
              ? `${acting.employeeName} · Pelaksana tugas`
              : primaryLabel ?? "VACANT · Belum ada pejabat"}
          </span>
        </span>
        {vacant ? (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
        ) : acting ? (
          <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" aria-hidden="true" />
        ) : (
          <BriefcaseBusiness className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary-deep" aria-hidden="true" />
        )}
      </span>
      {isLeader || acting || primary ? (
        <span className="mt-2 flex flex-wrap gap-1">
          {primary ? (
            <span className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">
              {accountHolder ? "ACCOUNT" : "PEGAWAI"}
            </span>
          ) : null}
          {isLeader ? (
            <span className="inline-flex rounded-full bg-brand-primary-pale px-2 py-0.5 text-[10px] font-semibold text-brand-primary-deep">
              Leader
            </span>
          ) : null}
          {acting ? (
            <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
              PLT
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

function PositionLane({
  position,
  parentVisualDepth,
  isLeader,
  selected,
  onSelect,
}: {
  position: OrganizationLayoutPosition;
  parentVisualDepth: number | null;
  isLeader: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const offsetHeight = visualBandGap(
    parentVisualDepth,
    position.visualDepth,
    ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT,
  );
  const connectorHeight = (position.parentPositionKey ? 16 : 0) + offsetHeight;

  return (
    <div
      className="relative"
      data-position-key={position.stableKey}
      data-parent-position-key={position.parentPositionKey ?? undefined}
      data-structural-depth={position.structuralDepth}
      data-visual-band={position.visualDepth}
      data-visual-rank-offset={position.visualRankOffset}
    >
      {connectorHeight > 0 ? (
        <span
          aria-hidden="true"
          className={cn(
            "mx-auto block w-px",
            position.parentPositionKey ? "bg-brand-primary/35" : "bg-transparent",
          )}
          style={{ height: `${connectorHeight}px` }}
          data-connector-kind={position.parentPositionKey ? "position" : undefined}
          data-connector-from={position.parentPositionKey ?? undefined}
          data-connector-to={position.parentPositionKey ? position.stableKey : undefined}
        />
      ) : null}
      <PositionCard
        position={position}
        isLeader={isLeader}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  );
}

function TreeBranch({
  item,
  selection,
  onSelect,
  parentKey,
  parentVisualDepth = null,
  siblingIndex = 0,
  siblingCount = 1,
  expandAll,
  expansionVersion,
}: {
  item: OrganizationTreeNode;
  selection: OrganizationSelection;
  onSelect: (selection: Exclude<OrganizationSelection, null>) => void;
  parentKey?: string;
  parentVisualDepth?: number | null;
  siblingIndex?: number;
  siblingCount?: number;
  expandAll: boolean;
  expansionVersion: number;
}) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => setExpanded(expandAll), [expandAll, expansionVersion]);
  const selected = selection?.kind === "node" && selection.key === item.stableKey;
  const hasDetails = item.positions.length > 0 || item.children.length > 0;
  const connectorHeight = (parentKey ? 28 : 0)
    + visualBandGap(parentVisualDepth, item.visualDepth, ORGANIZATION_NODE_VISUAL_BAND_HEIGHT);
  const siblingSegment = siblingCount <= 1
    ? null
    : siblingIndex === 0
      ? "left-1/2 right-0"
      : siblingIndex === siblingCount - 1
        ? "left-0 right-1/2"
        : "inset-x-0";

  return (
    <li
      className="relative flex min-w-[17.5rem] flex-col items-center px-2"
      data-node-key={item.stableKey}
      data-parent-node-key={item.parentNodeKey ?? undefined}
      data-structural-depth={item.structuralDepth}
      data-visual-band={item.visualDepth}
      data-visual-rank-offset={item.visualRankOffset}
    >
      {siblingSegment ? (
        <span
          aria-hidden="true"
          className={cn("absolute top-0 h-px bg-brand-primary/40", siblingSegment)}
          data-connector-kind="sibling-segment"
          data-sibling-index={siblingIndex}
          data-sibling-count={siblingCount}
        />
      ) : null}
      {connectorHeight > 0 ? (
        <span
          aria-hidden="true"
          className={cn("block w-px", parentKey ? "bg-brand-primary/40" : "bg-transparent")}
          style={{ height: `${connectorHeight}px` }}
          data-connector-kind={parentKey ? "node" : undefined}
          data-connector-from={parentKey}
          data-connector-to={parentKey ? item.stableKey : undefined}
        />
      ) : null}
      <article
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => onSelect({ kind: "node", key: item.stableKey })}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect({ kind: "node", key: item.stableKey });
          }
        }}
        className={cn(
          "w-[17.5rem] rounded-xl border bg-white p-3 shadow-[var(--shadow-soft)] transition-colors",
          selected
            ? "border-brand-primary ring-2 ring-brand-primary/15"
            : "border-border/70 hover:border-brand-primary/40",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary-deep">
              <Building2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span title={item.name} className="block break-words text-sm font-bold leading-5 text-brand-heading">
                {item.name}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                <span>{organizationNodeTypeLabel(item.nodeType)}</span>
                {item.memberCount > 0 ? <span>· {item.memberCount} anggota</span> : null}
              </span>
            </span>
          </div>
          {hasDetails ? (
            <button
              type="button"
              aria-label={expanded ? `Ciutkan ${item.name}` : `Buka ${item.name}`}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((value) => !value);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : null}
        </div>

        {expanded && item.positions.length > 0 ? (
          <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5">
            {item.positions.map((position) => (
              <PositionLane
                key={position.stableKey}
                position={position}
                parentVisualDepth={position.parentPositionKey
                  ? item.positions.find((candidate) => candidate.stableKey === position.parentPositionKey)?.visualDepth ?? null
                  : null}
                isLeader={item.leaderPositionKey === position.stableKey}
                selected={selection?.kind === "position" && selection.key === position.stableKey}
                onSelect={() => onSelect({ kind: "position", key: position.stableKey })}
              />
            ))}
          </div>
        ) : null}
      </article>

      {expanded && item.children.length > 0 ? (
        <div className="relative mt-6 flex min-w-max flex-col items-center" data-child-level-of={item.stableKey}>
          <span aria-hidden="true" className="h-6 w-px bg-brand-primary/40" />
          <ol
            className="relative flex min-w-max items-start justify-center"
            data-layout-axis="horizontal"
            data-sibling-parent={item.stableKey}
          >
            {item.children.map((child, index) => (
              <TreeBranch
                key={child.stableKey}
                item={child}
                selection={selection}
                onSelect={onSelect}
                parentKey={item.stableKey}
                parentVisualDepth={item.visualDepth}
                siblingIndex={index}
                siblingCount={item.children.length}
                expandAll={expandAll}
                expansionVersion={expansionVersion}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </li>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2 text-[11px] font-semibold text-brand-heading hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      {children}
    </button>
  );
}

export function OrganizationChart({
  nodes,
  positions,
  selection,
  onSelect,
  canEdit,
  onStart,
}: {
  nodes: OrganizationNode[];
  positions: OrganizationPosition[];
  selection: OrganizationSelection;
  onSelect: (selection: Exclude<OrganizationSelection, null>) => void;
  canEdit: boolean;
  onStart: () => void;
}) {
  const roots = useMemo(() => buildOrganizationTree(nodes, positions), [nodes, positions]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [expandAll, setExpandAll] = useState(true);
  const [expansionVersion, setExpansionVersion] = useState(0);
  const zoomPercent = Math.round(zoom * 100);

  const updateExpansion = (expanded: boolean) => {
    setExpandAll(expanded);
    setExpansionVersion((value) => value + 1);
  };

  const centerItem = (kind: "node" | "position", key: string) => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const attribute = kind === "node" ? "nodeKey" : "positionKey";
    const target = Array.from(content.querySelectorAll<HTMLElement>(`[data-${kind}-key]`))
      .find((item) => item.dataset[attribute] === key);
    if (!target) return;
    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    viewport.scrollTo({
      left: Math.max(0, viewport.scrollLeft + targetRect.left - viewportRect.left + targetRect.width / 2 - viewport.clientWidth / 2),
      top: Math.max(0, viewport.scrollTop + targetRect.top - viewportRect.top + targetRect.height / 2 - viewport.clientHeight / 2),
      behavior: "smooth",
    });
  };

  const centerRoot = () => {
    const root = roots[0];
    if (root) centerItem("node", root.stableKey);
  };

  const fitToViewport = () => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const nextZoom = fitZoomForViewport({
      contentWidth: content.scrollWidth,
      contentHeight: content.scrollHeight,
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
    });
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    });
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0 || (event.target as HTMLElement).closest("button, article, input, select, a")) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
  };

  const pan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const active = drag.current;
    if (!viewport || !active || active.pointerId !== event.pointerId) return;
    viewport.scrollLeft = active.left - (event.clientX - active.x);
    viewport.scrollTop = active.top - (event.clientY - active.y);
  };

  const stopPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  if (nodes.length === 0) {
    return (
      <div className="flex min-h-[30rem] items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary-pale text-brand-primary-deep">
            <UsersRound className="h-7 w-7" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-xl font-bold text-brand-heading">Start organization structure</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Bangun struktur dari kelompok paling atas, lalu tambahkan unit, posisi, dan anggota secara bertahap.
          </p>
          <button
            type="button"
            onClick={onStart}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-primary-deep"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {canEdit ? "Tambah kelompok pertama" : "Buat draft struktur"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[34rem] flex-col" data-organization-canvas>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 bg-white px-3 py-2" data-canvas-toolbar>
        <ToolbarButton label="Zoom out" disabled={zoom <= MIN_CANVAS_ZOOM} onClick={() => setZoom((value) => clampCanvasZoom(value - ZOOM_STEP))}>
          <Minus />
        </ToolbarButton>
        <output aria-label="Zoom saat ini" className="inline-flex h-8 min-w-14 items-center justify-center rounded-lg bg-surface px-2 text-[11px] font-bold text-brand-heading">
          {zoomPercent}%
        </output>
        <ToolbarButton label="Zoom in" disabled={zoom >= MAX_CANVAS_ZOOM} onClick={() => setZoom((value) => clampCanvasZoom(value + ZOOM_STEP))}>
          <Plus />
        </ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        <ToolbarButton label="Fit structure to viewport" onClick={fitToViewport}>
          <Maximize2 /> Fit struktur
        </ToolbarButton>
        <ToolbarButton label="Center root" onClick={centerRoot}>
          <LocateFixed /> Pusatkan akar
        </ToolbarButton>
        <ToolbarButton
          label="Center selected"
          disabled={!selection}
          onClick={() => selection && centerItem(selection.kind, selection.key)}
        >
          <Focus /> Pusatkan pilihan
        </ToolbarButton>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        <ToolbarButton label="Collapse all" onClick={() => updateExpansion(false)}>
          <ChevronsDownUp /> Ciutkan semua
        </ToolbarButton>
        <ToolbarButton label="Expand useful scope" onClick={() => updateExpansion(true)}>
          <ChevronsUpDown /> Buka struktur
        </ToolbarButton>
        <span className="ml-auto hidden text-[10px] text-muted-foreground lg:inline">Seret ruang kosong untuk menggeser canvas</span>
      </div>
      <div
        ref={viewportRef}
        onPointerDown={startPan}
        onPointerMove={pan}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
        className="min-h-[30rem] flex-1 cursor-grab overflow-auto bg-[#f8fbfa] active:cursor-grabbing"
        data-canvas-viewport
      >
        <div
          ref={contentRef}
          className="min-w-max p-4 sm:p-5"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          data-canvas-content
          data-canvas-zoom={zoom.toFixed(2)}
        >
          <ol className="flex min-w-max items-start justify-center gap-5" data-layout-axis="horizontal" data-root-level>
            {roots.map((root) => (
              <TreeBranch
                key={root.stableKey}
                item={root}
                selection={selection}
                onSelect={onSelect}
                expandAll={expandAll}
                expansionVersion={expansionVersion}
              />
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
