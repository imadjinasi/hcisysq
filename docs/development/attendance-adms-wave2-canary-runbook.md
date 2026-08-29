# ATT-005 Wave 2 Canary, Rollback & Key Operations Runbook

**Status:** PRE-PRODUCTION HARDENING  
**Applies to:** ATT-005 Wave 1 device plane + Wave 2 roster/biometric control-plane foundation  
**Production biometric collection:** OFF unless every enablement gate below is explicitly satisfied

This runbook does not authorize a production deploy by itself. Production deployment remains a human-operated VPS action. It also does not replace physical-device validation: synthetic CI proves software behavior only.

## Fixed safety boundary

Until the remaining physical canaries are complete:

- keep `BIOMETRIC_COLLECTION_ENABLED=0`;
- keep every per-device biometric pilot gate OFF;
- do not send roster/template/enrollment/delete/restore commands to fingerprint devices;
- do not enable periodic reconciliation automatically unless the previously validated Wave 1 operating policy explicitly calls for it;
- do not interpret roster absence as a missing device user/template;
- do not infer late, absence, work hours, overtime, payroll, leave, or attendance-resolution outcomes from raw fingerprint facts;
- keep device PIN to `employees.id` mapping explicit; leading zeroes remain significant.

Effective passive biometric collection requires both the global application gate and an audited per-device pilot gate. Existing devices default to pilot OFF. Device deactivation clears the pilot gate, and reactivation does not restore it automatically.

## Deployment status

Wave 1 production deployment is complete at exact commit:

```text
1e061cd88daa0686bd487f4813cd17d483ff8cd2
```

Verified on 2026-08-29:

- PostgreSQL, API and web healthy;
- `/api/health` and `/api/ready` return HTTP 200;
- normal ADMS polling continues;
- Wave 1 Operations / Transactions-Reconciliation-Logs UI is present;
- device `SPK7245000707` is active and online;
- periodic bounded reconciliation remains OFF.

## Physical Wave 1 status

Verified:

1. **INFO read-only canary** — safe telemetry returned from the physical device after deployment, including firmware, MAC, LAN IP and user/fingerprint/face/transaction counts.
2. **Fresh realtime ATTLOG on deployed Wave 1** — natural operational punches at 09:14:08 and 09:25:12 Asia/Jakarta were received by HCIS 10 seconds later with distinct source-request provenance.

Pending:

1. **Bounded historical ATTLOG canary** using documented `DATA QUERY ATTLOG StartTime=... EndTime=...`.
2. **Repeat identical range** and prove raw-event dedupe/retransmission behavior.
3. **Online/offline transition** when operationally practical.

## Bounded historical canary

Use device `SPK7245000707` and this exact narrow range:

```text
Start: 2026-08-29 06:15:00 Asia/Jakarta
End:   2026-08-29 06:25:00 Asia/Jakarta
```

The range contains the known historical punch at 06:19:26.

Procedure:

1. In **WDMS Core Device Plane → Data Transfer**, select `SPK7245000707`.
2. Enter the exact start/end values above.
3. Click **Upload rentang** once.
4. Do not click **Sync transaksi baru**.
5. Do not enable periodic bounded reconciliation.
6. Wait for the command to reach terminal status.
7. Confirm Historical Reconciliation records the requested range and an ATTLOG response.
8. Confirm the known 06:19:26 raw transaction is not duplicated as a second immutable raw event identity.
9. Submit the identical range once more.
10. Confirm the second retransmission also leaves the persisted raw-event identity deduplicated.

Stop if the command fails, is quarantined, returns an undocumented negative result, or the device stops normal polling.

## Wave 2 boundary

Do not enable roster/template query, distribution, enrollment, delete or restore behavior until bounded historical recovery/dedup above is physically verified.

## Biometric pilot controls

When Wave 2 collection is eventually approved, passive biometric collection is effective only when all conditions hold:

- global `BIOMETRIC_COLLECTION_ENABLED=1` with a valid keyring;
- exact device pilot gate is audited ON;
- device lifecycle is active;
- exact device PIN resolves through one explicit effective mapping;
- mapped employee is active.

Disable/quarantine resets the per-device pilot gate OFF. Reactivation does not restore it. Passive import and policy toggle serialize on the same device-row lock so a committed disable forms a real stop boundary.

## Rollback

Application rollback must not alter fingerprint device configuration or fabricate recovery commands. Keep biometric collection OFF during rollback. After any rollback/redeploy, record the exact deployed Git commit and repeat health/readiness + normal polling checks before treating later physical observations as evidence for that build.

## Key operations

Biometric vault keys are separate from authentication encryption. Do not reuse `AUTH_ENCRYPTION_KEY`.

- `BIOMETRIC_ACTIVE_KEY_ID` identifies the key used for new envelopes.
- `BIOMETRIC_ENCRYPTION_KEYS` contains retained 32-byte AES keys by versioned ID.
- Rotation adds a new key, switches the active ID, and retains old keys while older envelopes still require decryption.
- If global collection is ON but key configuration is missing or invalid, startup must fail closed.

Production biometric collection remains OFF until separately approved.