# ATT-005 — WDMS-Compatible Fingerprint Device Operations

**Status:** ACCEPTED

## Decision

HCIS YSQ shall provide a fingerprint-device operational surface with functional parity to the parts of ZKBio WDMS that are appropriate for an internal HCIS deployment.

ZKBio WDMS is the primary behavior/reference source for device operations. RuangHadir may still be used as an implementation reference, but it is not authoritative for protocol or product behavior.

Reference baseline:

- ZKBio WDMS 9.0.5 User Manual (2025-08-15);
- ZKBio WDMS 9.0.7 is the current published WDMS software release as of 2026-08;
- ZKTeco PUSH protocol documentation for wire-level behavior;
- physical-device observations from HCIS production canaries.

This is a product-scope decision approved for HCIS. Delivery remains incremental and must preserve the existing attendance invariants.

## Product boundary

HCIS is an internal SQ system, not a commercial multi-tenant SaaS product.

HCIS owns:

- fingerprint-device registration and operational configuration;
- connectivity and device health;
- protocol transport, command delivery, command result tracking and reconciliation;
- raw attendance ingestion;
- device-to-employee mapping;
- HCIS employee/device synchronization where useful;
- operational logs, audits and reporting related to devices.

HCIS must not recreate a second employee, organization, authentication or authorization source of truth merely because WDMS contains those modules.

## Core invariants

1. `attendance_daily_records` remains factual punch/correction data only.
2. Raw device evidence is immutable after durable capture.
3. Device commands and device configuration never infer late, absence, overtime, working hours, payroll deduction, leave conversion or attendance-resolution outcomes.
4. Leading-zero device PINs are preserved exactly.
5. Device identity is explicit and auditable.
6. Unknown devices may be detected automatically but are not trusted automatically.
7. Destructive device actions are break-glass operations with confirmation and audit.
8. HCIS employee and organization data remain the source of truth for SQ personnel and organization concepts.
9. Biometric credential material is not centralized in HCIS under ATT-005.
10. Device behavior is capability-driven; unsupported commands are not exposed for devices that do not advertise or prove support.

## WDMS parity matrix

### A. Device registry and discovery — INCLUDE / ADAPT

WDMS capabilities to implement:

- manual device add;
- automatic device discovery/add;
- device name;
- serial number;
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
- admin explicitly activates and assigns a display name/work-location context;
- WDMS `Area` maps to HCIS Work Location / optional organization context instead of creating a parallel personnel hierarchy;
- biometric counts are observability metadata only; biometric templates are not stored.

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

Initial server health policy may derive online/offline from recent request activity; it must remain configurable rather than firmware-hardcoded.

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

- view command list;
- view execution result;
- clear/cancel pending commands;
- bulk delete/archive old command-log presentation without deleting immutable audit evidence;
- retry commands only where retry is safe/idempotent.

Every command issuance and result is audited.

### D. Data transfer and attendance recovery — INCLUDE

Implement WDMS-equivalent data-transfer operations:

- Upload Transaction — all transactions;
- Upload Transaction — start/end time range;
- request current/new transactions immediately;
- reconnect catch-up;
- explicit historical re-upload;
- transaction-count verification/reconciliation where protocol/device supports it;
- periodic reconciliation windows;
- exact event deduplication;
- durable request journal and upload log.

Realtime push is an optimization, not the only reliability mechanism.

Missed realtime punches must be recoverable from device storage while the source record still exists on the device.

### E. Employee/device data synchronization — INCLUDE / ADAPT

WDMS employee synchronization behavior is useful, but HCIS employee master remains authoritative.

Implement:

- device-specific employee roster view;
- upload user data from device for reconciliation/diagnostics;
- send/synchronize selected HCIS employees to selected devices;
- re-synchronize employee data to device;
- re-upload device user data for comparison;
- device privilege/verify-mode metadata where available;
- active/inactive/resigned filtering based on HCIS employee state;
- card-number synchronization where the device supports cards;
- employee name synchronization where supported;
- explicit device PIN assignment/mapping;
- conflict detection before pushing roster changes.

