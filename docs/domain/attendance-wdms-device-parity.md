# ATT-005 — WDMS-Compatible Fingerprint Device Operations

**Status:** ACCEPTED

## Decision

HCIS YSQ shall provide a fingerprint-device operational surface with functional parity to the parts of ZKBio WDMS that are appropriate for an internal HCIS deployment.

ZKBio WDMS is the primary behavior/reference source for device operations. RuangHadir may still be used as an implementation reference, but it is not authoritative for protocol or product behavior.

Reference baseline:

- ZKBio WDMS 9.0.5 User Manual (2025-08-15);
- ZKBio WDMS 9.0.7 as the current published WDMS software release observed in 2026-08;
- ZKTeco PUSH protocol documentation for wire-level behavior;
- physical-device observations from HCIS production canaries.

This is an approved HCIS product-scope decision. Implementation follows the accelerated execution plan in `docs/domain/attendance-wdms-implementation-plan.md`.

## Product boundary

HCIS is an internal SQ system, not a commercial multi-tenant SaaS product.

HCIS owns:

- fingerprint-device registration and operational configuration;
- connectivity and device health;
- protocol transport, command delivery, command result tracking and reconciliation;
- raw attendance ingestion;
- device-to-employee mapping;
- HCIS employee/device synchronization;
- biometric credential backup, restore and synchronization for managed attendance devices;
- operational logs, audits and reporting related to devices.

HCIS must not recreate a second employee, organization, authentication or authorization source of truth merely because WDMS contains those modules.

For biometric management, HCIS Employee remains the identity owner. HCIS stores biometric credential material as managed device credentials associated with the employee; physical devices hold synchronized replicas used for local verification.

## Core invariants

1. `attendance_daily_records` remains factual punch/correction data only.
2. Raw device evidence is immutable after durable capture.
3. Device commands and device configuration never infer late, absence, overtime, working hours, payroll deduction, leave conversion or attendance-resolution outcomes.
4. Leading-zero device PINs are preserved exactly.
5. Device identity is explicit and auditable.
6. Unknown devices may be detected automatically but are not trusted automatically.
7. Destructive device actions are break-glass operations with confirmation and audit.
8. HCIS employee and organization data remain the source of truth for SQ personnel and organization concepts.
9. Biometric credential material is sensitive managed data: encrypted at rest, never written to routine logs, never exposed in ordinary attendance APIs, and every import/export/delete/sync operation is authorized and audited.
10. HCIS does not perform biometric matching, reverse engineering or conversion of vendor templates. Vendor template payloads are preserved losslessly with modality, format/version and provenance metadata.
11. Device behavior is capability-driven; unsupported commands are not exposed for devices that do not advertise or prove support.

## WDMS parity matrix

### A. Device registry and discovery — INCLUDE / ADAPT

Implement:

- manual device add;
- automatic device discovery/add;
- device name and serial number;
- device IP / last source IP;
- device model;
- firmware version;
- push/protocol version;
- timezone;
- device area/context;
- attendance-device role;
- heartbeat request configuration;
- transfer mode configuration;
- last activity;
- last sync;
- user count;
- fingerprint count;
- face count;
- palm count;
- transaction count;
- online/offline state.

HCIS adaptation:

- auto-discovered devices enter `detected` / `claim_pending`, not `active`;
- admin explicitly claims/activates and assigns display name/work-location context;
- WDMS `Area` maps to HCIS Work Location / optional organization context instead of creating a parallel personnel hierarchy;
- biometric counts are observability metadata and may be reconciled against HCIS biometric-vault inventory where protocol detail is sufficient.

### B. Connectivity and communication policy — INCLUDE

Implement:

- heartbeat-derived online/offline state;
- configurable heartbeat interval where supported;
- realtime transfer mode;
- scheduled/specified transfer mode;
- global/default transfer policy plus per-device override;
- default timezone policy;
- last successful request;
- last command execution/activity;
- transport diagnostics;
- connectivity auto-refresh in Admin UI.

Online/offline is distinct from lifecycle. Initial server health policy may derive connectivity from recent request activity but must remain configurable rather than firmware-hardcoded.

