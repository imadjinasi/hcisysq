import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrganizationChart } from "@/components/organization/OrganizationChart";
import type {
  OrganizationNode,
  OrganizationPosition,
} from "@/lib/organizationDesigner";
import {
  centeredScrollOffset,
  fitZoomForViewport,
  ORGANIZATION_NODE_VISUAL_BAND_HEIGHT,
  ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT,
  organizationNodeTypeLabel,
  visualBandGap,
  visualBandOffset,
} from "@/lib/organizationCanvas";
import {
  buildOrganizationTree,
  selectableOrganizationParents,
} from "@/lib/organizationTree";
import { layoutOrganizationChart } from "@/lib/organizationChartLayout";

const baseNode: OrganizationNode = {
  id: "node-root-id",
  stableKey: "foundation",
  name: "Foundation Management",
  nodeType: "FOUNDATION",
  parentNodeKey: null,
  active: true,
  effectiveFrom: "2027-01-01",
  effectiveTo: null,
  visualRankOffset: 0,
  integrationCode: null,
  memberCount: 2,
  leaderPositionKey: "director",
};

const vacantPosition: OrganizationPosition = {
  id: "position-id",
  stableKey: "director",
  nodeKey: "foundation",
  title: "Director",
  parentPositionKey: null,
  singleIncumbent: true,
  vacancyPolicy: "CLIMB_TO_PARENT",
  active: true,
  effectiveFrom: "2027-01-01",
  effectiveTo: null,
  visualRankOffset: 0,
  primaryIncumbent: null,
  actingIncumbent: null,
};

function childNode(
  stableKey: string,
  name: string,
  visualRankOffset = 0,
): OrganizationNode {
  return {
    ...baseNode,
    id: `${stableKey}-id`,
    stableKey,
    name,
    nodeType: "SCHOOL",
    parentNodeKey: baseNode.stableKey,
    visualRankOffset,
    memberCount: 25,
    leaderPositionKey: null,
  };
}

function renderChart(
  nodes: OrganizationNode[],
  positions: OrganizationPosition[],
) {
  return renderToStaticMarkup(
    <OrganizationChart
      nodes={nodes}
      positions={positions}
      selection={null}
      onSelect={() => undefined}
      canEdit
      onStart={() => undefined}
    />,
  );
}

