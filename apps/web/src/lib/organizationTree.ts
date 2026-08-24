import type { OrganizationNode, OrganizationPosition } from "@/lib/organizationDesigner";

export interface OrganizationLayoutPosition extends OrganizationPosition {
  structuralDepth: number;
  requestedVisualDepth: number;
  visualDepth: number;
}

export interface OrganizationTreeNode extends OrganizationNode {
  children: OrganizationTreeNode[];
  positions: OrganizationLayoutPosition[];
  structuralDepth: number;
  requestedVisualDepth: number;
  visualDepth: number;
}

export function selectableOrganizationParents(
  nodes: OrganizationNode[],
  mode: "root" | "child" | "sibling" | "edit",
  selectedNodeKey?: string,
): OrganizationNode[] {
  return mode === "edit"
    ? nodes.filter((node) => node.stableKey !== selectedNodeKey)
    : nodes;
}

function positionDepths(positions: OrganizationPosition[]): Map<string, number> {
  const byKey = new Map(positions.map((position) => [position.stableKey, position]));
  const depths = new Map<string, number>();

  const visit = (key: string, visiting: Set<string>): number => {
    const known = depths.get(key);
    if (known !== undefined) return known;
    const position = byKey.get(key);
    if (!position?.parentPositionKey || !byKey.has(position.parentPositionKey)) {
      depths.set(key, 0);
      return 0;
    }
    if (visiting.has(key)) return 0;
    const next = new Set(visiting).add(key);
    const depth = visit(position.parentPositionKey, next) + 1;
    depths.set(key, depth);
    return depth;
  };

  positions.forEach((position) => visit(position.stableKey, new Set()));
  return depths;
}

function resolvedPositionVisualDepths(
  positions: OrganizationPosition[],
  structuralDepths: Map<string, number>,
): Map<string, number> {
  const byKey = new Map(positions.map((position) => [position.stableKey, position]));
  const resolved = new Map<string, number>();
  const visit = (key: string, visiting: Set<string>): number => {
    const known = resolved.get(key);
    if (known !== undefined) return known;
    const position = byKey.get(key);
    const requested = (structuralDepths.get(key) ?? 0) + (position?.visualRankOffset ?? 0);
    if (!position?.parentPositionKey || !byKey.has(position.parentPositionKey) || visiting.has(key)) {
      resolved.set(key, requested);
      return requested;
    }
    const parentDepth = visit(position.parentPositionKey, new Set(visiting).add(key));
    const depth = Math.max(requested, parentDepth + 1);
    resolved.set(key, depth);
    return depth;
  };
  positions.forEach((position) => visit(position.stableKey, new Set()));
  return resolved;
}

export function buildOrganizationTree(
  nodes: OrganizationNode[],
  positions: OrganizationPosition[],
): OrganizationTreeNode[] {
  const depthsByPosition = positionDepths(positions);
  const resolvedDepthsByPosition = resolvedPositionVisualDepths(positions, depthsByPosition);
  const byKey = new Map<string, OrganizationTreeNode>();
  for (const node of nodes) {
    byKey.set(node.stableKey, {
      ...node,
      children: [],
      positions: positions
        .filter((position) => position.nodeKey === node.stableKey)
        .map((position) => {
          const structuralDepth = depthsByPosition.get(position.stableKey) ?? 0;
          return {
            ...position,
            structuralDepth,
            requestedVisualDepth: structuralDepth + position.visualRankOffset,
            visualDepth: resolvedDepthsByPosition.get(position.stableKey) ?? structuralDepth,
          };
        })
        .sort((a, b) => a.visualDepth - b.visualDepth || a.title.localeCompare(b.title)),
      structuralDepth: 0,
      requestedVisualDepth: node.visualRankOffset,
      visualDepth: node.visualRankOffset,
    });
  }

  const roots: OrganizationTreeNode[] = [];
  for (const node of byKey.values()) {
    const parent = node.parentNodeKey ? byKey.get(node.parentNodeKey) : undefined;
    if (parent && parent.stableKey !== node.stableKey) parent.children.push(node);
    else roots.push(node);
  }

  const sortTree = (items: OrganizationTreeNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    items.forEach((item) => sortTree(item.children));
  };
  sortTree(roots);
  const assignDepth = (
    items: OrganizationTreeNode[],
    structuralDepth: number,
    parentVisualDepth: number | null,
  ) => {
    for (const item of items) {
      item.structuralDepth = structuralDepth;
      item.requestedVisualDepth = structuralDepth + item.visualRankOffset;
      item.visualDepth = parentVisualDepth === null
        ? item.requestedVisualDepth
        : Math.max(item.requestedVisualDepth, parentVisualDepth + 1);
      assignDepth(item.children, structuralDepth + 1, item.visualDepth);
    }
  };
  assignDepth(roots, 0, null);
  return roots;
}
