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

A request snapshots its concrete approval principal when submitted. Ordinary
authorities use an Employee principal; an explicitly bound governance authority
may use a `FOUNDATION_BOARD` Account principal. Exactly one principal is stored
per step. Later Organization or account changes affect future submissions only:
existing in-flight steps keep their stored principal and are not re-resolved.

## Structural selection and actionability

The published Organization snapshot decides **who** holds an authority. Employee
status and structural vacancy policy participate in that selection. Login and
capability readiness are checked only after the structural incumbent has been
selected. A missing, invited, suspended, or inactive account—or a missing
workflow capability—fails the new request against that selected authority and
must never trigger vacancy climbing to a different person.

Account-held positions are valid only for explicit governance approval and
oversight semantics. Director Leave therefore snapshots the configured Secretary
board account as its approval step; the separately configured Chair board account
receives the final informational notification and is not another approval step.
Neither identity requires a synthetic Employee record. Governance approval uses
the narrow `leave.governance.approve` capability and does not grant employee or
administrative authority.

Super Admin assigns this capability from `Akses Organ Yayasan` as
`Penyetuju cuti Pengurus Yayasan`. The assignment is always organization-wide;
the GUI does not expose raw role IDs, permission keys, or scope enums. Server-side
principal-role compatibility blocks every other Board operational role and blocks
the governance role from Employee accounts.

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
