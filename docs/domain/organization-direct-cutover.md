# Organization Direct Cutover

Status: ACTIVE product decision

## Decision

HCIS uses the published Organization structure as the single source of approval and reporting authority for new workflow requests.

There is no operational LEGACY or SHADOW phase. Migration-era rollout modes and legacy employee/unit approval fields are compatibility artifacts only. They must not:

- decide approval for new requests;
- act as a fallback when Organization resolution fails;
- block Employee Master lifecycle operations;
- appear as editable business configuration in the normal admin UI.

If Organization authority cannot be resolved, the workflow fails closed and the structure must be corrected explicitly.

## Request snapshots

A request snapshots its concrete approvers when submitted. Later Organization changes affect future requests only. Existing in-flight requests continue from their stored approval steps and are not re-resolved.

## Deployment gate

Before enabling a release that enforces direct Organization resolution in production, audit every active employee who participates in the affected workflow using the real resolver and effective published structure.

Deployment is blocked when any required route is unresolved or when a required approver is not eligible to act. Do not repair readiness with title inference, name inference, hidden legacy fallback, default passwords, or forced account activation.

## Administration language

Normal GUI copy uses Indonesian business terms rather than implementation identifiers. Examples:

- Atasan langsung
- Penyetuju unit
- Penyetuju Pengurus Yayasan
- Penerima pemberitahuan
- Persetujuan & Pelaporan
- Posisi kosong
- Struktur Organisasi

Implementation tokens such as LEGACY, SHADOW, STRUCTURE, rollout, raw authority codes, UUIDs, or IANA timezone names are not normal operator-facing copy.

Internal date/time calculations may use IANA timezone identifiers. User-facing Indonesian time labels use WIB, WITA, or WIT as appropriate.

## Legacy schema cleanup

Legacy columns/tables may remain temporarily only to preserve migration safety and historical compatibility. Once the direct-cutover release has been proven in production and no supported code path reads them operationally, remove them in a dedicated migration with backup and rollback planning.
