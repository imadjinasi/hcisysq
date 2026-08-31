# ATT-006 — Fingerprint Device Admin Verification

**Status:** VERIFIED  
**Specification:** `docs/domain/attendance-device-admin-information-architecture.md`  
**Implementation merge:** `82dcd5455eb24d4f5c31513c3ed245b9dfca5a57`  
**Verified:** 2026-08-30

## Result

The ATT-006 fingerprint-device Admin information architecture is implemented on `main` and has been deployed through the approved web-only production release path.

Operator verification confirmed the intended product structure:

- grouped Super Admin navigation;
- list-first fingerprint-device workspace;
- one route-owned device context;
- persistent device header;
- separate `Ringkasan`, `Pengguna`, `Transaksi`, `Perintah`, and `Pengaturan` operational routes;
- `Diagnostik teknis` separated from the ordinary operational tabs;
- ordinary UI vocabulary hides protocol/Wave terminology unless explicit technical detail is opened;
- route-scoped loading replaces the previous monolithic cockpit and hidden polling model.

The deployment verification also confirmed that the frontend release did not restart the API or PostgreSQL services and that web health, API health, API readiness, and the new Admin SPA route remained healthy.

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

ATT-006 is complete, but ATT-005 WDMS-compatible device parity remains in implementation. The next operational milestone is the safe roster-synchronization portion of Wave 2, followed later by separately gated biometric credential canaries and Wave 3 operations/maintenance.
