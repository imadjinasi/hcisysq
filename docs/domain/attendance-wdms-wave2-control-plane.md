# ATT-005 Wave 2 — Roster & Biometric Control Plane

**Status:** IMPLEMENTATION  
**Specification:** ATT-005  
**Updated:** 2026-09-01  
**Production safety baseline before Package 2:** `968ebe3766c7984f97eb3e22a9f7255b76ca5679`

## Purpose

Wave 2 builds the personnel/roster/biometric control plane on top of the verified Wave 1 device plane without changing attendance meaning and without treating fingerprint devices as an employee master.

Physical-firmware evidence materially narrows the design:

- active full-roster USERINFO reads are retired;
- active strict single-PIN USERINFO reads are retired;
- passive roster evidence is `observed_only`, not a complete device snapshot;
- same-PIN server-derived name-only synchronization remains a separately verified narrow write;
- biometric hardware operations remain unavailable until their exact protocol behavior is physically proven safe.

Package 1 completed the production-useful non-biometric control plane. Package 2 completes the HCIS-side encrypted biometric control plane while keeping production biometric collection OFF.

## Fixed boundaries

- HCIS Employee remains the canonical employee master.
- Device roster rows are observations, not a second employee database.
- Device PIN mapping is explicit; leading zeroes are significant.
- Name similarity is recommendation ranking only and never creates identity automatically.
- No roster or biometric path infers late, absence, work hours, overtime, payroll, leave conversion, or attendance-resolution outcome.
- No generic remote-command input exists.
- No normal API/UI/log exposes plaintext biometric/template payload, ciphertext, payload hash, IV, authentication tag, encryption key ID, or key material.
- `BIOMETRIC_COLLECTION_ENABLED=0` remains the production operating requirement until a separate explicit approval.
- Active `DATA QUERY USERINFO` and `DATA QUERY USERINFO PIN=<digits>` are retired and must not be retried on the physically tested firmware.
- Protocol documentation alone is not authorization for a device command.

## Current executable device-command boundary

The application may serialize only the approved command families:

- `LOG`;
- `INFO`;
- bounded `DATA QUERY ATTLOG StartTime=<timestamp>\tEndTime=<timestamp>`;
- same-PIN name-only `DATA UPDATE USERINFO PIN=<digits>\tName=<server-derived mapped HCIS name>`.

Package 2 does not add a new device command.

The same-PIN name-only write does not authorize PIN mutation, privilege/card/password changes, user recreation, template movement, or an active USERINFO readback. Later verification must use passive/safe evidence or a separately reviewed capability.

## Sensitive ingress redaction

Raw ATTLOG is attendance evidence and remains eligible for lossless request-journal retention. Personnel/biometric traffic is handled differently.

For POST `/iclock/cdata`:

- explicit `table=ATTLOG` may retain the request body as raw attendance evidence;
- legacy ATTLOG fallback requires the validated eleven-field ATTLOG shape;
- explicit non-ATTLOG tables override shape fallback;
- sensitive/non-attendance data is journaled without plaintext body while retaining safe request evidence such as hash, byte length, timestamps, classification, and allowlisted metadata;
- sensitive families include USERINFO, FINGERTMP, BIODATA, biometric/photo variants, and sensitive OPERLOG framing;
- unsupported/non-UTF8 non-attendance data is redacted rather than stored as opaque plaintext/binary.

Password fields and biometric templates must not enter `attendance_adms_request_journal.body`.

## Passive observed roster

`attendance_adms_device_roster_entries` stores only allowlisted observations such as:

- exact device PIN;
- display name;
- card number;
- privilege;
- verify mode;
- selected non-secret metadata;
- source request and first/last observation timestamps.

The Admin roster contract is explicitly:

```text
inventorySemantics = observed_only
completeSnapshot = false
```

Absence never proves a device user is absent. HCIS does not issue USERINFO reads to complete the list.

Mapping lifecycle facts are derived separately from current explicit HCIS mapping + authoritative employee status, so inactive/resigned mappings remain reviewable even when roster metadata was never passively observed.

The mapping assistant follows the same boundary. A PIN with no passively observed safe name may have no name recommendation. HCIS does not fabricate identity from PIN, card, NIP, unit, or external ID.

## USERINFO retirement

Physical validation established that both expected metadata-only read shapes have broader sensitive transport side effects:

1. exact full-roster `DATA QUERY USERINFO` produced broad OPERLOG/BIODATA traffic and did not yield the expected safe snapshot;
2. strict `DATA QUERY USERINFO PIN=<digits>` yielded a safe user observation but also produced additional OPERLOG/BIODATA traffic in the same response sequence.

Sensitive bodies were redacted and were not decoded. A successful device `Return=0` / `CMD=DATA` is not enough to call either read safe.

