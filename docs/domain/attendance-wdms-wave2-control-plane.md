# ATT-005 Wave 2 — Roster & Biometric Control Plane

**Status:** IMPLEMENTATION  
**Specification:** ATT-005  
**Baseline:** `1e061cd88daa0686bd487f4813cd17d483ff8cd2`  
**Updated:** 2026-08-29

## Purpose

Wave 2 builds the personnel/biometric control plane on top of the merged Wave 1 device plane without changing attendance meaning and without enabling biometric collection or remote roster/template commands by default.

Wave 1 physical validation is still independent and remains required. In particular, a fresh realtime fingerprint punch has not yet been claimed as verified.

## Fixed boundaries

- HCIS Employee remains the canonical employee master.
- Device roster rows are observations of a device, not a second employee database.
- Device PIN mapping remains explicit and leading zeroes remain significant.
- No roster or biometric path infers late, absence, work hours, overtime, payroll, leave conversion, or attendance-resolution outcome.
- No biometric payload is returned by routine Admin APIs or rendered in the Admin UI.
- No generic remote-command input is introduced.
- Changing biometric collection policy is local HCIS state only; it does not send a command to the device.

## Sensitive ingress redaction

Wave 1 retained raw ATTLOG bodies because they are immutable attendance evidence. That rule must not be applied blindly to personnel or biometric data.

For POST `/iclock/cdata`:

- explicit `table=ATTLOG` remains eligible for lossless request-journal body retention;
- when no table is supplied, only a structurally valid eleven-field ATTLOG payload receives the legacy ATTLOG fallback;
- an explicit non-ATTLOG table always wins over shape-based fallback;
- non-attendance device data is journaled with body `NULL` while retaining body SHA-256, byte length, capture status, classification and safe metadata;
- sensitive tables such as `OPERLOG`, `USERINFO`, `FINGERTMP`, `BIODATA`, biometric/photo variants are redacted from routine request-journal plaintext;
- unsupported/non-UTF8 non-attendance device data is also redacted rather than persisted as opaque plaintext/binary;
- redacted device data is acknowledged so the server does not intentionally create a retry storm solely because routine plaintext retention was refused.

This means password fields and biometric templates must not enter `attendance_adms_request_journal.body`.

The ADMS capture boundary is 512 KiB. Oversized payloads are not retained in plaintext and return HTTP 413. Explicit sensitive tables are journaled as hash-only evidence with `bodyCapture=hash_only_oversize` plus the redaction classification. Oversized explicit ATTLOG is classified as rejected and is never parsed/projected.

## Safe observed roster

`attendance_adms_device_roster_entries` stores only an allowlisted observation:

- exact device PIN;
- display name;
- card number;
- privilege;
- verify mode;
- selected safe non-secret metadata such as group/timezone;
- source request ID and first/last observation timestamps.

Fields such as device password and unknown vendor fields are discarded. They are not copied to `safe_metadata`.

The roster Admin API is intentionally labelled `observed_only` and `completeSnapshot: false`. Absence from the current observation table is **not** interpreted as “missing on device” until a full roster-query behavior is physically validated and a snapshot-completion boundary exists.

## Passive biometric upload boundary

The PUSH manuals document spontaneous enrolled-template upload through `POST /iclock/cdata?...&table=OPERLOG` using records such as:

```text
FP PIN=<pin><TAB>FID=<0-9><TAB>Size=<base64-length><TAB>Valid=<0|1|3><TAB>TMP=<base64>
FACE PIN=<pin><TAB>FID=<slot><TAB>SIZE=<base64-length><TAB>VALID=<0|1><TAB>TMP=<base64>
```

Wave 2 may passively consume these records without issuing a query command to the device. The rules are deliberately strict:

- only `OPERLOG` FP/FACE records are candidates;
- declared encoded size must exactly match the template text length;
- template text must be strict canonical base64 inside the ingress size boundary;
- fingerprint FID is limited to the documented 0–9 range;
- invalid templates (`Valid=0`) are not vaulted;
- duress fingerprint (`Valid=3`) is retained only as safe boolean metadata;
- the exact base64 text is treated as opaque vendor payload and encrypted; HCIS does not decode or interpret biometric features;
- request-journal body remains `NULL` even when the payload is successfully vaulted.

A passive template is eligible for the vault only when all of these are true:

1. process-wide `BIOMETRIC_COLLECTION_ENABLED=1` with a valid biometric keyring;
2. the source device has audited `biometric_collection_enabled=true`;
3. the source device is trusted and lifecycle `active`;
4. the exact device PIN resolves at receipt time through one explicit effective `attendance_adms_employee_mappings` row;
5. the mapped employee is currently `active`.

The effective biometric collection predicate is therefore global gate AND device gate AND active lifecycle. Either gate OFF means the sensitive upload remains redacted evidence only and no credential is created.

