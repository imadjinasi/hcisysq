# ATT-005 Wave 2 — Roster & Biometric Control Plane

**Status:** IMPLEMENTATION  
**Specification:** ATT-005  
**Updated:** 2026-08-31  
**Production safety baseline:** `be30654064c21e0fd41ffe9b34e22883aaf084cd`

## Purpose

Wave 2 builds the personnel/roster/biometric control plane on top of the verified Wave 1 device plane without changing attendance meaning and without treating fingerprint devices as an employee master.

The current physical-firmware evidence materially narrows the roster design: active USERINFO reads are retired because both full-roster and strict single-PIN reads produced sensitive transport side effects. The operational roster is therefore passive `observed_only` evidence, not a complete device snapshot.

Biometric collection remains production-disabled. The encrypted-vault and policy code is a control-plane foundation only; it is not approval to collect, query, restore, distribute, enroll, or delete production biometrics.

## Fixed boundaries

- HCIS Employee remains the canonical employee master.
- Device roster rows are observations of a device, not a second employee database.
- Device PIN mapping remains explicit and leading zeroes remain significant.
- Name similarity is recommendation ranking only; it never establishes employee identity.
- No roster or biometric path infers late, absence, work hours, overtime, payroll, leave conversion, or attendance-resolution outcome.
- No biometric payload is returned by routine Admin APIs or rendered in the Admin UI.
- No generic remote-command input is introduced.
- Changing biometric collection policy is local HCIS state only; it does not send a command to the device.
- `BIOMETRIC_COLLECTION_ENABLED=0` remains the production operating requirement until separately approved.
- Active `DATA QUERY USERINFO` and `DATA QUERY USERINFO PIN=<digits>` are retired and must not be retried on the physically tested firmware.

## Current executable device-command boundary

After physical validation and the USERINFO safety retirement, the application command serializer permits only the currently approved families:

- `LOG`;
- `INFO`;
- bounded `DATA QUERY ATTLOG StartTime=<timestamp>\tEndTime=<timestamp>`;
- same-PIN name-only `DATA UPDATE USERINFO PIN=<digits>\tName=<server-derived mapped HCIS name>`.

The name-only write does not authorize PIN mutation, privilege/card/password changes, user recreation, template movement, or an active USERINFO readback. A non-negative command result proves command execution only; later verification must use passive/safely observed evidence or a separately reviewed capability.

## Sensitive ingress redaction

Wave 1 retained raw ATTLOG bodies because they are immutable attendance evidence. That rule does not apply blindly to personnel or biometric data.

For POST `/iclock/cdata`:

- explicit `table=ATTLOG` remains eligible for lossless request-journal body retention;
- when no table is supplied, only a structurally valid eleven-field ATTLOG payload receives the legacy ATTLOG fallback;
- an explicit non-ATTLOG table always wins over shape-based fallback;
- non-attendance device data is journaled with body `NULL` while retaining hash/byte-length/capture/classification/safe metadata evidence;
- sensitive tables such as `OPERLOG`, `USERINFO`, `FINGERTMP`, `BIODATA`, and biometric/photo variants are redacted from routine request-journal plaintext;
- unsupported/non-UTF8 non-attendance device data is also redacted rather than persisted as opaque plaintext/binary;
- redacted device data is acknowledged so routine plaintext refusal does not intentionally create a retry storm.

Password fields and biometric templates must not enter `attendance_adms_request_journal.body`.

The ADMS capture boundary remains bounded. Oversized sensitive payloads are not retained in plaintext. Explicit sensitive tables remain hash-only/redacted evidence, while oversized ATTLOG is rejected and never projected as attendance.

## Passive safe observed roster

`attendance_adms_device_roster_entries` stores only allowlisted observations such as:

- exact device PIN;
- display name;
- card number;
- privilege;
- verify mode;
- selected safe non-secret metadata such as group/timezone;
- source request ID and first/last observation timestamps.

Fields such as device password and unknown vendor fields are discarded rather than copied into `safe_metadata`.

The roster Admin API is intentionally:

```text
inventorySemantics = observed_only
completeSnapshot = false
```

Absence from the roster therefore never proves that a user is absent from the machine. HCIS does not issue USERINFO commands to complete the list. New safe rows may appear only from passive/natural safe observations or preserved historical evidence.

This boundary also applies to the mapping assistant: an observed PIN without a safe device name may remain unmapped and without a name-based recommendation. HCIS must not fabricate identity from PIN, card, NIP, unit, or other fields.

## Active USERINFO retirement

Physical validation established two distinct failures of the metadata-only assumption:

