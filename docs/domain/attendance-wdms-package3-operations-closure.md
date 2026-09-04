# ATT-005 Package 3 — WDMS Operations & Closure

Status: IMPLEMENTATION — PRODUCTION VERIFICATION PENDING  
Updated: 2026-09-02

> **Historical cutoff note:** this document records the Package 3 completion boundary as it existed on 2026-09-02. Statements below that call physical Work Code/message delivery, configuration, reboot, firmware, biometric, or destructive operations `not verified`, `blocked`, or “no executable endpoint” describe that historical cutoff. The current ATT-005 physical capability contract, typed controls, and evidence states are maintained in `docs/domain/attendance-wdms-full-physical-parity.md` and its evidence ledger; do not use this historical snapshot as current capability truth.

## Purpose

Package 3 is the final large ATT-005 repository delivery package. It completes the HCIS-side operations plane that can be implemented without inventing or guessing unsupported ZKTeco wire commands.

This document deliberately distinguishes:

1. **implemented HCIS-side operations** — safe operations whose behavior is fully owned by HCIS;
2. **verified physical device operations** — operations whose exact device command has already been proven on the production firmware;
3. **not verified / blocked physical operations** — WDMS-reference capabilities that remain visible as capability state but have no executable API/UI action until separate hardware protocol evidence exists.

Package completion MUST NOT be interpreted as proof that every ZKBio WDMS physical command is supported by the deployed firmware.

## Fixed boundaries

The following invariants remain mandatory:

- active USERINFO reads remain RETIRED;
- no arbitrary device command endpoint exists;
- biometric collection remains globally OFF until a separate approved biometric hardware gate;
- raw biometric/template/ciphertext/hash/IV/auth-tag/key material remains absent from normal API/UI;
- raw attendance events are punch/correction facts only;
- no lateness, absence, work-hour, overtime, payroll, annual-leave, or attendance-resolution inference is performed by ADMS ingestion/import/export;
- manual attendance is never overwritten by fingerprint projection;
- historical mapping is effective-dated and explicit;
- unsupported device commands are never inferred from WDMS UI labels or third-party protocol descriptions;
- HCIS raw ADMS history is never deleted by device-maintenance actions.

## Delivered HCIS-side operations

### Work Code catalog

HCIS owns a neutral Work Code catalog:

- code;
- label;
- active/inactive state;
- desired per-device state (`present` / `absent`);
- delivery evidence state.

Until a physical Work Code command is separately proven, target rows remain `delivery_state=not_verified` and updating desired state creates **zero device commands**.

A Work Code is retained as raw transaction metadata only. Its presence MUST NOT automatically classify attendance, overtime, payroll, or leave.

### Device-message catalog

HCIS can prepare:

- public messages;
- private messages linked explicitly to one employee;
- title/body;
- optional validity window;
- active state;
- desired per-device state.

The catalog does not imply physical delivery. Message delivery/removal remains `not_verified` until exact firmware-safe wire behavior is proven.

### Raw transaction CSV export

SUPER_ADMIN can export durable transaction facts for one device.

Export fields are deliberately factual:

- device serial;
- raw device timestamp;
- normalized timestamp;
- HCIS receive timestamp;
- PIN;
- raw Work Code field when available;
- effective employee mapping when available;
- provenance classification.

Export does not contain derived attendance-policy outcomes.

### Offline ATTLOG import

Offline import is a fallback for a device/file workflow when normal PUSH/recovery transport is unavailable.

The import MUST reuse the canonical ADMS pipeline semantics:

1. maximum 512 KiB payload per import;
2. device must be lifecycle `active`;
3. identical file hash for the same device is rejected;
4. source is journaled in `attendance_adms_request_journal`;
5. existing `parseAttlogText` parses records using the device timezone;
6. malformed records are quarantined;
7. `attlogEventIdentity` provides the same exact-event dedupe identity as normal ingestion;
8. duplicate exact events are quarantined as `DUPLICATE_EXACT`;
9. new rows are appended to `attendance_adms_events`;
10. mapped employee/date targets use the existing neutral projection;
11. manual attendance protection remains active;
12. the response records `deviceCommandsRequested: 0`.

No synthetic or test ATTLOG may be imported into production merely to prove the UI.

### Saved operational filters

SUPER_ADMIN can persist personal filter criteria for:

- Transactions;
- Commands;
- future operational log views.

Saved filters are HCIS-only UI state. They do not change device behavior.

### Pending-command cleanup

The maintenance action `clear pending` is intentionally narrow:

- only `attendance_adms_commands.status = pending` rows are cancelled;
- each cancellation receives an append-only command event;
- delivered, acknowledged, succeeded, failed, expired, queued, and already-cancelled commands are not mutated;
- no new device command is created.