### C. Durable device command subsystem — INCLUDE

Implement a durable command queue for `/iclock/getrequest` plus command-result ingestion through `/iclock/devicecmd`.

Command state must distinguish at least:

- pending;
- delivered;
- acknowledged;
- succeeded;
- failed;
- expired;
- cancelled.

Admin capabilities:

- view command list and execution result;
- clear/cancel pending commands;
- archive old command-log presentation without deleting immutable audit evidence;
- retry only where the command is explicitly safe/idempotent.

Every command issuance and result is audited.

### D. Data transfer and attendance recovery — INCLUDE

Implement WDMS-equivalent data-transfer operations:

- Upload Transaction — all transactions;
- Upload Transaction — start/end time range;
- request current/new transactions immediately;
- reconnect catch-up;
- explicit historical re-upload;
- transaction-count verification/reconciliation where protocol/device supports it;
- periodic bounded reconciliation windows;
- exact event deduplication;
- durable request journal and upload log;
- automatic cursor recovery from durable acknowledged history where safe;
- registration-after-capture recovery for durable unknown-device ATTLOG.

Realtime push is an optimization, not the only reliability mechanism. Missed realtime punches must be recoverable from device storage while the source record still exists on the device.

### E. Employee/device data synchronization — INCLUDE / ADAPT

HCIS employee master remains authoritative.

Implement:

- device-specific employee roster view;
- upload user data from device for reconciliation/diagnostics;
- send/synchronize selected HCIS employees to selected devices;
- re-synchronize employee data to device;
- re-upload device user data for comparison;
- device privilege/verify-mode metadata where available;
- active/inactive/resigned filtering based on HCIS employee state;
- card-number synchronization where supported;
- employee name synchronization where supported;
- explicit device PIN assignment/mapping;
- conflict detection before pushing roster changes;
- synchronize managed biometric credentials when explicitly selected or required by roster policy.

Do not create a second WDMS-style Personnel master.

### F. Work Code — INCLUDE, POLICY-NEUTRAL

Implement where supported:

- create/manage work-code catalog for device use;
- issue work code to one or more devices;
- remove work code from devices;
- display work code in raw attendance evidence.

Work code must not automatically imply overtime, leave, payroll treatment or attendance status.

### G. Messages — INCLUDE IF DEVICE CAPABILITY EXISTS

Support public/private short messages where supported:

- create public device message;
- create employee-targeted/private message;
- schedule start/duration;
- send to selected device(s);
- remove message from device;
- delivery/result logging.

This remains a device capability, not a replacement for HCIS notification channels.

### H. Device operations — INCLUDE WITH GUARDS

Implement where protocol/device support is proven:

- Read Information;
- Reboot;
- time/timezone synchronization;
- duplicate-punch-period configuration;
- capture-setting metadata/configuration;
- firmware version inspection;
- firmware upgrade workflow;
- selected device configuration read/write;
- clear pending commands.

Firmware upgrade requires:

- SUPER_ADMIN;
- explicit target device;
- vendor-compatible firmware package;
- preflight capability/model match;
- irreversible-action warning;
- audit trail;
- no automatic all-device rollout.

### I. Destructive device maintenance — INCLUDE AS BREAK-GLASS

Support only behind a dedicated break-glass flow:

- clear attendance data on device;
- clear capture-photo cache on device, if applicable;
- clear biometric credentials for a selected person/device;
- clear all device data.

Required safeguards:

- SUPER_ADMIN only;
- typed serial confirmation for device-wide destructive operations;
- explicit employee confirmation for per-person biometric deletion;
- recent successful device contact;
- explicit explanation of what is deleted;
- immutable admin audit event;
- no deletion of HCIS raw attendance evidence;
- warn if reconciliation is incomplete before attendance-data clearing;
- `clear all data` visually and permission-wise separated from routine operations.

Device-side deletion and HCIS-vault deletion are separate operations. Clearing a device must never silently delete the HCIS backup copy.

### J. Transaction and device observability — INCLUDE

Implement:

