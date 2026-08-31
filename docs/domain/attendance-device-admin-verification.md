# ATT-006 — Fingerprint Device Admin Verification

**Status:** VERIFIED  
**Specification:** `docs/domain/attendance-device-admin-information-architecture.md`  
**Implementation merge:** `82dcd5455eb24d4f5c31513c3ed245b9dfca5a57`  
**Verified:** 2026-08-31

## Result

The ATT-006 fingerprint-device Admin information architecture is implemented on `main` and has been deployed through the approved production release path.

Operator verification confirmed the intended product structure:

- grouped Super Admin navigation;
- list-first fingerprint-device workspace;
- one route-owned device context;
- persistent device header;
- separate `Ringkasan`, `Pengguna`, `Transaksi`, `Perintah`, and `Pengaturan` operational routes;
- `Diagnostik teknis` separated from the ordinary operational tabs;
- ordinary UI vocabulary hides protocol/Wave terminology unless explicit technical detail is opened;
- route-scoped loading replaces the previous monolithic cockpit and hidden polling model.

Deployment verification confirmed web health, API health, API readiness, and the Admin SPA routes remained healthy without restarting PostgreSQL.

## Frontend cache-regression closure

After an earlier verification was misled by a stale Microsoft Edge SPA session, HCIS adopted an explicit application-shell cache policy: mutable `index.html` is non-cacheable while content-hashed assets remain immutable.

Production verification on 2026-08-31 confirmed both server and browser sides of that fix:

- current `index.html` no-store/no-cache headers were present;
- the current content-hashed JavaScript asset retained immutable caching;
- a fresh Edge InPrivate session loaded the current asset and showed no retired full-roster or single-PIN USERINFO controls;
- Users used passive-observation wording and explicit mapping semantics;
- Diagnostics exposed no raw request/biometric material;
- global/device/effective biometric collection remained OFF;
- zero device commands were issued during the frontend verification.

The inactive/resigned mapping visual state was `NOT OBSERVED` in that production sample because the visible mapping was not inactive/resigned. This does not invalidate the cache-regression verification.

## Physical safe-write verification

After the workspace deployment and visual review, one explicitly mapped production canary was used to validate the narrow same-PIN name synchronization flow defined in `attendance-adms-device-user-correction.md`.

Verified properties:

- only the allowlisted same-PIN name update was issued;
- device result was successful with non-negative return code and `DATA` result;
- the then-approved strict single-PIN read-back succeeded;
- the same PIN remained present after read-back;
- device-side name matched the mapped HCIS employee name;
- previously observed card metadata remained unchanged.

Production employee identifiers, PINs, card numbers, screenshots, and other personal data are intentionally not stored in this public repository.

Subsequent redacted physical evidence showed additional `OPERLOG` and `BIODATA` requests in the same single-PIN USERINFO response sequence. Active USERINFO reads are now retired. Immediate name-sync readback is no longer permitted; future verification requires passive/safely observed evidence or a separately approved protocol capability.

## Boundaries that remain unchanged

This verification does not approve or prove:

- actual PIN mutation or legacy-PIN deletion;
- user cloning/recreation as a PIN migration mechanism;
- biometric template query/import;
- biometric collection enablement;
- biometric enrollment, restore, delete, or cross-device distribution;
- destructive device maintenance;
- attendance lateness, absence, work-hours, overtime, leave, or payroll inference.

`BIOMETRIC_COLLECTION_ENABLED` remains required to stay OFF until the separate ATT-005 security, retention, key-management, compatibility, and controlled hardware gates are satisfied.

## Remaining ATT-005 work

ATT-006 is complete, but ATT-005 WDMS-compatible device parity remains in implementation. Roster/user identity handling is now constrained to passive observations plus explicit HCIS mappings; active USERINFO reads are a retired path, not a future synchronization milestone.

Remaining safe work should strengthen passive mapping lifecycle observability and other metadata/control-plane behavior that does not require USERINFO or biometric device commands. Separately gated biometric credential operations and Wave 3 maintenance remain future work and require their own hardware/security evidence before activation.
