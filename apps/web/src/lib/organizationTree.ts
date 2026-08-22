import type { OrganizationNode, OrganizationPosition } from "@/lib/organizationDesigner";

export interface OrganizationTreeNode extends OrganizationNode {
  children: OrganizationTreeNode[];
  positions: OrganizationPosition[];
}

export function buildOrganizationTree(
  nodes: OrganizationNode[],
  positions: OrganizationPosition[],
): OrganizationTreeNode[] {
  const byKey = new Map<string, OrganizationTreeNode>();
  for (const node of nodes) {
    byKey.set(node.stableKey, {
      ...node,
      children: [],
      positions: positions
        .filter((position) => position.nodeKey === node.stableKey)
        .sort((a, b) => a.title.localeCompare(b.title)),
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
  return roots;
}
