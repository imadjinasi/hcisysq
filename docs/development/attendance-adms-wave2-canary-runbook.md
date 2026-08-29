# ATT-005 Wave 2 Canary, Rollback & Key Operations Runbook

**Status:** PRE-PRODUCTION HARDENING  
**Applies to:** ATT-005 Wave 1 device plane + Wave 2 roster/biometric control-plane foundation  
**Production biometric collection:** OFF unless every enablement gate below is explicitly satisfied

This runbook does not authorize a production deploy by itself. Production deployment remains a human-operated VPS action. It also does not replace physical-device validation: synthetic CI proves software behavior only.

## Fixed safety boundary

Until the physical canary is complete:

- keep `BIOMETRIC_COLLECTION_ENABLED=0`;
- keep every per-device biometric pilot gate OFF;
- do not send roster/template/enrollment/delete/restore commands to fingerprint devices;
- do not enable periodic reconciliation automatically unless the previously validated Wave 1 operating policy explicitly calls for it;
- do not interpret roster absence as a missing device user/template;
- do not infer late, absence, work hours, overtime, payroll, leave, or attendance-resolution outcomes from raw fingerprint facts;
- keep device PIN to `employees.id` mapping explicit; leading zeroes remain significant.

Effective passive biometric collection requires both the global application gate and an audited per-device pilot gate. Existing devices default to pilot OFF. Device deactivation clears the pilot gate, and reactivation does not restore it automatically.

## Deployment-version gate

Physical evidence is valid only for the application build that was actually deployed when the evidence was observed.

On 2026-08-29, the operator deployed exact `main` commit:

```text
1e061cd88daa0686bd487f4813cd17d483ff8cd2
```

Post-deploy verification completed:

- PostgreSQL, API, and web containers healthy;
- `/api/health` returned HTTP 200 `{"status":"ok"}`;
- `/api/ready` returned HTTP 200 `{"status":"ready"}`;
- normal ADMS polling continued;
- Wave 1 `Transactions, Reconciliation & Logs` UI became visible in production;
- `SPK7245000707` showed lifecycle active and connectivity online;
- periodic reconciliation remained OFF.

The deployment-version gate is therefore complete for Wave 1.

Two punches observed earlier on 2026-08-29 occurred before this Wave 1 deployment and remain evidence for the older production path only. A fresh post-deploy punch is still required, but it may occur through normal operational use rather than being forced solely for testing.

## INFO physical gate

A post-deploy safe INFO result was observed at approximately 09:03:20 Asia/Jakarta with `FWVersion`, `MAC`, `IPAddress`, `FPCount`, `FaceCount`, `UserCount`, and `TransactionCount` populated from the physical device.

Wave 1 only persists `infoObserved` from a parsed command result whose command is `INFO`, return code is non-negative, safe options are non-empty, and command number belongs to the same trusted device. The INFO physical result is therefore verified.

## Remaining Wave 1 physical sequence

The remaining gates may be completed without forcing an immediate fingerprint punch:

1. run one small bounded `DATA QUERY ATTLOG StartTime=... EndTime=...` request;
2. repeat the identical bounded range and confirm persisted raw-event identities remain deduplicated;
3. wait for one **natural post-deploy fresh punch** and verify near-realtime ATTLOG persistence/provenance when it occurs;
4. observe an honest online/offline transition when operationally practical.

Recommended bounded range for `SPK7245000707`:

```text
Start: 2026-08-29 06:15:00 Asia/Jakarta
End:   2026-08-29 06:25:00 Asia/Jakarta
```

This range contains the already-observed `205291319` event at 06:19:26, so retransmission can test dedupe without creating synthetic attendance data.

Do not enable periodic reconciliation merely to complete these canaries.

## Biometric collection enablement gate

Do not set `BIOMETRIC_COLLECTION_ENABLED=1` until all of the following are explicitly true:

