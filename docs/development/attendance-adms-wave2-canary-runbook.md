# ATT-005 Wave 2 Canary, Rollback & Key Operations Runbook

**Status:** PRE-PRODUCTION HARDENING  
**Applies to:** ATT-005 Wave 1 device plane + Wave 2 roster/biometric control-plane foundation  
**Updated:** 2026-08-31  
**Production biometric collection:** OFF unless every enablement gate below is explicitly satisfied

This runbook does not authorize a production deploy by itself. Production deployment remains a human-operated VPS action. It also does not replace physical-device validation: synthetic CI proves software behavior only.

## Fixed safety boundary

Current production evidence establishes these boundaries:

- keep `BIOMETRIC_COLLECTION_ENABLED=0`;
- keep every per-device biometric pilot gate OFF;
- active `DATA QUERY USERINFO` and `DATA QUERY USERINFO PIN=<digits>` are retired for the physically tested firmware and must not be retried;
- the device roster is passive `observed_only` evidence and is never treated as a complete machine snapshot;
- do not send template/enrollment/delete/restore/distribution commands to fingerprint devices without a separately reviewed protocol capability and physical safety plan;
- do not interpret roster absence as a missing device user/template;
- do not infer late, absence, work hours, overtime, payroll, leave, or attendance-resolution outcomes from raw fingerprint facts;
- keep device PIN to `employees.id` mapping explicit; leading zeroes remain significant.

Effective passive biometric collection requires both the global application gate and an audited per-device pilot gate. Existing devices default to pilot OFF. Device deactivation clears the pilot gate, and reactivation does not restore it automatically.

## Deployment status

The original Wave 1 production deployment was verified at exact commit:

```text
1e061cd88daa0686bd487f4813cd17d483ff8cd2
```

Later ATT-005 safety hotfixes were deployed and verified through exact production commit:

```text
be30654064c21e0fd41ffe9b34e22883aaf084cd
```

That production closure confirmed migration `0033_attendance_adms_retire_all_userinfo_reads.sql`, healthy API/readiness, the database USERINFO-read insert guard, removal of active USERINFO Admin surfaces, and biometric collection remaining OFF.

## Physical Wave 1 status

Verified on the physical primary device:

1. **INFO read-only canary** — safe telemetry returned from the physical device.
2. **Fresh realtime ATTLOG** — natural operational punches reached HCIS with near-realtime transport and immutable provenance.
3. **Bounded historical ATTLOG** — the documented `DATA QUERY ATTLOG StartTime=... EndTime=...` path returned the expected historical evidence.
4. **Identical-range retransmission/dedupe** — repeating the same bounded request retained one immutable raw-event identity and produced duplicate evidence instead of a second raw event.

The remaining online/offline transition is an observational follow-up when operationally practical, not a blocker for the already-verified bounded ATTLOG path.

## Wave 2 USERINFO status

Two different USERINFO read shapes were physically exercised before retirement:

- full-roster `DATA QUERY USERINFO` produced broad sensitive `OPERLOG`/`BIODATA` transport side effects and failed its safe roster-only contract;
- strict single-PIN `DATA QUERY USERINFO PIN=<digits>` completed functionally and produced a fresh safe roster observation, but the same response sequence also contained additional `OPERLOG` and `BIODATA` traffic.

The sensitive request bodies were not inspected. Biometric vault credential delta remained zero while the global collection gate was OFF.

Therefore functional `Return=0` / `CMD=DATA` success is not metadata-only safety evidence for either USERINFO read shape. Both active read paths are retired at API, serializer, database insert, and Admin UI boundaries. Do not use serialized per-PIN refresh as a workaround.

Detailed redacted records:

- `docs/development/attendance-adms-full-roster-canary-failure.md`;
- `docs/development/attendance-adms-single-pin-userinfo-canary-failure.md`.

## Current roster operating model

Roster inventory is now passive-only:

- HCIS may project allowlisted safe USERINFO observations that the device sends naturally or that already exist as historical evidence;
- `inventorySemantics` remains `observed_only`;
- `completeSnapshot` remains `false`;
- absence of a PIN never proves absence from the device;
- mapping remains explicit and never uses name/card/NIP/unit as identity proof;
- same-PIN name-only update remains a separately allowlisted write for an already safely observed and explicitly mapped user;
- immediate active USERINFO readback after a name update is retired. Verification must use passive/safely observed evidence or a separately reviewed future capability.

No alternate roster dump or raw-command endpoint is authorized.

## Biometric pilot controls

If Wave 2 collection is eventually approved, passive biometric collection is effective only when all conditions hold:

- global `BIOMETRIC_COLLECTION_ENABLED=1` with a valid keyring;
- exact device pilot gate is audited ON;
- device lifecycle is active;
- exact device PIN resolves through one explicit effective mapping;
- mapped employee is active.

Disable/quarantine resets the per-device pilot gate OFF. Reactivation does not restore it. Passive import and policy toggle serialize on the same device-row lock so a committed disable forms a real stop boundary.

The existence of this software control plane is not approval to enable production biometric collection. Hardware behavior, privacy/retention, key ownership, and a separately approved physical canary are still required first.

## Rollback

Application rollback must not alter fingerprint device configuration or fabricate recovery commands. Keep biometric collection OFF during rollback. Migration `0033` is a fail-closed safety boundary and must not be dropped merely to restore an old UI or endpoint. Re-enabling active USERINFO reads requires a new reviewed protocol decision and additive remediation, not operational rollback.

After any rollback/redeploy, record the exact deployed Git commit and repeat health/readiness + normal polling checks before treating later physical observations as evidence for that build.

## Key operations

Biometric vault keys are separate from authentication encryption. Do not reuse `AUTH_ENCRYPTION_KEY`.

- `BIOMETRIC_ACTIVE_KEY_ID` identifies the key used for new envelopes.
- `BIOMETRIC_ENCRYPTION_KEYS` contains retained 32-byte AES keys by versioned ID.
- Rotation adds a new key, switches the active ID, and retains old keys while older envelopes still require decryption.
- If global collection is ON but key configuration is missing or invalid, startup must fail closed.

Production biometric collection remains OFF until separately approved.