HCIS never maps biometric payloads by employee number, name, card number, unit, or external ID. If the PIN is unmapped, ambiguous, or belongs to an inactive employee, the payload is acknowledged/redacted but is not added to the employee vault. A future explicit query can recover it only after that query path has been hardware-validated.

Every accepted passive credential keeps `source_request_id` pointing to the redacted request-journal row. The source request therefore preserves transport provenance without preserving plaintext password/template content.

A successful passive upload is also positive evidence that the origin device currently has that template. Wave 2 records `attendance_biometric_device_states.state = 'present'` for the imported/deduplicated credential on the source device, together with the observation timestamp, vendor format and source-request provenance. This is positive evidence only; HCIS still does not infer `missing` merely because another device has never been queried.

When an eligible mapped vault write fails, the failure must not be treated as successful biometric collection. The redacted request evidence remains durable and exact credential dedupe makes a later device retry safe.

### Policy/import serialization

A policy check followed by a separate vault transaction would leave a race where an Admin could disable the pilot while an already-started import still commits. Wave 2 therefore serializes both operations on the trusted device row:

- passive import begins a transaction and locks `attendance_adms_devices` with `FOR UPDATE`;
- it evaluates lifecycle and per-device gate under that lock;
- explicit PIN mapping, encrypted credential insert/audit, and source-device replica-state update commit in the same transaction;
- the Admin policy PATCH locks the same device row before changing the gate.

The result is a transactional stop boundary: once a pilot-disable transaction commits, a racing passive import that was waiting for that device row observes the disabled gate and cannot create a new credential.

## Biometric collection policy

Migration `0027_attendance_adms_biometric_pilot_gate.sql` adds an audited pilot selector to each trusted ADMS device:

- `biometric_collection_enabled` defaults false;
- `biometric_collection_enabled_at` records current enablement time;
- `biometric_collection_enabled_by_account_id` records the SUPER_ADMIN actor while the gate is enabled.

Existing devices default OFF during upgrade. This is intentional: setting the environment-level global gate ON must not silently enroll all trusted active devices into collection.

Migration `0028_attendance_adms_biometric_lifecycle_guard.sql` closes the reactivation hazard at the database boundary:

- a pilot gate may be ON only while device lifecycle is `active`;
- changing lifecycle to `disabled` or `quarantined` automatically resets the pilot gate OFF and clears its current enable timestamp/actor;
- changing that device back to `active` does **not** restore the old opt-in; a SUPER_ADMIN must explicitly enable the pilot again.

Admin policy behavior:

- GET exposes global, device and effective gate state;
- PATCH enable requires SUPER_ADMIN, global collection ON and lifecycle `active`;
- PATCH disable is always allowed for an authenticated SUPER_ADMIN;
- changes are written to the existing append-only ADMS Admin audit using `device_updated` before/after evidence;
- the policy operation never creates a PUSH command.

## Biometric vault

The HCIS vault is independent from the ADMS request journal.

`attendance_biometric_credentials` stores:

- canonical HCIS employee relationship;
- modality (`fingerprint`, `face`, `palm`, `bio_photo`);
- optional vendor slot/index and source PIN;
- vendor format/version metadata;
- optional origin device;
- redacted source-request provenance;
- capture/import timestamps;
- encrypted opaque vendor payload envelope;
- lifecycle (`active`, `retired`, `destroyed`).

HCIS does not normalize an opaque vendor template into a biometric interpretation. The payload is treated as bytes that belong to a specific vendor format/version.

Credential dedupe is scoped to employee, modality, vendor format, slot and payload hash. Identical bytes in different slots/formats remain distinct credentials.

### Encryption

Biometric payload encryption is separate from authentication/MFA encryption.

Environment controls:

- `BIOMETRIC_COLLECTION_ENABLED` — process-wide gate, defaults operationally to OFF;
- `BIOMETRIC_ACTIVE_KEY_ID` — active application-level vault key ID;
- `BIOMETRIC_ENCRYPTION_KEYS` — JSON keyring containing independently generated 32-byte hexadecimal AES keys.

The envelope uses AES-256-GCM with:

- random 12-byte IV;
- 16-byte authentication tag;
- SHA-256 integrity/dedupe evidence;
- authenticated associated data binding the ciphertext to credential ID, employee ID, modality, slot and vendor format.

Old keys may remain in the keyring to decrypt older envelopes while new imports use the active key. Key rotation is therefore explicit rather than silently rewriting authentication keys.

If global collection is explicitly enabled but the keyring is missing, malformed or does not contain the active key, configuration validation fails closed.

A valid global keyring still does not collect biometric data until one trusted active device is separately selected through the per-device pilot gate.

## Credential lifecycle and deletion preparation

The schema supports an eventual cryptographic-destruction boundary:

