import type { OrganizationNode, OrganizationPosition } from "@/lib/organizationDesigner";

export interface OrganizationLayoutPosition extends OrganizationPosition {
  structuralDepth: number;
  visualDepth: number;
}

export interface OrganizationTreeNode extends OrganizationNode {
  children: OrganizationTreeNode[];
  positions: OrganizationLayoutPosition[];
  structuralDepth: number;
  visualDepth: number;
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

export function buildOrganizationTree(
  nodes: OrganizationNode[],
  positions: OrganizationPosition[],
): OrganizationTreeNode[] {
  const depthsByPosition = positionDepths(positions);
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
            visualDepth: structuralDepth + position.visualRankOffset,
          };
        })
        .sort((a, b) => a.visualDepth - b.visualDepth || a.title.localeCompare(b.title)),
      structuralDepth: 0,
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
  const assignDepth = (items: OrganizationTreeNode[], depth: number) => {
    for (const item of items) {
      item.structuralDepth = depth;
      item.visualDepth = depth + item.visualRankOffset;
      assignDepth(item.children, depth + 1);
    }
  };
  assignDepth(roots, 0);
  return roots;
}
