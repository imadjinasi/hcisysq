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

1. `BIOMETRIC_COLLECTION_ENABLED=1` with a valid biometric keyring;
2. the source device is already trusted and `active`;
3. the exact device PIN resolves at receipt time through one explicit effective `attendance_adms_employee_mappings` row;
4. the mapped employee is currently `active`.

HCIS never maps biometric payloads by employee number, name, card number, unit, or external ID. If the PIN is unmapped, ambiguous, or belongs to an inactive employee, the payload is acknowledged/redacted but is not added to the employee vault. A future explicit query can recover it only after that query path has been hardware-validated.

Every accepted passive credential keeps `source_request_id` pointing to the redacted request-journal row. The source request therefore preserves transport provenance without preserving plaintext password/template content.

A successful passive upload is also positive evidence that the origin device currently has that template. Wave 2 records `attendance_biometric_device_states.state = 'present'` for the imported/deduplicated credential on the source device, together with the observation timestamp, vendor format and source-request provenance. This is positive evidence only; HCIS still does not infer `missing` merely because another device has never been queried.

When an eligible mapped vault write fails, the failure must not be treated as successful biometric collection. The redacted request evidence remains durable and exact credential dedupe makes a later device retry safe.

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

- `BIOMETRIC_COLLECTION_ENABLED` — defaults operationally to OFF;
- `BIOMETRIC_ACTIVE_KEY_ID` — active application-level vault key ID;
- `BIOMETRIC_ENCRYPTION_KEYS` — JSON keyring containing independently generated 32-byte hexadecimal AES keys.

The envelope uses AES-256-GCM with:

- random 12-byte IV;
- 16-byte authentication tag;
- SHA-256 integrity/dedupe evidence;
- authenticated associated data binding the ciphertext to credential ID, employee ID, modality, slot and vendor format.

Old keys may remain in the keyring to decrypt older envelopes while new imports use the active key. Key rotation is therefore explicit rather than silently rewriting authentication keys.

If collection is explicitly enabled but the keyring is missing, malformed or does not contain the active key, configuration validation fails closed.

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

Current Wave 2 Admin surfaces are read-only:

- observed device roster and explicit mapping status;
- vault credential metadata;
- known per-device replica state.

Routine responses explicitly exclude:

- plaintext template payload;
- encrypted ciphertext;
- payload hash;
- IV;
- authentication tag;
- encryption key ID/material.

The UI does not expose query/sync/enroll/delete controls yet. Those operations remain capability-gated until the exact PUSH wire behavior is sufficiently proven and covered by allowlisted serializers/tests.

## What is deliberately not enabled yet

- full roster query command;
- fingerprint/face/palm template query command;
- roster create/update/delete command;
- biometric distribution to another device;
- remote enrollment;
- delete from device;
- master biometric destruction;
- restore from HCIS vault;
- production biometric collection.

Protocol documentation gives candidate read/write command families, but HCIS will not expose them merely because a manual mentions them. Physical firmware validation and explicit allowlisting remain required.

## Verification status

The latest implemented software head must pass the normal PR quality gate before this draft advances. The covered checks include:

- clean migration;
- TypeScript typecheck;
- lint;
- synthetic AES-GCM/key-rotation tests;
- database integration proving synthetic payload ciphertext differs from plaintext;
- database integration proving sensitive USER/OPERLOG plaintext is not retained in the request journal;
- passive FP/FACE framing tests for size/base64/slot/validity boundaries;
- database integration proving passive collection OFF creates no vault row;
- database integration proving collection ON imports only through explicit active PIN mapping;
- database integration proving an unmapped PIN is not guessed into an employee vault;
- database integration proving redacted source-request provenance and source-device `present` evidence;
- database regression proving biometric audit rows cannot be updated/deleted;
- database regression proving `destroyed` credentials cannot retain ciphertext/hash/key material;
- regression proving ATTLOG remains lossless;
- authorization tests proving non-SUPER_ADMIN actors cannot query the Wave 2 tables;
- API/UI build and compose validation.

At head `3bbcf45c37975195cd043d1d4b2d420c81b7a0e6`, GitHub Actions Pull Request Validation run #108 passed the full software quality gate. Later documentation/contract/lifecycle-test heads must pass the same gate before any readiness decision.

Physical-device validation is a later gate and must not be replaced by synthetic CI.

## Contract status

The runtime Wave 2 Admin surface consists of:

- `GET /admin/attendance/adms/devices/{deviceId}/roster`;
- `GET /admin/attendance/adms/biometrics`;
- `GET /admin/attendance/adms/devices/{deviceId}/biometric-inventory`.

`docs/api/attendance-adms-wave2.openapi.yaml` contains the self-contained metadata-only contract fragment. The authoritative `docs/api/openapi.yaml` now aggregates all three paths through external Path Item `$ref` entries. The aggregate synchronization commit changed only those three references (`+9 / -0` versus the previous branch head), leaving the existing Leave, Organization and Wave 1 contract untouched.
