export const MIN_CANVAS_ZOOM = 0.4;
export const MAX_CANVAS_ZOOM = 1.4;

// A visual offset advances by a complete renderer row pitch, not a fraction of
// a card. Nodes and compact position lanes use distinct fixed pitches.
export const ORGANIZATION_NODE_VISUAL_BAND_HEIGHT = 160;
export const ORGANIZATION_POSITION_VISUAL_BAND_HEIGHT = 64;

export function visualBandOffset(offset: number, bandHeight: number): number {
  return Math.max(0, Math.trunc(offset)) * bandHeight;
}

const nodeTypeLabels: Record<string, string> = {
  FOUNDATION: "Yayasan / Foundation",
  DIRECTORATE: "Direktorat / Bidang",
  UNIT: "Unit",
  SCHOOL: "Sekolah",
  DIVISION: "Divisi",
  DEPARTMENT: "Departemen",
  TEAM: "Tim",
};

export function organizationNodeTypeLabel(value: string): string {
  return nodeTypeLabels[value] ?? value.toLowerCase().replaceAll("_", " ");
}

export function clampCanvasZoom(value: number): number {
  return Math.min(
    MAX_CANVAS_ZOOM,
    Math.max(MIN_CANVAS_ZOOM, Math.round(value * 100) / 100),
  );
}

export function fitZoomForViewport(input: {
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}): number {
  if (input.contentWidth <= 0 || input.contentHeight <= 0) return 1;
  const availableWidth = Math.max(1, input.viewportWidth - 48);
  const availableHeight = Math.max(1, input.viewportHeight - 48);
  return clampCanvasZoom(
    Math.min(1, availableWidth / input.contentWidth, availableHeight / input.contentHeight),
  );
}

export function centeredScrollOffset(input: {
  itemStart: number;
  itemSize: number;
  viewportSize: number;
  zoom: number;
}): number {
  return Math.max(
    0,
    (input.itemStart + input.itemSize / 2) * input.zoom - input.viewportSize / 2,
  );
}