- transaction table;
- filter by device, employee/PIN, date/time range and source;
- raw device timestamp and received timestamp;
- device information and mapping context;
- export CSV/XLSX-compatible data where appropriate;
- upload/import of supported offline transaction files as fallback;
- operation log;
- device error log where uploaded by device;
- upload log;
- command log;
- admin audit log;
- data-retention configuration for operational logs, subject to HCIS retention policy.

Raw request bodies and biometric payloads must not be exposed casually in Admin UI. Diagnostics present safe summaries by default.

### K. Attendance photos — INCLUDE WHERE SUPPORTED

Support attendance-photo ingestion where managed devices provide it, with restricted access, encrypted storage, provenance, retention and audit controls.

Attendance photos are transaction evidence. HCIS does not use them for automated biometric matching unless a future separately approved capability introduces that processing.

### L. Biometric template and Bio-Photo vault — INCLUDE / HIGH SENSITIVITY

HCIS shall provide central biometric credential management as part of attendance-device management.

Supported credential classes, when device/protocol support exists:

- fingerprint templates;
- face templates;
- palm templates;
- face/bio-photo used for device enrollment or credential distribution;
- card credential metadata where applicable.

Required capabilities:

- import/upload credential data from managed devices into HCIS;
- associate imported credentials with canonical HCIS Employee after explicit or deterministic reconciliation;
- preserve multiple fingerprint slots/fingers and vendor template versions when required;
- store modality, vendor format/version, origin device, device user/PIN, capture/import time and integrity hash;
- backup credentials independently from continued availability of the source device;
- restore credentials to the same device after reset/replacement;
- synchronize selected credentials to compatible devices;
- compare HCIS credential inventory with per-device inventory;
- identify missing/stale/conflicting credentials before synchronization;
- delete selected credential from selected devices without deleting HCIS master copy;
- delete HCIS master credential only through a separate explicit audited sensitive-data lifecycle action;
- support remote enrollment when a proven device/protocol flow exists, including retrieval of resulting credential into HCIS where supported;
- expose sync status and last successful distribution per credential/device.

Source-of-truth model:

```text
HCIS Employee
    -> HCIS Biometric Credential Vault (managed master copy)
        -> Device A replica
        -> Device B replica
        -> Device C replica
```

HCIS stores vendor credential payloads losslessly. HCIS does not decode fingerprint minutiae, compare faces/palms, authenticate people itself, or translate incompatible template formats. Cross-device synchronization is allowed only when capability/model/template compatibility is known or proven.

Security requirements:

- application-level encryption at rest using deployment secrets/key management;
- encrypted backup behavior;
- biometric payload never in routine logs, request logs, error traces, analytics or audit metadata;
- normal list/detail APIs return metadata, not raw credential bytes;
- ordinary Admin UI does not expose raw credential export/download;
- import, enrollment, restore, sync, delete and exceptional export actions produce immutable audit events;
- least-privilege authorization separates ordinary attendance administration from sensitive biometric administration when the permission model expands;
- searchable integrity/dedup metadata may be relational, while template payload remains opaque;
- production biometric collection requires explicit retention, backup and credential-deletion policy.

### M. WDMS Personnel module — DO NOT DUPLICATE

Do not recreate WDMS Company, Department, Position, Personnel, resignation, custom personnel attributes or personnel-transfer workflows as parallel masters.

Use HCIS Employee and Organization domains. Device-specific extensions belong to device assignments/mappings.

### N. WDMS System User/Auth module — DO NOT DUPLICATE

Use HCIS authentication and authorization. Device operations are initially SUPER_ADMIN-only until dedicated device-operator/biometric-operator permissions are specified.

### O. MTD temperature/mask module — EXCLUDE

Do not port WDMS MTD body-temperature/mask monitoring, reports or alerts. It is unrelated to current HCIS attendance/device requirements.

### P. Generic WDMS platform administration — ADAPT TO HCIS, DO NOT CLONE

Do not clone WDMS-specific platform administration where HCIS already owns the concern, including:

- WDMS licensing/offline activation;
- database engine selection UI;
- database backup/migration UI;
- FTP configuration;
- separate WDMS email configuration;
- theme/bookmark features;
- company-level multi-tenancy;
- standalone WDMS API-user management.