- Wave 1 post-deploy fresh-punch and bounded-range physical canaries passed;
- real firmware behavior for the intended FP/FACE passive upload format was observed and matches the allowlisted parser;
- retention period, employee/privacy handling, backup policy, deletion/destruction policy and incident response are approved;
- ownership and recovery of the biometric encryption keyring are assigned;
- the production backup process covers encrypted vault rows and has a tested restore path;
- exactly the intended device pilot gate is enabled;
- explicit device PIN mappings are reviewed for the intended population;
- there is a documented rollback/disable decision owner present during the canary.

If any item is unresolved, keep collection OFF.

## Key creation and storage

Biometric keys are independent from `AUTH_ENCRYPTION_KEY`.

Generate a 32-byte key using an approved secure operator process, for example on the trusted VPS/operator workstation:

```bash
openssl rand -hex 32
```

Store key material only in the protected runtime secret/environment mechanism. Never commit it or paste it into chat, screenshots, CI logs, tickets or documentation.

The runtime variables are:

```text
BIOMETRIC_COLLECTION_ENABLED=0|1
BIOMETRIC_ACTIVE_KEY_ID=<operator-chosen-version-id>
BIOMETRIC_ENCRYPTION_KEYS=<JSON key-id to 32-byte hex key map>
```

When collection is ON, configuration is fail-closed if the active key ID is missing, malformed or absent from the keyring.

## Key rotation

Current Wave 2 supports versioned decryption keys but does **not** yet provide an approved bulk re-encryption/removal workflow.

Safe rotation preparation is therefore:

1. generate a new independent 32-byte key;
2. add the new key to `BIOMETRIC_ENCRYPTION_KEYS` while retaining every old key still referenced by stored credentials;
3. change `BIOMETRIC_ACTIVE_KEY_ID` to the new key ID;
4. restart the API and verify readiness;
5. new imports use the new active key; old encrypted rows remain decryptable through their historical key.

Do **not** remove an old key merely because a new active key exists. Old keys may be removed only after a future audited re-encryption/destruction workflow proves that no retained credential depends on them and backup/restore implications have been reviewed.

## Emergency disable

If biometric behavior is unexpected but attendance transport remains healthy:

1. disable the per-device pilot gate for the affected device;
2. if broader containment is required, set `BIOMETRIC_COLLECTION_ENABLED=0`;
3. restart/redeploy the API if the global gate changed;
4. verify readiness and ADMS polling;
5. leave already encrypted vault rows intact for investigation;
6. do not delete keys or credentials during incident triage.

Disabling collection does not require dropping Wave 2 tables.

## Application rollback

Migrations `0026`, `0027`, and `0028` are additive/guarding migrations. A rollback to the previous Wave 1 application commit should leave the extra Wave 2 schema untouched rather than attempting a destructive down-migration.

If a post-deploy application regression occurs:

1. keep the production database and additive Wave 2 schema intact;
2. keep biometric collection OFF;
3. redeploy the previously recorded known-good application commit/image;
4. verify `/api/health`, `/api/ready` and ADMS polling;
5. verify raw attendance ingestion still works before declaring recovery;
6. retain request/audit evidence for root-cause review.

Do not drop `attendance_biometric_*` or `attendance_adms_device_roster_entries` during emergency rollback.

## Stop conditions

Stop the canary and return to collection OFF / known-good application state if any of these occur:

- ADMS polling begins returning unexpected errors;
- ATTLOG bodies are redacted or lost instead of remaining lossless attendance evidence;
- sensitive USER/OPERLOG/template plaintext appears in routine request journal/API/UI/log output;
- a PIN is associated with an employee without one explicit effective mapping;
- a passive biometric row is created while either global or device collection gate is OFF;
- encrypted-vault configuration starts without the required active key when global collection is ON;
- command delivery differs materially from the allowlisted documented wire shape;
- duplicate historical attendance produces duplicate immutable event identities;
- physical behavior contradicts the current protocol assumption.

Any physical contradiction updates the protocol/design evidence first; do not broaden serializers to arbitrary commands as a shortcut.
