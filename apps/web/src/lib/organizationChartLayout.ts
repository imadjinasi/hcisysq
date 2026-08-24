import type { OrganizationTreeNode } from "@/lib/organizationTree";

export interface OrganizationChartLayoutItem {
  item: OrganizationTreeNode;
  x: number;
  y: number;
  height: number;
}

export interface OrganizationChartConnector {
  parentKey: string;
  childKey: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface OrganizationChartLayout {
  items: OrganizationChartLayoutItem[];
  rowY: Map<number, number>;
  bandHeights: Map<number, number>;
  connectors: OrganizationChartConnector[];
  width: number;
  height: number;
}

export function layoutOrganizationChart(input: {
  roots: OrganizationTreeNode[];
  expandedKeys: Set<string>;
  measuredHeights?: Map<string, number>;
  cardWidth: number;
  columnGap: number;
  rowGap: number;
  defaultCardHeight: number;
}): OrganizationChartLayout {
  const visible: OrganizationTreeNode[] = [];
  const visit = (item: OrganizationTreeNode) => {
    visible.push(item);
    if (input.expandedKeys.has(item.stableKey)) item.children.forEach(visit);
  };
  input.roots.forEach(visit);

  const leafX = new Map<string, number>();
  let nextLeaf = 0;
  const assignX = (item: OrganizationTreeNode): number => {
    const visibleChildren = input.expandedKeys.has(item.stableKey)
      ? item.children
      : [];
    if (visibleChildren.length === 0) {
      const x = nextLeaf++ * (input.cardWidth + input.columnGap);
      leafX.set(item.stableKey, x);
      return x;
    }
    const childXs = visibleChildren.map(assignX);
    const x = (childXs[0]! + childXs[childXs.length - 1]!) / 2;
    leafX.set(item.stableKey, x);
    return x;
  };
  input.roots.forEach(assignX);

  const bandHeights = new Map<number, number>();
  for (const item of visible) {
    const height =
      input.measuredHeights?.get(item.stableKey) ?? input.defaultCardHeight;
    bandHeights.set(
      item.visualDepth,
      Math.max(bandHeights.get(item.visualDepth) ?? 0, height),
    );
  }
  // Empty depths are real visual bands too. This preserves the meaning of a
  // +2/+3 visual offset even when no other node happens to occupy the gap.
  const maxDepth = Math.max(0, ...bandHeights.keys());
  const depths = Array.from({ length: maxDepth + 1 }, (_, depth) => depth);
  const rowY = new Map<number, number>();
  let y = 0;
  for (const depth of depths) {
    rowY.set(depth, y);
    y += (bandHeights.get(depth) ?? input.defaultCardHeight) + input.rowGap;
  }

  const items = visible.map((item) => ({
    item,
    x: leafX.get(item.stableKey) ?? 0,
    y: rowY.get(item.visualDepth) ?? 0,
    height:
      input.measuredHeights?.get(item.stableKey) ?? input.defaultCardHeight,
  }));
  const byKey = new Map(items.map((item) => [item.item.stableKey, item]));
  const connectors: OrganizationChartConnector[] = [];
  for (const child of items) {
    if (!child.item.parentNodeKey) continue;
    const parent = byKey.get(child.item.parentNodeKey);
    if (!parent) continue;
    connectors.push({
      parentKey: parent.item.stableKey,
      childKey: child.item.stableKey,
      from: { x: parent.x + input.cardWidth / 2, y: parent.y + parent.height },
      to: { x: child.x + input.cardWidth / 2, y: child.y },
    });
  }
  const width = Math.max(
    input.cardWidth,
    nextLeaf * input.cardWidth + Math.max(0, nextLeaf - 1) * input.columnGap,
  );
  const height = Math.max(input.defaultCardHeight, y - input.rowGap);
  return { items, rowY, bandHeights, connectors, width, height };
}
