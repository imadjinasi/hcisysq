# ADMS device user correction

## Purpose

This slice adds a deliberately narrow write boundary after single-PIN USERINFO read and explicit HCIS mapping are proven.

It supports two different operations:

1. **Name sync** — an actual device command that writes only the `Name` field for the same already-observed PIN.
2. **PIN correction plan** — HCIS-local planning metadata for a known typo such as legacy PIN `205291319` and intended PIN `205291318`. It does not mutate the device.

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

A non-negative `CMD=DATA` result proves command execution only. Operational verification still requires a subsequent single-PIN USERINFO read-back and comparison with the expected HCIS name.

A same-value update is intentionally allowed as the first physical canary because it exercises the real write path without changing business data.

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