Do not create a second WDMS-style Personnel master.

### F. Work Code — INCLUDE, POLICY-NEUTRAL

Implement WDMS-equivalent work-code management where supported:

- create/manage work-code catalog for device use;
- issue work code to one or more devices;
- remove work code from devices;
- display work code in raw attendance evidence.

Work code must not automatically imply overtime, leave, payroll treatment or attendance status.

### G. Messages — INCLUDE IF DEVICE CAPABILITY EXISTS

Support public/private short messages when a connected device supports the relevant PUSH commands:

- create public device message;
- create employee-targeted/private message;
- schedule start/duration;
- send to selected device(s);
- remove message from device;
- delivery/result logging.

This is a device capability, not a replacement for HCIS notification channels.

### H. Device operations — INCLUDE WITH GUARDS

Implement where protocol/device support is proven:

- Read Information;
- Reboot;
- time/timezone synchronization;
- duplicate-punch-period configuration;
- capture-setting metadata/configuration where no biometric media is ingested by HCIS;
- firmware version inspection;
- firmware upgrade workflow;
- selected device configuration read/write;
- clear pending commands.

Firmware upgrade must require:

- SUPER_ADMIN;
- explicit target device;
- vendor-compatible firmware package;
- preflight capability/model match;
- irreversible-action warning;
- audit trail;
- no automatic rollout to all devices.

### I. Destructive device maintenance — INCLUDE AS BREAK-GLASS

WDMS exposes destructive maintenance. HCIS may expose equivalent actions only behind a dedicated break-glass flow:

- clear attendance data on device;
- clear capture-photo cache on device, if applicable;
- clear all device data.

Required safeguards:

- SUPER_ADMIN only;
- typed serial confirmation;
- recent successful device contact;
- explicit explanation of what is deleted;
- immutable admin audit event;
- no deletion of HCIS raw evidence;
- for attendance-data clearing, warn if reconciliation is incomplete;
- `clear all data` must be visually and permission-wise separated from routine operations.

### J. Transaction and device observability — INCLUDE

Implement:

- transaction table;
- filter by device, employee/PIN, date/time range and source;
- raw device timestamp and received timestamp;
- device information and mapping context;
- export CSV/XLSX-compatible data where appropriate;
- upload/import of supported offline transaction files as a fallback path;
- operation log;
- device error log where uploaded by device;
- upload log;
- command log;
- admin audit log;
- data-retention configuration for operational logs, subject to HCIS retention policy.

Raw request bodies must not be exposed casually in Admin UI. Diagnostics should present safe summaries by default.

### K. Attendance photos — CONDITIONAL / NOT DEFAULT

WDMS can display/download attendance photos for supported devices.

HCIS will not enable machine attendance-photo ingestion by default under ATT-005 because it adds biometric/privacy-sensitive media retention without being required for fingerprint attendance reliability.

If later explicitly approved, it requires a separate privacy/retention/security specification.

### L. Biometric template and Bio-Photo vault — EXCLUDE

Do not port WDMS central biometric-template or bio-photo management under ATT-005:

- fingerprint template vault;
- face template vault;
- palm template vault;
- central biometric-template upload/download;
- biometric-template deletion workflow as an HCIS master capability;
- face bio-photo registration/import/approval;
- automatic biometric synchronization between devices;
- remote enrollment that causes biometric templates/media to enter HCIS.

Reason: HCIS is the HR/attendance system, not a biometric credential vault. Centralizing biometric credential material creates a materially different privacy/security system and is not necessary for attendance ingestion.

A future credential-management specification may revisit this only with explicit approval.

### M. WDMS Personnel module — DO NOT DUPLICATE

Do not recreate:

- WDMS Company master;
- WDMS Department master;
- WDMS Position master;
- WDMS Personnel master;
- WDMS resignation master;
- WDMS custom personnel attributes as a second employee schema;
- WDMS personnel-transfer workflow.

Use HCIS Employee and Organization domains. Device-specific extensions belong to device assignments/mappings.

### N. WDMS System User/Auth module — DO NOT DUPLICATE