1. exact full-roster `DATA QUERY USERINFO` produced broad `OPERLOG`/`BIODATA` uploads and did not produce the expected safe roster snapshot;
2. strict `DATA QUERY USERINFO PIN=<digits>` produced the requested safe roster observation, but the same command-response sequence also included additional `OPERLOG` and `BIODATA` traffic.

The sensitive request bodies were not inspected or decoded. While the global biometric collection gate was OFF, no biometric vault credential was created from the strict single-PIN canary window.

Functional `Return=0` / `CMD=DATA` success is therefore insufficient to classify either USERINFO read as metadata-only safe. Both active read shapes are retired at API, serializer, database-insert, and Admin-UI boundaries. A serialized per-PIN refresh is explicitly not an approved workaround.

Redacted evidence:

- `docs/development/attendance-adms-full-roster-canary-failure.md`;
- `docs/development/attendance-adms-single-pin-userinfo-canary-failure.md`;
- `docs/domain/attendance-wdms-wave2-userinfo-canary.md`.

## Passive biometric upload boundary

The PUSH protocol can send biometric-like records through sensitive ingress such as `OPERLOG`. The software foundation can recognize narrowly allowlisted FP/FACE framing, but production collection remains OFF.

If a future passive biometric pilot is explicitly approved, a candidate payload may be vaulted only when all of these hold:

1. process-wide `BIOMETRIC_COLLECTION_ENABLED=1` with a valid biometric keyring;
2. the exact trusted source device has audited `biometric_collection_enabled=true`;
3. device lifecycle is `active`;
4. the exact device PIN resolves at receipt time through one explicit effective mapping;
5. the mapped employee is currently active;
6. payload framing/size/base64/slot/validity rules pass the existing strict parser.

The exact payload remains opaque vendor material. HCIS does not perform biometric matching, reverse-engineer minutiae, or convert incompatible formats.

HCIS never maps biometric payloads by employee number, name, card number, unit, or external ID. If the PIN is unmapped, ambiguous, or belongs to an inactive employee, sensitive ingress remains redacted evidence only and is not added to the employee vault.

There is no active USERINFO/template recovery fallback. Recovery/import from a device requires a separately reviewed protocol capability; retirement of USERINFO reads must not be bypassed through another raw command shape.

Every accepted future passive credential must keep source-request provenance pointing to the redacted request-journal row. Positive passive upload evidence may mark the source-device replica as `present`; HCIS still must not infer `missing` merely from absence of evidence.

### Policy/import serialization

A policy check followed by a separate vault transaction would leave a race where an Admin could disable the pilot while an already-started import still commits. The Wave 2 foundation therefore serializes both operations on the trusted device row:

- passive import begins a transaction and locks `attendance_adms_devices` with `FOR UPDATE`;
- it evaluates lifecycle and per-device gate under that lock;
- explicit PIN mapping, encrypted credential insert/audit, and source-device replica-state update commit in the same transaction;
- the Admin policy PATCH locks the same device row before changing the gate.

Once a pilot-disable transaction commits, a racing passive import waiting on that row observes the disabled gate and cannot create a new credential.

## Biometric collection policy

The schema and Admin API provide a dual gate:

- process-wide `BIOMETRIC_COLLECTION_ENABLED`;
- audited per-device `biometric_collection_enabled`.

Existing devices default device gate OFF. A device gate may be ON only while lifecycle is `active`; disable/quarantine resets it OFF, and later reactivation does not restore it automatically.

Admin policy behavior:

- GET exposes global, device, and effective gate state;
- PATCH enable requires SUPER_ADMIN, global collection ON, and lifecycle `active`;
- PATCH disable remains available to SUPER_ADMIN;
- changes are audited;
- the policy operation never creates a PUSH command.

Production currently keeps the global gate OFF, so effective collection remains OFF regardless of device-local state.

## Biometric vault

`attendance_biometric_credentials` is independent from the ADMS request journal and stores searchable metadata separately from an encrypted opaque payload envelope.

The model includes:

- canonical HCIS employee relationship;
- modality (`fingerprint`, `face`, `palm`, `bio_photo`);
- optional vendor slot/index and source PIN;
- vendor format/version metadata;
- optional origin device;
- redacted source-request provenance;
- capture/import timestamps;
- encrypted opaque payload envelope;
- lifecycle (`active`, `retired`, `destroyed`).

Routine APIs never return plaintext payload, ciphertext, payload hash, IV, authentication tag, encryption key ID, or key material.

### Encryption