Both active read shapes are retired at UI, API, serializer, and database-insert boundaries. Serialized per-PIN refresh is not an approved workaround.

Evidence anchors:

- `docs/development/attendance-adms-full-roster-canary-failure.md`;
- `docs/development/attendance-adms-single-pin-userinfo-canary-failure.md`;
- `docs/domain/attendance-wdms-wave2-userinfo-canary.md`.

## Biometric collection gate

Future passive biometric storage requires all of these:

1. process-wide `BIOMETRIC_COLLECTION_ENABLED=1` with a valid biometric keyring;
2. exact trusted device has audited `biometric_collection_enabled=true`;
3. device lifecycle is `active`;
4. exact source PIN resolves through one explicit effective mapping at receipt time;
5. mapped employee is active;
6. strict framing/size/base64/slot/validity checks pass.

The opaque vendor payload is not used for biometric matching or format conversion.

If the PIN is unmapped/ambiguous, the employee is inactive, or any gate fails, ingress remains redacted evidence and no vault credential is created.

Policy disable and passive import serialize on the trusted device row (`FOR UPDATE`), so a committed disable cannot race with and accidentally permit a later credential insert.

### Production state

Package 2 production deployment MUST keep:

```text
BIOMETRIC_COLLECTION_ENABLED=0
```

All trusted-device biometric collection gates are expected OFF as well. The standard VPS verifier fails if any per-device collection gate is ON.

## Encrypted biometric vault

`attendance_biometric_credentials` stores searchable metadata separately from an encrypted opaque payload envelope.

Metadata includes:

- canonical HCIS employee;
- modality (`fingerprint`, `face`, `palm`, `bio_photo`);
- optional slot/index and source PIN;
- vendor format/version;
- optional origin device;
- redacted source-request provenance;
- capture/import timestamps;
- lifecycle (`active`, `retired`, `destroyed`);
- payload byte length;
- non-secret envelope format version;
- last local re-encryption timestamp/actor metadata.

Cryptographic envelope fields remain database-internal and are not part of routine API/UI output.

### Encryption

The vault uses AES-256-GCM with random IV and associated-data binding to credential identity/metadata. Authentication encryption is separate; `AUTH_ENCRYPTION_KEY` is never reused as a biometric key.

Old keys may remain in the external keyring so old envelopes can be decrypted while new/local-maintained envelopes use the configured active key.

## Maintenance keyring with collection OFF

Package 2 separates **vault maintenance readiness** from **collection authorization**.

A valid `BIOMETRIC_ACTIVE_KEY_ID` + `BIOMETRIC_ENCRYPTION_KEYS` keyring may exist while `BIOMETRIC_COLLECTION_ENABLED=0` so already-encrypted vault rows can be checked/re-encrypted locally. This does not open biometric ingress.

Rules:

- ordinary collection encryption still refuses to run while the global collection gate is OFF;
- local maintenance decrypt/re-encrypt may run with collection OFF only when the keyring is valid;
- partial keyring configuration fails startup validation;
- no keyring at all is valid while collection is OFF and leaves local re-encryption blocked;
- normal readiness APIs reveal no key IDs/material.

Key material belongs to external infrastructure secret storage, not PostgreSQL or the repository.

The complete rotation/escrow procedure is in `attendance-wdms-package2-biometric-control-plane.md`.

## Local bounded envelope re-encryption

Package 2 adds SUPER_ADMIN local vault maintenance that:

- requires explicit `REENCRYPT_VAULT` confirmation;
- uses bounded batches (maximum 100 rows);
- optionally targets selected credential UUIDs;
- selects only non-destroyed rows not already using the active internal key;
- uses `FOR UPDATE SKIP LOCKED`;
- decrypts/authenticates and re-encrypts only inside API process memory;
- requires envelope version support;
- verifies SHA and byte length are unchanged;
- commits each batch transactionally;
- writes append-only `credential_reencrypted` audit metadata;
- returns only processed/remaining counts;
- sends zero device commands.

Known source-key absence, GCM/integrity failure, length mismatch, or unsupported envelope version stops and rolls back the batch for manual review.

## Backup/restore readiness

A PostgreSQL backup contains encrypted envelope rows but deliberately does not contain key material. Recoverability therefore requires separately protected:

1. database backup;
2. matching external keyring escrow.

Package 2 includes a synthetic restore/re-encryption drill using fake opaque bytes only. It verifies old-key decryptability, active-key local re-encryption, integrity preservation, append-only audit, and absence of payload/key IDs from normal metadata response.

This is **not** a physical template-transfer or device-restore test.

## Credential lifecycle

Credential lifecycle remains:

```text
active -> retired -> destroyed
```

Package 2 adds no automatic lifecycle mutation.

When an authoritative HCIS employee becomes `inactive` or `resigned`, any non-destroyed credential is marked for review only:

- `lifecycleReviewRequired=true`;
- review count increases;
- no auto-retire;
- no device deletion;
- no HCIS master destruction.

Master destruction remains blocked until an explicit retention/destruction policy is approved.

## Replica evidence

`attendance_biometric_device_states` remains evidence-driven with states:

```text
unknown | missing | present | stale | conflict | pending | succeeded | failed
```

No row means unknown, not missing.

Package 2 does not manufacture new physical evidence. It only exposes known replica metadata/counts safely.

## Capability matrix

Package 2 reports capability state explicitly:

| Capability | State | Notes |
| --- | --- | --- |
| Vault metadata | available | HCIS-side metadata only |
| Local envelope re-encryption | available when keyring ready | no device command |
| Passive collection | blocked in production | global/device gates OFF |
| Template query | not_verified | no executable command |
| Restore to device | not_verified | no executable command |
| Cross-device distribution | not_verified | no executable command |
| Remote enrollment | not_verified | no executable command |
| Device biometric delete | not_verified | no executable command |
| HCIS master destruction | blocked | retention policy pending |

A capability that is not physically proven is not enabled from WDMS/manual assumptions.

## Admin operating surface

Wave 2 Admin now consists of:

- passive observed roster;
- explicit PIN mapping and name-only similarity recommendations;
- safe same-PIN server-derived name sync;
- PIN correction planning only;
- mapping lifecycle review;
- dedicated `Biometrik` workspace;
- global/device/effective collection status;
- keyring readiness without identifiers/material;
- vault counts and lifecycle-review counts;
- paginated credential metadata;
- known replica evidence;
- hardware capability matrix;
- local envelope re-encryption only when maintenance keyring is ready.

The UI/API intentionally do not expose active USERINFO reads, full roster dumps, arbitrary raw command input, template query, distribution, enrollment, restore, device biometric delete, or HCIS master destruction.

## Package 1 pagination follow-up

The non-blocking Package 1 UAT pagination finding is addressed in the same Package 2 delivery:

- mapping review backlog is paginated instead of truncating to eight items;
- transaction history is paginated within its bounded API result;
- command history is paginated within its bounded API result;
- biometric credential/replica tables are paginated.

Pagination does not change the completeness semantics of the underlying bounded APIs.

## Verification requirements

Software coverage must include:

- clean migration through `0035`;
- upgrade-path migration rehearsals;
- encryption/decryption/integrity tests with synthetic data only;
- collection-OFF + maintenance-keyring local re-encryption;
- targeted transactional rotation;
- lifecycle review metadata;
- no-secret API response assertions;
- SUPER_ADMIN authorization negatives;
- append-only biometric audit guard;
- existing ingress redaction and USERINFO retirement regressions;
- Web safety regression proving no physical biometric action endpoint appears;
- pagination regression;
- typecheck, lint, test, build, and Compose validation.

Normal Package 2 production verification must confirm:

- exact deployed SHA;
- all containers healthy;
- latest repo/database migration is `0035`;
- USERINFO retirement guard remains present;
- global collection OFF;
- all per-device biometric collection gates OFF;
- biometric append-only audit trigger remains present;
- Package 2 envelope-maintenance columns exist;
- verifier requests zero device commands.

## Physical status

On the primary tested firmware:

- INFO: **VERIFIED**;
- realtime ATTLOG: **VERIFIED**;
- bounded historical ATTLOG: **VERIFIED**;
- identical-range retransmission/dedupe: **VERIFIED**;
- same-PIN name-only synchronization: **VERIFIED for its narrow write contract**;
- full-roster USERINFO: **RETIRED / NOT SAFE AS METADATA-ONLY**;
- strict single-PIN USERINFO: **RETIRED / NOT SAFE AS METADATA-ONLY**;
- template query/transfer, enrollment, distribution, restore, destructive biometric deletion: **NOT VERIFIED / NOT ENABLED**;
- production biometric collection: **OFF**.

Package 2 software deployment does not change these physical statuses.

## Contract anchors

- existing Wave 2 metadata/policy contract: `docs/api/attendance-adms-wave2.openapi.yaml`;
- Package 2 control-plane contract: `docs/api/attendance-adms-biometric-control-plane.openapi.yaml`;
- Package 2 operational/security procedure: `docs/domain/attendance-wdms-package2-biometric-control-plane.md`.

No active USERINFO query Path Item exists.

## Next boundary after Package 2

After Package 2 is merged, deployed, verified, and software-UAT passes, ATT-005 may proceed to Package 3 WDMS safe operations/final parity work.

A physical biometric canary is **not** implied by Package 2 completion. Any future hardware action outside the current command allowlist requires a new documented protocol hypothesis, serializer tests, privacy/safety review, explicit approval, and a separately bounded physical canary.