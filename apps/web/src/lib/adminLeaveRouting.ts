/**
 * Compatibility copy helpers for older call sites.
 * The product has one approval source: the published Organization structure.
 */
export function routingSource(_state?: unknown) {
  return "Struktur Organisasi";
}

export function modeCopy(_mode?: unknown) {
  return "Alur persetujuan mengikuti Struktur Organisasi yang sudah diterbitkan.";
}
