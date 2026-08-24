import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrganizationChart } from "@/components/organization/OrganizationChart";
import type { OrganizationNode, OrganizationPosition } from "@/lib/organizationDesigner";
import {
  centeredScrollOffset,
  fitZoomForViewport,
  ORGANIZATION_NODE_VISUAL_BAND_HEIGHT,
  ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT,
  organizationNodeTypeLabel,
  visualBandGap,
  visualBandOffset,
} from "@/lib/organizationCanvas";
import { buildOrganizationTree, selectableOrganizationParents } from "@/lib/organizationTree";

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

function renderChart(nodes: OrganizationNode[], positions: OrganizationPosition[]) {
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

    expect(selectableOrganizationParents([baseNode, child], "child", baseNode.stableKey))
      .toContainEqual(baseNode);
    expect(selectableOrganizationParents([baseNode, child], "edit", baseNode.stableKey))
      .not.toContainEqual(baseNode);
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

  it("calculates fit-to-view and center-selected offsets for a laptop viewport", () => {
    expect(fitZoomForViewport({
      contentWidth: 2400,
      contentHeight: 900,
      viewportWidth: 1000,
      viewportHeight: 600,
    })).toBe(0.4);
    expect(centeredScrollOffset({ itemStart: 900, itemSize: 280, viewportSize: 1000, zoom: 0.8 }))
      .toBe(332);
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

    expect(html).toContain('data-sibling-parent="foundation"');
    expect(html).toContain('data-layout-axis="horizontal"');
    expect(html).toMatch(/data-node-key="sdit"[^>]*data-structural-depth="1"[^>]*data-visual-band="1"/);
    expect(html).toMatch(/data-node-key="smpit"[^>]*data-structural-depth="1"[^>]*data-visual-band="1"/);
  });

  it("renders a child below its parent with a visible structural connector", () => {
    const child = childNode("sdit", "SDIT");
    const html = renderChart([baseNode, child], [vacantPosition]);

    expect(html).toContain('data-child-level-of="foundation"');
    expect(html).toMatch(/data-connector-kind="node"[^>]*data-connector-from="foundation"[^>]*data-connector-to="sdit"/);
    expect(html).toMatch(/data-node-key="foundation"[^>]*data-structural-depth="0"/);
    expect(html).toMatch(/data-node-key="sdit"[^>]*data-structural-depth="1"/);
  });

  it("uses node visual offset as a real lower layout band", () => {
    const bureau = childNode("quran-bureau", "Al-Qur'an Bureau", 1);
    const html = renderChart([baseNode, bureau], [vacantPosition]);

    expect(html).toMatch(/data-node-key="quran-bureau"[^>]*data-structural-depth="1"[^>]*data-visual-band="2"[^>]*data-visual-rank-offset="1"/);
    expect(visualBandOffset(1, ORGANIZATION_NODE_VISUAL_BAND_HEIGHT)).toBe(160);
    expect(visualBandGap(0, 2, ORGANIZATION_NODE_VISUAL_BAND_HEIGHT)).toBe(160);
    expect(html).toContain('style="height:188px"');
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

    expect(html).toMatch(/data-position-key="vice-principal"[^>]*data-parent-position-key="director"[^>]*data-structural-depth="1"[^>]*data-visual-band="3"/);
    expect(visualBandOffset(2, ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT)).toBe(128);
    expect(visualBandGap(0, 3, ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT)).toBe(128);
    expect(html).toContain('style="height:144px"');
    expect(html).toMatch(/data-connector-kind="position"[^>]*data-connector-from="director"[^>]*data-connector-to="vice-principal"/);
  });

  it("keeps connectors attached to the structural parent after a visual-only change", () => {
    const normal = childNode("quran-bureau", "Al-Qur'an Bureau", 0);
    const offset = { ...normal, visualRankOffset: 2 };
    const normalTree = buildOrganizationTree([baseNode, normal], [vacantPosition]);
    const offsetTree = buildOrganizationTree([baseNode, offset], [vacantPosition]);
    const html = renderChart([baseNode, offset], [vacantPosition]);

    expect(offsetTree[0].children[0].parentNodeKey).toBe(normalTree[0].children[0].parentNodeKey);
    expect(offsetTree[0].children[0].structuralDepth).toBe(normalTree[0].children[0].structuralDepth);
    expect(offsetTree[0].children[0].visualDepth).toBe(normalTree[0].children[0].visualDepth + 2);
    expect(vacantPosition.vacancyPolicy).toBe("CLIMB_TO_PARENT");
    expect(html).toMatch(/data-connector-from="foundation"[^>]*data-connector-to="quran-bureau"/);
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

  it("aligns equal computed visual depths to the same visual band for offsets 0 through 3", () => {
    const levelOne = childNode("level-one", "Level one", 1);
    const levelTwo: OrganizationNode = {
      ...childNode("level-two", "Level two", 0),
      parentNodeKey: levelOne.stableKey,
    };
    const roots = [0, 1, 2, 3].map((offset) => ({
      ...baseNode,
      id: `root-${offset}`,
      stableKey: `root-${offset}`,
      name: `Root ${offset}`,
      visualRankOffset: offset,
      leaderPositionKey: null,
    }));
    const tree = buildOrganizationTree([baseNode, levelOne, levelTwo, ...roots], []);
    const main = tree.find((item) => item.stableKey === baseNode.stableKey)!;

    expect(main.children[0]!.visualDepth).toBe(2);
    expect(main.children[0]!.children[0]!.visualDepth).toBe(2);
    expect(roots.map((item) => tree.find((entry) => entry.stableKey === item.stableKey)?.visualDepth))
      .toEqual([0, 1, 2, 3]);
  });

  it("draws sibling junctions only between actual child centers with no one-child overhang", () => {
    const oneChild = renderChart([baseNode, childNode("only", "Only")], [vacantPosition]);
    const manyChildren = renderChart([
      baseNode,
      childNode("first", "First"),
      childNode("middle", "Middle"),
      childNode("last", "Last"),
    ], [vacantPosition]);

    expect(oneChild).not.toContain('data-connector-kind="sibling-segment"');
    expect(manyChildren.match(/data-connector-kind="sibling-segment"/g)).toHaveLength(3);
    expect(manyChildren).toContain("left-1/2 right-0");
    expect(manyChildren).toContain("left-0 right-1/2");
    expect(manyChildren).not.toContain('style="left:8.75rem;right:8.75rem"');
    expect(manyChildren).not.toContain("border-t border-brand-primary/40");
  });

  it("shows ACCOUNT identity and email on governance position cards", () => {
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
    expect(html).toContain(">ACCOUNT</span>");
    expect(html).not.toContain("VACANT · Belum ada pejabat");
  });

  it("localizes node types, keeps cards compact, and de-emphasizes zero members", () => {
    const html = renderChart([{ ...baseNode, memberCount: 0 }], [vacantPosition]);

    expect(organizationNodeTypeLabel("FOUNDATION")).toBe("Yayasan / Foundation");
    expect(organizationNodeTypeLabel("DIRECTORATE")).toBe("Direktorat / Bidang");
    expect(html).toContain("Yayasan / Foundation");
    expect(html).not.toContain("0 anggota");
    expect(html).toContain("w-[17.5rem]");
    expect(html).not.toContain("w-[22rem]");
  });

  it("keeps long labels accessible and acting incumbency visually distinct", () => {
    const longName = "Direktorat Pendidikan dan Pengembangan Kurikulum Terpadu Sabilul Qur'an";
    const actingPosition: OrganizationPosition = {
      ...vacantPosition,
      actingIncumbent: {
        employeeId: "acting-id",
        employeeName: "Pegawai Acting Sintetis",
        effectiveFrom: "2027-01-01",
        effectiveTo: "2027-03-31",
      },
    };
    const html = renderChart([{ ...baseNode, name: longName }], [actingPosition]);

    expect(html).toContain(`title="${longName.replaceAll("'", "&#x27;")}"`);
    expect(html).toContain("Pegawai Acting Sintetis · Pelaksana tugas");
    expect(html).toContain("PLT");
  });
});