Useful generic behavior such as audit logs, exports, filters, saved views or API observability is integrated into HCIS conventions.

### Q. Daylight Saving Time — EXCLUDE FOR CURRENT SQ DEPLOYMENT

HCIS business/device timezone is Asia/Jakarta. DST UI is not required for current SQ operations. Keep protocol/data design extensible enough that future DST support does not require a database redesign.

## Admin UX target

`Admin HCIS > Mesin Fingerprint` becomes the single operational surface:

- Overview
  - online/offline state
  - lifecycle
  - last activity / last sync
  - model / firmware / push version
  - IP
  - user/FP/face/palm/transaction counts
- Transactions
- PIN & Employee Mapping
- Device Roster
- Biometrics
  - credential inventory per employee
  - fingerprint/face/palm/bio-photo metadata
  - import from device
  - enroll where supported
  - backup/restore
  - distribute to selected devices
  - per-device sync status
  - guarded delete
- Data Transfer
  - sync new transactions
  - upload all transactions
  - upload transaction range
  - reconcile period
  - upload/reconcile user data
  - sync HCIS roster to device
- Commands
  - pending
  - history
  - results/errors
- Configuration
  - heartbeat
  - transfer mode
  - timezone
  - supported safe settings
- Work Codes
- Messages
- Logs
  - operation
  - upload
  - command
  - device error
  - HCIS audit
- Maintenance
  - read information
  - reboot
  - firmware upgrade
  - break-glass destructive actions

Unknown devices appear in a separate `Terdeteksi` queue and must be claimed/activated by an administrator.

## Accelerated delivery plan

ATT-005 is delivered through a small number of large integrated waves, not mandatory tiny feature PRs. The authoritative execution details are in `docs/domain/attendance-wdms-implementation-plan.md`.

### Wave 1 — WDMS Core Device Plane

Combines health/discovery, command transport, transaction recovery and the Admin surfaces needed to operate them.

Primary outcome: reliable connectivity, durable command/result tracking, online/offline status, historical/ranged transaction upload, reconnect recovery, reconciliation and transaction/command observability.

### Wave 2 — Personnel, Roster and Biometric Control Plane

Combines device roster synchronization, PIN mapping, employee/device reconciliation, encrypted biometric vault, backup/restore, compatible cross-device distribution and remote enrollment where proven supported.

### Wave 3 — Full WDMS Operations and Maintenance

Completes relevant WDMS capabilities: messages, Work Code, configuration, reboot, firmware upgrade, offline import, error logs, exports/retention and guarded destructive maintenance.

Parallel engineering lanes are encouraged inside each wave for protocol, database/domain, Admin UI/API and verification/security. One implementation PR per large wave is preferred when the integrated change remains coherent and revertible.

## Acceptance criteria

1. HCIS provides WDMS-equivalent device capabilities classified `INCLUDE` or `INCLUDE / ADAPT` above.
2. WDMS concepts classified `EXCLUDE` are not silently recreated under different names.
3. Unknown devices can be detected without becoming trusted attendance sources automatically.
4. Device online/offline is distinct from device lifecycle.
5. Realtime ATTLOG loss does not imply permanent data loss while the device still retains the transaction; admin can request bounded or full historical transaction re-upload.
6. Device commands are durable, auditable and have tracked execution results.
7. Destructive operations cannot delete HCIS raw attendance evidence.
8. Employee/device synchronization never creates a second employee source of truth.
9. HCIS provides a central encrypted biometric credential vault tied to canonical employees, with audited backup/restore/sync/delete behavior and no biometric matching performed by HCIS.
10. Biometric credential payloads are not exposed in ordinary logs/APIs/UI and cannot be silently deleted by device-maintenance operations.
11. All raw attendance invariants from ATT-001/ATT-002/ATT-003/ATT-004 remain valid.
12. Every implementation wave includes migration recovery notes, tests, OpenAPI synchronization and CI verification before merge.
13. Production deployment of each wave remains a human-approved cutover.