This is not equivalent to clearing data on the physical device.

## Capability matrix

| Capability | State after Package 3 | Execution boundary |
| --- | --- | --- |
| Device registry / health | implemented | HCIS + passive PUSH evidence |
| `INFO` | verified | proven device command |
| realtime ATTLOG | verified | device PUSH |
| `LOG` recovery | verified | proven device command |
| bounded ATTLOG recovery | verified | proven device command |
| long-range recovery | implemented | serialized proven bounded commands |
| raw transaction export | implemented | HCIS-only |
| offline ATTLOG import | implemented | HCIS-only |
| mapping/review | implemented | HCIS-only explicit mapping |
| same-PIN name write | verified narrow capability | proven device command; no active USERINFO readback |
| active USERINFO read | retired | blocked by application + DB |
| Work Code catalog | implemented | HCIS-only |
| Work Code delivery | not verified | no executable endpoint |
| public/private message catalog | implemented | HCIS-only |
| message delivery/removal | not verified | no executable endpoint |
| biometric control plane/vault metadata | implemented | HCIS-only, collection OFF |
| biometric query/restore/distribution/enrollment/delete | not verified | no executable hardware action |
| time/timezone sync | not verified | no executable endpoint |
| duplicate-punch configuration | not verified | no executable endpoint |
| reboot | not verified | no executable endpoint |
| firmware upgrade | not verified | no executable endpoint |
| clear attendance on device | blocked | break-glass + physical proof required |
| clear photo/cache on device | blocked | break-glass + physical proof required |
| selected biometric delete on device | blocked | separate from HCIS master; physical proof required |
| clear all device data | blocked | break-glass + physical proof required |
| operational retention deletion | policy required | no automatic deletion enabled |

`not verified` and `blocked` are legitimate parity outcomes. They must never be represented as successful physical support.

## Admin experience

Device detail adds one integrated `Operasional` tab instead of many micro-pages.

The page contains:

- operational status and pending-command count;
- Work Code catalog;
- public/private message planning;
- CSV export;
- offline ATTLOG import;
- pending-command cleanup;
- offline-import history;
- explicit capability matrix.

Physical capabilities with no evidence have no hidden action button and no generic/raw command escape hatch.

## Data model

Migration `0036_attendance_adms_wave3_operations.sql` adds:

- `attendance_adms_work_codes`;
- `attendance_adms_work_code_targets`;
- `attendance_adms_device_messages`;
- `attendance_adms_device_message_targets`;
- `attendance_adms_saved_filters`;
- `attendance_adms_offline_imports`.

The migration is additive. It does not remove existing ADMS data and does not weaken the command allowlist.

Admin audit actions are extended for Work Code/message planning, offline import, saved filters, and pending-command cleanup.

## Security and authorization

All Wave 3 Admin routes require `SUPER_ADMIN`.

Normal responses:

- set `Cache-Control: no-store` where sensitive operational state is returned;
- do not return biometric payload/key material;
- do not expose arbitrary command execution;
- do not create device commands for HCIS-only operations.

## Production deployment gate

Normal Package 3 deployment must use the standard flow:

```text
CODE → PR/MERGE → CI GREEN → 1x DEPLOY VPS → 1x VERIFY → targeted UAT → DONE
```

Production preconditions:

- `BIOMETRIC_COLLECTION_ENABLED=0`;
- retired USERINFO DB guard present;
- backup completed before migration;
- migration `0036` applied;
- API/Web/Postgres healthy;
- no destructive device operation enabled.

`verify-vps.sh` must complete with:

```text
verification_device_commands_requested=0
```

The verifier itself must not enqueue any device command.

## UAT boundary

Production UAT is passive/read-only unless separately approved.

Expected checks:

- `Operasional` tab renders normally;
- capability matrix shows unverified/blocked hardware operations as non-executable;
- Work Code/message sections clearly state that delivery is not verified;
- export control is visible;
- offline import control is visible but **do not import synthetic attendance data**;
- clear-pending control is not used unless a known stale pending queue actually needs cleanup;
- no USERINFO or biometric hardware control reappears;
- zero device commands are required to close the deployment.

## ATT-005 completion semantics

After repository implementation, CI, production deployment, verifier, and passive UAT pass, Package 3 is `VERIFIED` for the implemented HCIS scope.

ATT-005 must still describe unsupported/unverified physical capabilities honestly. Repository completion does **not** authorize changing those capability states to verified and does **not** authorize activating biometric collection.

A future physical capability can move from `not_verified` only through a separate protocol-specific safety design, controlled canary, and explicit approval.
