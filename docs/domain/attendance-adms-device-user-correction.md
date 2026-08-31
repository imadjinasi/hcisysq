# ADMS device user correction

## Purpose

This slice adds a deliberately narrow write boundary after historical safe USERINFO observation and explicit HCIS mapping are proven. Active USERINFO reads are now retired.

It supports two different operations:

1. **Name sync** — an actual device command that writes only the `Name` field for the same already-observed PIN.
2. **PIN correction plan** — HCIS-local planning metadata for a known typo such as a legacy PIN and a different intended PIN. It does not mutate the device.

## Name sync invariant

The only write command allowed by this slice is:

`DATA UPDATE USERINFO PIN=<observed mapped PIN>\tName=<employees.full_name>`

The Admin cannot supply an arbitrary name. The target name is loaded from the active employee referenced by the current explicit device/PIN mapping.

Requirements:

- SUPER_ADMIN session;
- device lifecycle `active`;
- active explicit PIN mapping;
- mapped employee status `active`;
- safe USERINFO roster observation already exists for the PIN;
- no other active device command;
- command contains only `PIN` and `Name`;
- PIN, card, privilege, password, group, timezone, verify mode, biometric template, and photo are unchanged.

A non-negative `CMD=DATA` result proves command execution only. Immediate active USERINFO readback is retired. Future verification requires passive/safely observed evidence or a separately reviewed and approved protocol capability; HCIS must not issue an alternate active readback command.

A same-value update is intentionally allowed as the first physical canary because it exercises the real write path without changing business data.

## Physical canary verification

**Status:** VERIFIED  
**Verified:** 2026-08-30

The safe same-PIN name-write path has been verified against one explicitly mapped production canary on the primary attendance device.

Observed evidence:

- the Admin action generated only the allowlisted same-PIN `DATA UPDATE USERINFO ... Name=...` command;
- the device completed the write with non-negative return code (`0`) and `DATA` result;
- the then-approved strict single-PIN USERINFO query completed with return code `0` and `DATA` result;
- the post-write safe roster observation preserved the same PIN;
- the device-side name matched the mapped HCIS employee name after read-back;
- previously observed card metadata remained unchanged.

No employee name, PIN, card number, biometric material, or screenshot from the production canary is stored in this public repository.

Later physical evidence showed that the single-PIN query also produced additional `OPERLOG` and `BIODATA` traffic in the same response sequence. That read capability is now retired and the historical canary must not be interpreted as approval for another active readback.

This verification proves only the narrow same-PIN name synchronization contract. It does **not** prove PIN migration, user cloning, deletion/recreation, biometric template transfer, biometric collection, enrollment, restore, or cross-device distribution.

## PIN correction invariant

PIN is treated as the user key, not a normal editable field.

The documented PUSH command `DATA UPDATE USERINFO PIN=<value> ...` adds/modifies the record addressed by that PIN. It is not treated by HCIS as a safe rename from one PIN to another. The documented user delete operation may remove associated fingerprint, face, and photo data.

Therefore this slice does **not** send any command for PIN correction.

A correction plan requires:

- the legacy PIN already has an active explicit mapping;
- the legacy PIN has a safe USERINFO observation;
- the mapped employee is active;
- legacy and intended PIN differ and remain strings so leading zeroes are preserved;
- the intended PIN has no active mapping, USERINFO roster record, or raw ATTLOG fact on that device.

The plan is stored with `executionPolicy=planning_only`, `destructivePinMutationEnabled=false`, and `biometricTransferValidated=false`.

## Future gate for actual PIN migration

No legacy user may be deleted and no intended user may be created as a PIN migration until all of the following are separately proven on the physical firmware:

- safe query of all relevant biometric modalities for one mapped canary user;
- encrypted vault storage and provenance for the queried templates;
- re-delivery to a distinct canary PIN without altering the source user;
- read-back / device evidence proving the new user has equivalent credential coverage;
- rollback path if any modality or slot fails;
- explicit Admin confirmation immediately before source-user deletion;
- post-cutover mapping interval so historical legacy-PIN punches remain attributable while new punches use the intended PIN.

Until those gates are met, PIN correction remains planning-only.