- `active` / `retired` rows require a complete encrypted envelope;
- `destroyed` rows require payload hash, byte length, key ID, ciphertext, IV and auth tag to be removed and a destruction timestamp to exist;
- append-only biometric audit can preserve non-payload evidence after payload destruction.

Wave 2 must not expose destructive production actions until retention, backup, restore and key-ownership policy are approved. Schema support is not approval to destroy or redistribute real employee biometrics.

## Per-device replica state

`attendance_biometric_device_states` records known evidence for a vault credential on a device with states such as unknown, present, stale, conflict, pending, succeeded or failed.

The state is evidence-driven. HCIS must not infer “missing” merely because a device has never been queried. Passive FP/FACE upload is currently the only implemented source of positive `present` evidence; active query/synchronization state remains capability-gated.

## Admin API and UI

Current Wave 2 Admin surfaces include:

- observed device roster and explicit mapping status;
- vault credential metadata;
- known per-device replica state;
- global/device/effective biometric collection policy for one selected device.

Routine responses explicitly exclude:

- plaintext template payload;
- encrypted ciphertext;
- payload hash;
- IV;
- authentication tag;
- encryption key ID/material.

The only Wave 2 write currently exposed is the audited local per-device pilot gate. The UI does not expose roster query/sync/enroll/delete controls. Those operations remain capability-gated until the exact PUSH wire behavior is sufficiently proven and covered by allowlisted serializers/tests.

## What is deliberately not enabled yet

- full roster query command;
- fingerprint/face/palm template query command;
- roster create/update/delete command;
- biometric distribution to another device;
- remote enrollment;
- delete from device;
- master biometric destruction;
- restore from HCIS vault;
- production biometric collection without an explicitly selected pilot device.

Protocol documentation gives candidate read/write command families, but HCIS will not expose them merely because a manual mentions them. Physical firmware validation and explicit allowlisting remain required.

## Verification status

The previous hardened head `74aed88d5a988f47a79b3257d08e7fbdc0556702` passed GitHub Actions Pull Request Validation run #122. The dual-gate/lifecycle/race increment must pass the same quality gate on its exact final head before this document is treated as the current verified software checkpoint.

Coverage now includes or is being extended to include:

- clean migration;
- explicit Wave 1 (`0025`) -> Wave 2 (`0026` + `0027` + `0028`) migration rehearsal with seeded device, request-journal, mapping and command state preserved;
- upgrade assertion that existing devices default biometric pilot OFF;
- lifecycle rehearsal proving pilot ON -> disabled resets OFF -> active remains OFF;
- TypeScript typecheck and lint;
- synthetic AES-GCM/key-rotation tests;
- database integration proving sensitive USER/OPERLOG plaintext is not retained in the request journal;
- passive FP/FACE framing tests for size/base64/slot/validity boundaries;
- dual-gate regressions proving global OFF/device ON and global ON/device OFF both create no credential;
- database integration proving effective collection imports only through explicit active PIN mapping;
- database integration proving an unmapped PIN is not guessed into an employee vault;
- concurrent policy-disable/passive-import regression proving no credential appears after the disable commit;
- redacted source-request provenance and source-device `present` evidence;
- append-only biometric audit and destroyed-envelope constraint regressions;
- SUPER_ADMIN-only audited per-device policy behavior;
- synthetic device simulator covering idle polling, INFO delivery/result, safe USERINFO observation and passive OPERLOG fingerprint redaction;
- oversized sensitive-body hash-only/413 regression and oversized ATTLOG no-projection regression;
- API/UI build and Compose validation.

Physical-device validation is a later gate and must not be replaced by synthetic CI.

The operator runbook for production deployment, physical canary, rollback, emergency disable and biometric key rotation is `docs/development/attendance-adms-wave2-canary-runbook.md`.

## Contract status

The runtime Wave 2 Admin surface currently consists of:

- `GET /admin/attendance/adms/devices/{deviceId}/roster`;
- `GET /admin/attendance/adms/biometrics`;
- `GET/PATCH /admin/attendance/adms/devices/{deviceId}/biometric-collection-policy`;
- `GET /admin/attendance/adms/devices/{deviceId}/biometric-inventory`.

`docs/api/attendance-adms-wave2.openapi.yaml` contains all four current Path Items. The authoritative aggregate `docs/api/openapi.yaml` already references the earlier Wave 2 Path Items; the new policy Path Item must also be aggregated before this dual-gate increment is contract-complete.

## Hardware boundary

The software foundation is hardened but remains hardware-gated. The next command-capable behavior must wait for controlled physical-firmware validation. The outstanding physical sequence starts with Wave 1 deployment/polling and one fresh attendance punch, then INFO and bounded ATTLOG recovery/dedup, before any Wave 2 roster/template command is enabled.