Biometric encryption is separate from authentication encryption. The foundation uses a versioned biometric keyring and authenticated AES-256-GCM envelope with random IV and associated-data binding to credential identity/metadata.

Old keys may remain available for old envelopes while new imports use a new active key. `AUTH_ENCRYPTION_KEY` is not reused as a biometric key.

If global collection is explicitly enabled but key configuration is missing or invalid, configuration validation fails closed. This software safeguard does not authorize turning the gate ON in production.

## Credential lifecycle and replica state

The schema supports active/retired/destroyed credential lifecycle and known per-device replica evidence. Destructive production actions remain unavailable until retention, backup/restore, ownership, and physical protocol safety are separately approved.

Replica state is evidence-driven. HCIS must not infer `missing` merely because a device has never positively reported a credential. Passive safe positive evidence may establish `present`; absence remains unknown.

## Current Admin operating surface

Current Wave 2 Admin behavior includes:

- passive observed device roster;
- explicit PIN-to-employee mapping and name-only recommendation ranking;
- safe same-PIN server-derived name synchronization for already observed/mapped users;
- PIN correction planning only, without destructive execution;
- biometric vault metadata and known replica-state metadata;
- global/device/effective biometric collection policy display;
- local per-device biometric pilot policy control, subject to the global gate.

The UI/API do not expose active USERINFO reads, full roster dumps, raw arbitrary commands, template query, biometric distribution, remote enrollment, restore, or destructive device-user/biometric operations.

## What is deliberately not enabled

- full-roster USERINFO read — **RETIRED**;
- strict single-PIN USERINFO read — **RETIRED**;
- fingerprint/face/palm template query;
- roster PIN mutation or user recreate/delete;
- biometric distribution to another device;
- remote enrollment;
- biometric delete from device;
- master biometric destruction;
- restore from HCIS vault;
- production biometric collection.

Protocol documentation alone is not authorization. Physical firmware evidence overrides an assumed safe interpretation when the observed behavior is broader or more sensitive than expected.

## Verification status

Software coverage includes:

- clean and upgrade-path migrations;
- strict ingress redaction for sensitive USER/OPERLOG/BIODATA-style traffic;
- encrypted biometric-vault/key-rotation tests with synthetic data;
- dual-gate and lifecycle regressions;
- explicit-mapping-only passive credential association;
- policy-disable/passive-import serialization;
- metadata-only Admin API assertions;
- retired USERINFO serializer/API/UI/database boundaries;
- same-PIN name-only serializer and route boundaries;
- synthetic device simulator and oversized sensitive-ingress regressions;
- typecheck, lint, tests, build, and Compose validation in PR CI.

Physical status on the primary firmware:

- Wave 1 production deployment/version gate: **VERIFIED**;
- INFO: **VERIFIED**;
- fresh realtime ATTLOG: **VERIFIED**;
- bounded historical ATTLOG: **VERIFIED**;
- identical-range retransmission/dedupe: **VERIFIED**;
- safe same-PIN name-only synchronization: **VERIFIED for its narrow write contract**;
- full-roster USERINFO read: **RETIRED / NOT SAFE AS METADATA-ONLY**;
- strict single-PIN USERINFO read: **RETIRED / NOT SAFE AS METADATA-ONLY**;
- template query/transfer, enrollment, distribution, restore, destructive deletion: **NOT VERIFIED / NOT ENABLED**;
- production biometric collection: **OFF**.

## Contract status

The aggregate API contract references the Wave 2 fragment in `docs/api/attendance-adms-wave2.openapi.yaml`. The roster contract remains passive `observed_only` / `completeSnapshot: false`. No active USERINFO query Path Item exists.

Mapping/correction contracts remain separate and preserve explicit identity mapping, planning-only PIN correction, and server-derived same-PIN name-only writes.

## Hardware boundary and next direction

Wave 1 transaction recovery is no longer the blocker; its primary physical gates are verified. The blocker is now protocol safety for any additional personnel/biometric device action.

Next Wave 2 engineering should therefore favor passive/read-only HCIS-side control-plane work that does not issue a new sensitive device command, such as:

- clearer observed-only roster completeness/status UX;
- mapping/inactive-employee anomaly detection based only on existing HCIS and observed evidence;
- biometric key/retention/backup-readiness controls using synthetic fixtures while collection remains OFF;
- capability documentation for unsupported/retired device operations.

Any future device command outside the current executable allowlist requires a new documented hypothesis, synthetic serializer tests, explicit privacy/safety review, and a separately approved bounded physical canary. Active USERINFO must not be reintroduced as a shortcut.