Do not recreate WDMS local user/role system.

Use HCIS authentication and authorization. Device operations remain least-privilege and are initially SUPER_ADMIN-only until a dedicated device-operator permission is specified.

### O. MTD temperature/mask module — EXCLUDE

Do not port WDMS MTD body-temperature/mask monitoring, reports or alerts.

It is unrelated to current HCIS attendance requirements and reflects a specialized health-screening use case rather than fingerprint attendance operations.

### P. Generic WDMS platform administration — ADAPT TO HCIS, DO NOT CLONE

Do not clone WDMS-specific platform administration where HCIS already has an equivalent concern:

- WDMS licensing/offline activation;
- WDMS database engine selection UI;
- WDMS database backup/migration UI;
- WDMS FTP configuration;
- WDMS email configuration as a separate mail system;
- WDMS theme/bookmark features;
- WDMS company-level multi-tenancy;
- WDMS standalone API-user management.

HCIS infrastructure, backup, auth, notification and UI systems remain authoritative.

Useful generic behavior such as audit logs, exports, filters, saved views or API observability should be integrated into existing HCIS conventions rather than copied as a second subsystem.

### Q. Daylight Saving Time — EXCLUDE FOR CURRENT SQ DEPLOYMENT

HCIS business/device timezone is Asia/Jakarta. DST configuration is not required for current SQ operations.

Keep protocol code extensible enough that DST does not need a database redesign if future deployments require it, but do not expose a DST UI now.

## Admin UX target

`Admin HCIS > Mesin Fingerprint` becomes the single operational surface.

Suggested information architecture:

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
  - supported safe device settings
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

## Delivery plan

ATT-005 is an umbrella specification and must be delivered through small reviewable PRs.

### ATT-005A — Health, discovery and telemetry

- detected/pending device lifecycle;
- automatic discovery;
- online/offline state;
- model/firmware/push version parsing;
- device counters;
- last activity/last sync;
- Admin health UI.

### ATT-005B — Command transport

- durable command queue;
- `/iclock/getrequest` command delivery;
- `/iclock/devicecmd` result ingestion;
- command log;
- clear/cancel pending command;
- Read Information;
- safe immediate sync/check commands.

### ATT-005C — Transaction recovery and reconciliation

- upload all transactions;
- upload transaction range;
- periodic reconciliation;
- count verification when supported;
- reconnect/backlog recovery;
- registration-after-capture recovery;
- upload log.

### ATT-005D — Device roster and data synchronization

- employee-device roster;
- upload user data from device;
- HCIS employee -> device sync;
- conflict handling;
- resigned/inactive filtering;
- card/name/device privilege metadata;
- Work Code.

### ATT-005E — Extended device operations

- messages;
- duplicate-punch period;
- safe configuration read/write;
- reboot;
- firmware upgrade;
- offline transaction import;
- device error log.

### ATT-005F — Break-glass maintenance and operational polish

- destructive device maintenance with safeguards;
- exports and saved filters;
- retention controls;
- operational audit completeness;
- capability-driven UI hiding/disablement.

## Acceptance criteria

1. HCIS provides the WDMS-equivalent device capabilities classified `INCLUDE` or `INCLUDE / ADAPT` above.
2. WDMS concepts classified `EXCLUDE` are not silently recreated under different names.
3. Unknown devices can be detected without becoming trusted attendance sources automatically.
4. Device online/offline is distinct from device lifecycle.
5. Realtime ATTLOG loss does not imply permanent data loss while the device still retains the transaction; admin can request bounded or full historical transaction re-upload.
6. Device commands are durable, auditable and have tracked execution results.
7. Destructive operations cannot delete HCIS raw attendance evidence.
8. Employee/device synchronization never creates a second employee source of truth.
9. Biometric templates/photos are not centralized without a separate approved specification.
10. All raw attendance invariants from ATT-002/ATT-003/ATT-004 remain valid.
11. Each implementation slice requires migration recovery notes, tests and CI verification before merge.
12. Production deployment of each slice remains a human-approved cutover.
