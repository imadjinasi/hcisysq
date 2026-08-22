import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrganizationChart } from "@/components/organization/OrganizationChart";
import type { OrganizationNode, OrganizationPosition } from "@/lib/organizationDesigner";
import { buildOrganizationTree } from "@/lib/organizationTree";

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

describe("Organization Designer chart", () => {
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

  it("renders a real vacancy separately from visual-rank presentation", () => {
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
    expect(html).toContain("Tampilan 2 tingkat lebih rendah");
  });
});
