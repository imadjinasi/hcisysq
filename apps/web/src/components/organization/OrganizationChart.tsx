import {
  AlertTriangle,
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
  useLayoutEffect,
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
import { layoutOrganizationChart } from "@/lib/organizationChartLayout";
import {
  clampCanvasZoom,
  fitZoomForViewport,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT,
  organizationNodeTypeLabel,
} from "@/lib/organizationCanvas";
import { cn } from "@/lib/utils";

export type OrganizationSelection =
  { kind: "node"; key: string } | { kind: "position"; key: string } | null;
const CARD_WIDTH = 280,
  COLUMN_GAP = 32,
  ROW_GAP = 52,
  DEFAULT_CARD_HEIGHT = 132,
  ZOOM_STEP = 0.1;

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
  const acting = position.actingIncumbent,
    primary = position.primaryIncumbent,
    vacant = !primary && !acting,
    account = (position.holderSource ?? "EMPLOYEE") === "ACCOUNT";
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border px-2.5 py-2 text-left",
        selected
          ? "border-brand-primary bg-brand-primary-pale/60 ring-2 ring-brand-primary/15"
          : vacant
            ? "border-dashed border-amber-400 bg-amber-50/70"
            : acting
              ? "border-blue-300 bg-blue-50/60"
              : "border-border/70 bg-surface/70",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span
            title={position.title}
            className="block break-words text-xs font-bold leading-4 text-brand-heading"
          >
            {position.title}
          </span>
          <span
            className={cn(
              "mt-0.5 block break-words text-xs leading-4",
              vacant
                ? "font-bold text-amber-900"
                : acting
                  ? "font-semibold text-blue-900"
                  : "text-muted-foreground",
            )}
          >
            {acting
              ? `${acting.employeeName} · Pelaksana tugas`
              : ((account
                  ? (primary?.accountEmail ?? primary?.employeeName)
                  : primary?.employeeName) ?? "Posisi kosong · Belum ada pejabat")}
          </span>
        </span>
        {vacant ? (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
        ) : acting ? (
          <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" />
        ) : null}
      </span>
      {isLeader || acting || primary ? (
        <span className="mt-2 flex flex-wrap gap-1">
          {primary ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">
              {account ? "ORGAN YAYASAN" : "PEGAWAI"}
            </span>
          ) : null}
          {primary?.isPrimaryStructural ? (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-800">
              Utama
            </span>
          ) : null}
          {isLeader ? (
            <span className="rounded-full bg-brand-primary-pale px-2 py-0.5 text-xs font-semibold text-brand-primary-deep">
              Pimpinan
            </span>
          ) : null}
          {acting ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900">
              PLT
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

function NodeCard({
  item,
  selection,
  expanded,
  onToggle,
  onSelect,
}: {
  item: OrganizationTreeNode;
  selection: OrganizationSelection;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (value: Exclude<OrganizationSelection, null>) => void;
}) {
  const hasDetails = item.positions.length > 0 || item.children.length > 0;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={
        selection?.kind === "node" && selection.key === item.stableKey
      }
      onClick={() => onSelect({ kind: "node", key: item.stableKey })}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect({ kind: "node", key: item.stableKey });
        }
      }}
      className={cn(
        "w-[17.5rem] rounded-xl border bg-white p-3 shadow-[var(--shadow-soft)]",
        selection?.kind === "node" && selection.key === item.stableKey
          ? "border-brand-primary ring-2 ring-brand-primary/15"
          : "border-border/70 hover:border-brand-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary-deep">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span
              title={item.name}
              className="block break-words text-sm font-bold leading-5 text-brand-heading"
            >
              {item.name}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <span>{organizationNodeTypeLabel(item.nodeType)}</span>
              {item.memberCount > 0 ? (
                <span>· {item.memberCount} anggota</span>
              ) : null}
            </span>
          </span>
        </div>
        {hasDetails ? (
          <button
            type="button"
            aria-label={expanded ? `Ciutkan ${item.name}` : `Buka ${item.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
      {expanded && item.positions.length > 0 ? (
        <div className="mt-2.5 space-y-1.5 border-t border-border/60 pt-2.5">
          {item.positions.map((position) => (
            <div
              key={position.stableKey}
              className="relative"
              style={{
                marginTop: position.visualRankOffset * ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT,
              }}
              data-position-key={position.stableKey}
              data-parent-position-key={position.parentPositionKey ?? undefined}
              data-structural-depth={position.structuralDepth}
              data-requested-visual-depth={position.requestedVisualDepth}
              data-visual-band={position.visualDepth}
              data-visual-rank-offset={position.visualRankOffset}
            >
              <PositionCard
                position={position}
                isLeader={item.leaderPositionKey === position.stableKey}
                selected={
                  selection?.kind === "position" &&
                  selection.key === position.stableKey
                }
                onSelect={() =>
                  onSelect({ kind: "position", key: position.stableKey })
                }
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
function Tool({
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
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2 text-xs font-semibold text-brand-heading hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-45 [&_svg]:h-3.5 [&_svg]:w-3.5"
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
  toolbarContext,
  toolbarActions,
}: {
  nodes: OrganizationNode[];
  positions: OrganizationPosition[];
  selection: OrganizationSelection;
  onSelect: (selection: Exclude<OrganizationSelection, null>) => void;
  canEdit: boolean;
  onStart: () => void;
  toolbarContext?: ReactNode;
  toolbarActions?: ReactNode;
}) {
  const roots = useMemo(
      () => buildOrganizationTree(nodes, positions),
      [nodes, positions],
    ),
    allKeys = useMemo(
      () => new Set(nodes.map((node) => node.stableKey)),
      [nodes],
    );
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
      () => new Set(nodes.map((node) => node.stableKey)),
    ),
    [heights, setHeights] = useState<Map<string, number>>(() => new Map()),
    [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null),
    contentRef = useRef<HTMLDivElement>(null),
    cardRefs = useRef(new Map<string, HTMLElement>()),
    drag = useRef<{
      pointerId: number;
      x: number;
      y: number;
      left: number;
      top: number;
    } | null>(null);
  useEffect(
    () => setExpandedKeys(new Set(nodes.map((node) => node.stableKey))),
    [nodes],
  );
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setHeights((current) => {
        const next = new Map(current);
        let changed = false;
        for (const entry of entries) {
          const key = (entry.target as HTMLElement).dataset.nodeKey,
            height = Math.ceil(
              entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height,
            );
          if (key && next.get(key) !== height) {
            next.set(key, height);
            changed = true;
          }
        }
        return changed ? next : current;
      }),
    );
    cardRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [roots, expandedKeys]);
  const layout = useMemo(
    () =>
      layoutOrganizationChart({
        roots,
        expandedKeys,
        measuredHeights: heights,
        cardWidth: CARD_WIDTH,
        columnGap: COLUMN_GAP,
        rowGap: ROW_GAP,
        defaultCardHeight: DEFAULT_CARD_HEIGHT,
      }),
    [roots, expandedKeys, heights],
  );
  const center = (kind: "node" | "position", key: string) => {
    const viewport = viewportRef.current,
      content = contentRef.current,
      target = content?.querySelector<HTMLElement>(
        `[data-${kind}-key="${key}"]`,
      );
    if (!viewport || !target) return;
    const a = target.getBoundingClientRect(),
      b = viewport.getBoundingClientRect();
    viewport.scrollTo({
      left: Math.max(
        0,
        viewport.scrollLeft +
          a.left -
          b.left +
          a.width / 2 -
          viewport.clientWidth / 2,
      ),
      top: Math.max(
        0,
        viewport.scrollTop +
          a.top -
          b.top +
          a.height / 2 -
          viewport.clientHeight / 2,
      ),
      behavior: "smooth",
    });
  };
  const panStart = (event: ReactPointerEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current;
      if (
        !viewport ||
        event.button !== 0 ||
        (event.target as HTMLElement).closest(
          "button, article, input, select, a",
        )
      )
        return;
      drag.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
      viewport.setPointerCapture(event.pointerId);
    },
    pan = (event: ReactPointerEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current,
        active = drag.current;
      if (!viewport || !active || active.pointerId !== event.pointerId) return;
      viewport.scrollLeft = active.left - event.clientX + active.x;
      viewport.scrollTop = active.top - event.clientY + active.y;
    };
  if (nodes.length === 0)
    return (
      <div className="flex min-h-[30rem] items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-primary-pale text-brand-primary-deep">
            <UsersRound className="h-7 w-7" />
          </span>
          <h2 className="mt-5 text-xl font-bold text-brand-heading">
            Start organization structure
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Bangun struktur dari kelompok paling atas, lalu tambahkan unit,
            posisi, dan anggota secara bertahap.
          </p>
          <button
            type="button"
            onClick={onStart}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-primary px-4 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            {canEdit ? "Tambah kelompok pertama" : "Buat draft struktur"}
          </button>
        </div>
      </div>
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-organization-canvas>
      <div
        className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/70 bg-white px-2.5 py-1.5"
        data-canvas-toolbar
        data-organization-control-bar
      >
        {toolbarContext ? (
          <div className="flex min-w-0 items-center" data-organization-version-context>
            {toolbarContext}
          </div>
        ) : null}
        {toolbarContext ? <span className="hidden h-5 w-px bg-border/80 sm:block" aria-hidden="true" data-toolbar-separator="context-controls" /> : null}
        <div className="flex min-w-0 items-center gap-1" aria-label="Kontrol kanvas" data-canvas-control-group>
          <Tool label="Zoom out" disabled={zoom <= MIN_CANVAS_ZOOM} onClick={() => setZoom((v) => clampCanvasZoom(v - ZOOM_STEP))}><Minus /></Tool>
          <output aria-label="Zoom saat ini" className="inline-flex h-8 min-w-11 items-center justify-center rounded-lg bg-surface px-1.5 text-xs font-bold text-brand-heading">{Math.round(zoom * 100)}%</output>
          <Tool label="Zoom in" disabled={zoom >= MAX_CANVAS_ZOOM} onClick={() => setZoom((v) => clampCanvasZoom(v + ZOOM_STEP))}><Plus /></Tool>
          <Tool label="Fit structure to viewport" onClick={() => {
            const v = viewportRef.current;
            if (v) setZoom(fitZoomForViewport({ contentWidth: layout.width, contentHeight: layout.height, viewportWidth: v.clientWidth, viewportHeight: v.clientHeight }));
          }}><Maximize2 /> Fit</Tool>
          <span className="hidden items-center gap-1 sm:flex">
            <Tool label="Center root" onClick={() => roots[0] && center("node", roots[0].stableKey)}><LocateFixed /> Akar</Tool>
            <Tool label="Center selected" disabled={!selection} onClick={() => selection && center(selection.kind, selection.key)}><Focus /> Pilihan</Tool>
            <Tool label="Collapse all" onClick={() => setExpandedKeys(new Set())}><ChevronsDownUp /> Ciutkan</Tool>
            <Tool label="Expand useful scope" onClick={() => setExpandedKeys(new Set(allKeys))}><ChevronsUpDown /> Buka</Tool>
          </span>
          <details className="relative sm:hidden" data-canvas-overflow-menu>
            <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-border bg-white px-2 text-xs font-semibold text-brand-heading hover:bg-muted">Lainnya</summary>
            <div className="absolute left-0 top-9 z-20 grid w-48 gap-1 rounded-xl border border-border bg-white p-1.5 shadow-[var(--shadow-raised)]">
              <Tool label="Center root" onClick={() => roots[0] && center("node", roots[0].stableKey)}><LocateFixed /> Pusatkan akar</Tool>
              <Tool label="Center selected" disabled={!selection} onClick={() => selection && center(selection.kind, selection.key)}><Focus /> Pusatkan pilihan</Tool>
              <Tool label="Collapse all" onClick={() => setExpandedKeys(new Set())}><ChevronsDownUp /> Ciutkan semua</Tool>
              <Tool label="Expand useful scope" onClick={() => setExpandedKeys(new Set(allKeys))}><ChevronsUpDown /> Buka struktur</Tool>
            </div>
          </details>
        </div>
        {toolbarActions ? <span className="hidden h-5 w-px bg-border/80 lg:block" aria-hidden="true" data-toolbar-separator="controls-actions" /> : null}
        {toolbarActions ? <div className="ml-auto flex items-center gap-1" data-organization-workflow-actions>{toolbarActions}</div> : null}
      </div>
      <div
        ref={viewportRef}
        onPointerDown={panStart}
        onPointerMove={pan}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        className="min-h-0 flex-1 cursor-grab overflow-auto bg-[#f8fbfa] active:cursor-grabbing"
        data-canvas-viewport
      >
        <div
          ref={contentRef}
          className="relative m-4 sm:m-5"
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
          data-canvas-content
          data-canvas-zoom={zoom.toFixed(2)}
        >
          <div
            className="relative"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <svg
              aria-hidden="true"
              className="absolute inset-0 overflow-visible"
              width={layout.width}
              height={layout.height}
            >
              {layout.connectors.map((c) => {
                const mid = c.from.y + Math.max(16, (c.to.y - c.from.y) / 2);
                return (
                  <path
                    key={`${c.parentKey}-${c.childKey}`}
                    data-connector-kind="node"
                    data-connector-from={c.parentKey}
                    data-connector-to={c.childKey}
                    d={`M ${c.from.x} ${c.from.y} V ${mid} H ${c.to.x} V ${c.to.y}`}
                    fill="none"
                    stroke="currentColor"
                    className="text-brand-primary/40"
                    strokeWidth="1"
                  />
                );
              })}
            </svg>
            {layout.items.map(({ item, x, y }) => (
              <div
                key={item.stableKey}
                ref={(el) => {
                  if (el) cardRefs.current.set(item.stableKey, el);
                  else cardRefs.current.delete(item.stableKey);
                }}
                className="absolute"
                style={{ left: x, top: y, width: CARD_WIDTH }}
                data-node-key={item.stableKey}
                data-parent-node-key={item.parentNodeKey ?? undefined}
                data-structural-depth={item.structuralDepth}
                data-requested-visual-depth={item.requestedVisualDepth}
                data-visual-band={item.visualDepth}
                data-visual-rank-offset={item.visualRankOffset}
              >
                <NodeCard
                  item={item}
                  selection={selection}
                  expanded={expandedKeys.has(item.stableKey)}
                  onToggle={() =>
                    setExpandedKeys((current) => {
                      const next = new Set(current);
                        if (next.has(item.stableKey)) next.delete(item.stableKey);
                        else next.add(item.stableKey);
                      return next;
                    })
                  }
                  onSelect={onSelect}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