describe("Organization Designer chart", () => {
  it("keeps the selected node available as the default parent when adding a child", () => {
    const child = childNode("sdit", "SDIT");

    expect(
      selectableOrganizationParents(
        [baseNode, child],
        "child",
        baseNode.stableKey,
      ),
    ).toContainEqual(baseNode);
    expect(
      selectableOrganizationParents(
        [baseNode, child],
        "edit",
        baseNode.stableKey,
      ),
    ).not.toContainEqual(baseNode);
  });

  it("shows the required guided empty state", () => {
    const html = renderToStaticMarkup(
      <OrganizationChart
        nodes={[]}
        positions={[]}
        selection={null}
        onSelect={() => undefined}
        canEdit={false}
        onStart={() => undefined}
      />,
    );

    expect(html).toContain("Start organization structure");
    expect(html).toContain("Buat draft struktur");
  });

  it("renders canvas navigation controls without persisting viewport state", () => {
    const html = renderChart([baseNode], [vacantPosition]);

    expect(html).toContain('data-organization-canvas="true"');
    expect(html).toContain('aria-label="Zoom out"');
    expect(html).toContain('aria-label="Zoom saat ini"');
    expect(html).toContain('aria-label="Zoom in"');
    expect(html).toContain('aria-label="Fit structure to viewport"');
    expect(html).toContain('aria-label="Center root"');
    expect(html).toContain('aria-label="Center selected"');
    expect(html).toContain('aria-label="Collapse all"');
    expect(html).toContain('aria-label="Expand useful scope"');
    expect(html).toContain('data-canvas-zoom="1.00"');
  });

  it("uses one compact control bar and keeps secondary canvas controls reachable on narrow screens", () => {
    const html = renderChart([baseNode], [vacantPosition]);

    expect(html).toContain('data-organization-control-bar="true"');
    expect(html).toContain('data-canvas-control-group="true"');
    expect(html).toContain('data-canvas-overflow-menu="true"');
    expect(html).toContain("Lainnya");
    expect(html).toContain("Pusatkan akar");
    expect(html).toContain("Buka struktur");
    expect(html).toContain("min-h-0 flex-1 cursor-grab overflow-auto");
  });

  it("calculates fit-to-view and center-selected offsets for a laptop viewport", () => {
    expect(
      fitZoomForViewport({
        contentWidth: 2400,
        contentHeight: 900,
        viewportWidth: 1000,
        viewportHeight: 600,
      }),
    ).toBe(0.4);
    expect(
      centeredScrollOffset({
        itemStart: 900,
        itemSize: 280,
        viewportSize: 1000,
        zoom: 0.8,
      }),
    ).toBe(332);
  });

  it("keeps structural parentage unchanged when a child has a visual offset", () => {
    const child: OrganizationNode = {
      ...baseNode,
      id: "bureau-id",
      stableKey: "quran-bureau",
      name: "Al-Qur'an Bureau",
      nodeType: "DIVISION",
      parentNodeKey: "foundation",
      visualRankOffset: 1,
      leaderPositionKey: null,
    };

    const tree = buildOrganizationTree([baseNode, child], [vacantPosition]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].stableKey).toBe("quran-bureau");
    expect(tree[0].children[0].visualRankOffset).toBe(1);
    expect(tree[0].positions[0].stableKey).toBe("director");
  });

  it("renders siblings horizontally as same-rank peers", () => {
    const first = childNode("sdit", "SDIT");
    const second = childNode("smpit", "SMPIT");
    const html = renderChart([baseNode, first, second], [vacantPosition]);

    expect(html).toContain('style="left:0;top:184px;width:280px"');
    expect(html).toContain('style="left:312px;top:184px;width:280px"');
    expect(html).toMatch(
      /data-node-key="sdit"[^>]*data-structural-depth="1"[^>]*data-visual-band="1"/,
    );
    expect(html).toMatch(
      /data-node-key="smpit"[^>]*data-structural-depth="1"[^>]*data-visual-band="1"/,
    );
  });

  it("renders a child below its parent with a visible structural connector", () => {
    const child = childNode("sdit", "SDIT");
    const html = renderChart([baseNode, child], [vacantPosition]);

    expect(html).toMatch(
      /data-connector-kind="node"[^>]*data-connector-from="foundation"[^>]*data-connector-to="sdit"/,
    );
    expect(html).toMatch(
      /data-node-key="foundation"[^>]*data-structural-depth="0"/,
    );
    expect(html).toMatch(/data-node-key="sdit"[^>]*data-structural-depth="1"/);
  });

  it("uses node visual offset as a real lower layout band", () => {
    const bureau = childNode("quran-bureau", "Al-Qur'an Bureau", 1);
    const html = renderChart([baseNode, bureau], [vacantPosition]);

    expect(html).toMatch(
      /data-node-key="quran-bureau"[^>]*data-structural-depth="1"[^>]*data-visual-band="2"[^>]*data-visual-rank-offset="1"/,
    );
    expect(visualBandOffset(1, ORGANIZATION_NODE_VISUAL_BAND_HEIGHT)).toBe(160);
    expect(visualBandGap(0, 2, ORGANIZATION_NODE_VISUAL_BAND_HEIGHT)).toBe(160);
    expect(html).toContain('style="left:0;top:368px;width:280px"');
  });

  it("uses position visual offset as a real lower layout band", () => {
    const vicePrincipal: OrganizationPosition = {
      ...vacantPosition,
      id: "vice-id",
      stableKey: "vice-principal",
      title: "Vice Principal",
      parentPositionKey: "director",
      visualRankOffset: 2,
    };
    const html = renderChart([baseNode], [vacantPosition, vicePrincipal]);

    expect(html).toMatch(
      /data-position-key="vice-principal"[^>]*data-parent-position-key="director"[^>]*data-structural-depth="1"[^>]*data-visual-band="3"/,
    );
    expect(visualBandOffset(2, ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT)).toBe(
      128,
    );
    expect(visualBandGap(0, 3, ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT)).toBe(
      128,
    );
    expect(html).toMatch(
      /style="margin-top:128px"[^>]*data-position-key="vice-principal"/,
    );
    expect(html).not.toContain('data-connector-kind="position"');
  });

  it("keeps connectors attached to the structural parent after a visual-only change", () => {
    const normal = childNode("quran-bureau", "Al-Qur'an Bureau", 0);
    const offset = { ...normal, visualRankOffset: 2 };
    const normalTree = buildOrganizationTree(
      [baseNode, normal],
      [vacantPosition],
    );
    const offsetTree = buildOrganizationTree(
      [baseNode, offset],
      [vacantPosition],
    );
    const html = renderChart([baseNode, offset], [vacantPosition]);

    expect(offsetTree[0].children[0].parentNodeKey).toBe(
      normalTree[0].children[0].parentNodeKey,
    );
    expect(offsetTree[0].children[0].structuralDepth).toBe(
      normalTree[0].children[0].structuralDepth,
    );
    expect(offsetTree[0].children[0].visualDepth).toBe(
      normalTree[0].children[0].visualDepth + 2,
    );
    expect(vacantPosition.vacancyPolicy).toBe("CLIMB_TO_PARENT");
    expect(html).toMatch(
      /data-connector-from="foundation"[^>]*data-connector-to="quran-bureau"/,
    );
  });

  it("renders a real vacancy without showing visual-offset badges on canvas cards", () => {
    const html = renderToStaticMarkup(
      <OrganizationChart
        nodes={[baseNode]}
        positions={[{ ...vacantPosition, visualRankOffset: 2 }]}
        selection={{ kind: "position", key: "director" }}
        onSelect={() => undefined}
        canEdit
        onStart={() => undefined}
      />,
    );

    expect(html).toContain("VACANT · Belum ada pejabat");
    expect(html).not.toContain('aria-label="Tampilan +2"');
    expect(html).not.toContain(">+2</span>");
  });

  it("resolves offset parents and children into strictly descending visual rows", () => {
    const offsetParent = childNode("offset-parent", "Offset parent", 1);
    const normalChild = {
      ...childNode("normal-child", "Normal child"),
      parentNodeKey: offsetParent.stableKey,
    };
    const furtherOffsetChild = {
      ...childNode("further-offset-child", "Further offset child", 1),
      parentNodeKey: offsetParent.stableKey,
    };
    const roots = buildOrganizationTree(
      [baseNode, offsetParent, normalChild, furtherOffsetChild],
      [],
    );
    const parent = roots[0]!.children[0]!;
    const child = parent.children.find((item) => item.stableKey === "normal-child")!;
    const offsetChild = parent.children.find((item) => item.stableKey === "further-offset-child")!;
    const layout = layoutOrganizationChart({
      roots,
      expandedKeys: new Set(["foundation", "offset-parent"]),
      cardWidth: 280,
      columnGap: 32,
      rowGap: 52,
      defaultCardHeight: 132,
    });
    const byKey = new Map(layout.items.map((item) => [item.item.stableKey, item]));

    expect(parent.requestedVisualDepth).toBe(2);
    expect(parent.visualDepth).toBe(2);
    expect(child.requestedVisualDepth).toBe(2);
    expect(child.visualDepth).toBeGreaterThan(parent.visualDepth);
    expect(offsetChild.visualDepth).toBe(child.visualDepth + 1);
    expect(byKey.get(parent.stableKey)?.y).toBeLessThan(byKey.get(child.stableKey)?.y ?? 0);
  });

  it("keeps Normal, +1, +2, and +3 in distinct visual rows after an offset parent", () => {
    const offsetParent = childNode("offset-parent", "Offset parent", 2);
    const variants = [0, 1, 2, 3].map((visualRankOffset) => ({
      ...childNode(`child-${visualRankOffset}`, `Child ${visualRankOffset}`, visualRankOffset),
      parentNodeKey: offsetParent.stableKey,
    }));
    const roots = buildOrganizationTree([baseNode, offsetParent, ...variants], []);
    const children = roots[0]!.children[0]!.children.sort((a, b) => a.visualRankOffset - b.visualRankOffset);
    const layout = layoutOrganizationChart({
      roots,
      expandedKeys: new Set(["foundation", "offset-parent"]),
      cardWidth: 280,
      columnGap: 32,
      rowGap: 52,
      defaultCardHeight: 132,
    });
    const byKey = new Map(layout.items.map((item) => [item.item.stableKey, item]));

    expect(children.map((item) => item.visualDepth)).toEqual([4, 5, 6, 7]);
    expect(children[1]!.visualDepth - children[0]!.visualDepth).toBe(1);
    expect(children[2]!.visualDepth - children[0]!.visualDepth).toBe(2);
    expect(children[3]!.visualDepth - children[0]!.visualDepth).toBe(3);
    expect(byKey.get("child-1")!.y).toBeGreaterThan(byKey.get("child-0")!.y);
  });

  it("does not allow a normal child to rise above a parent offset by two bands", () => {
    const offsetParent = childNode("offset-parent", "Offset parent", 2);
    const normalChild = {
      ...childNode("normal-child", "Normal child"),
      parentNodeKey: offsetParent.stableKey,
    };
    const roots = buildOrganizationTree([baseNode, offsetParent, normalChild], []);
    const parent = roots[0]!.children[0]!;
    const child = parent.children[0]!;

    expect(parent.visualDepth).toBe(3);
    expect(child.requestedVisualDepth).toBe(2);
    expect(child.visualDepth).toBeGreaterThan(parent.visualDepth);
  });

  it("keeps unrelated nodes with an equal resolved visual depth on one global row", () => {
    const offsetParent = childNode("offset-parent", "Offset parent", 1);
    const offsetChild = {
      ...childNode("offset-child", "Offset child"),
      parentNodeKey: offsetParent.stableKey,
    };
    const peer = childNode("peer", "Peer", 2);
    const roots = buildOrganizationTree([baseNode, offsetParent, offsetChild, peer], []);
    const layout = layoutOrganizationChart({
      roots,
      expandedKeys: new Set(["foundation", "offset-parent"]),
      cardWidth: 280,
      columnGap: 32,
      rowGap: 52,
      defaultCardHeight: 132,
    });
    const byKey = new Map(layout.items.map((item) => [item.item.stableKey, item]));
    const resolvedParent = roots[0]!.children.find((item) => item.stableKey === "offset-parent")!;
    const resolvedPeer = roots[0]!.children.find((item) => item.stableKey === "peer")!;
    const resolvedChild = resolvedParent.children[0]!;

    expect(resolvedParent.visualDepth).toBe(2);
    expect(resolvedPeer.visualDepth).toBe(3);
    expect(resolvedChild.visualDepth).toBe(3);
    expect(byKey.get("peer")?.y).toBe(byKey.get("offset-child")?.y);
  });

  it("uses the tallest measured card in a visual-depth band for every descendant row", () => {
    const first = childNode("first", "First");
    const second = childNode("second", "Second");
    const firstChild = {
      ...childNode("first-child", "First child"),
      parentNodeKey: "first",
    };
    const secondChild = {
      ...childNode("second-child", "Second child"),
      parentNodeKey: "second",
    };
    const roots = buildOrganizationTree(
      [baseNode, first, second, firstChild, secondChild],
      [],
    );
    const layout = layoutOrganizationChart({
      roots,
      expandedKeys: new Set(["foundation", "first", "second"]),
      measuredHeights: new Map([
        ["first", 100],
        ["second", 260],
      ]),
      cardWidth: 280,
      columnGap: 32,
      rowGap: 52,
      defaultCardHeight: 132,
    });
    const byKey = new Map(
      layout.items.map((item) => [item.item.stableKey, item]),
    );

    expect(layout.bandHeights.get(1)).toBe(260);
    expect(byKey.get("first-child")?.y).toBe(byKey.get("second-child")?.y);
    expect(byKey.get("first-child")?.y).toBe(496);
  });

  it("draws sibling junctions only between actual child centers with no one-child overhang", () => {
    const oneChild = renderChart(
      [baseNode, childNode("only", "Only")],
      [vacantPosition],
    );
    const manyChildren = renderChart(
      [
        baseNode,
        childNode("first", "First"),
        childNode("middle", "Middle"),
        childNode("last", "Last"),
      ],
      [vacantPosition],
    );

    expect(oneChild).toMatch(/d="M 140 132 V 158 H 140 V 184"/);
    expect(manyChildren).toContain('data-connector-from="foundation"');
    expect(manyChildren).not.toContain('data-connector-kind="sibling-segment"');
    expect(manyChildren).not.toContain("border-t border-brand-primary/40");
  });

  it("shows human-facing governance identity and email on position cards", () => {
    const governancePosition: OrganizationPosition = {
      ...vacantPosition,
      holderSource: "ACCOUNT",
      primaryIncumbent: {
        employeeId: null,
        accountId: "board-account-id",
        accountEmail: "secretary@example.test",
        accountStatus: "active",
        employeeName: "secretary@example.test",
        effectiveFrom: "2027-01-01",
        effectiveTo: null,
      },
    };
    const html = renderChart([baseNode], [governancePosition]);

    expect(html).toContain("secretary@example.test");
    expect(html).toContain(">ORGAN YAYASAN</span>");
    expect(html).not.toContain("VACANT · Belum ada pejabat");
  });

  it("localizes node types, keeps cards compact, and de-emphasizes zero members", () => {
    const html = renderChart(
      [{ ...baseNode, memberCount: 0 }],
      [vacantPosition],
    );

    expect(organizationNodeTypeLabel("FOUNDATION")).toBe(
      "Yayasan",
    );
    expect(organizationNodeTypeLabel("DIRECTORATE")).toBe(
      "Bidang",
    );
    expect(html).toContain("Yayasan");
    expect(html).not.toContain("0 anggota");
    expect(html).toContain("w-[17.5rem]");
    expect(html).not.toContain("w-[22rem]");
  });

  it("keeps long labels accessible and acting incumbency visually distinct", () => {
    const longName =
      "Direktorat Pendidikan dan Pengembangan Kurikulum Terpadu Sabilul Qur'an";
    const actingPosition: OrganizationPosition = {
      ...vacantPosition,
      actingIncumbent: {
        employeeId: "acting-id",
        employeeName: "Pegawai Acting Sintetis",
        effectiveFrom: "2027-01-01",
        effectiveTo: "2027-03-31",
      },
    };
    const html = renderChart(
      [{ ...baseNode, name: longName }],
      [actingPosition],
    );

    expect(html).toContain(`title="${longName.replaceAll("'", "&#x27;")}"`);
    expect(html).toContain("Pegawai Acting Sintetis · Pelaksana tugas");
    expect(html).toContain("PLT");
  });
});
