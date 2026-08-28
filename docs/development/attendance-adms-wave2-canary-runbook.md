# ATT-005 Wave 2 Canary, Rollback & Key Operations Runbook

**Status:** PRE-PRODUCTION HARDENING  
**Applies to:** ATT-005 Wave 1 device plane + Wave 2 roster/biometric control-plane foundation  
**Production biometric collection:** OFF unless every enablement gate below is explicitly satisfied

This runbook does not authorize a production deploy by itself. Production deployment remains a human-operated VPS action. It also does not replace physical-device validation: synthetic CI proves software behavior only.

## Fixed safety boundary

Until the physical canary is complete:

- keep `BIOMETRIC_COLLECTION_ENABLED=0`;
- do not send roster/template/enrollment/delete/restore commands to fingerprint devices;
- do not enable periodic reconciliation automatically unless the previously validated Wave 1 operating policy explicitly calls for it;
- do not interpret roster absence as a missing device user/template;
- do not infer late, absence, work hours, overtime, payroll, leave, or attendance-resolution outcomes from raw fingerprint facts;
- keep device PIN to `employees.id` mapping explicit; leading zeroes remain significant.

`BIOMETRIC_COLLECTION_ENABLED` is currently a global application gate, not a per-device pilot selector. Enabling it may accept eligible passive FP/FACE uploads from any trusted active device whose PIN resolves through an explicit mapping. Therefore production must keep it OFF until either a narrower pilot control exists or there is explicit approval for that global collection boundary.

## Software pre-deploy gate

Before any production update:

1. PR quality gate is green on the exact commit being considered.
2. Clean migration passes.
3. Wave 1 -> Wave 2 upgrade rehearsal passes against an isolated schema seeded with existing Wave 1 device, journal, mapping and command state.
4. Typecheck, lint, DB integration tests, build and Compose validation pass.
5. `infra/.env.vps` still has `BIOMETRIC_COLLECTION_ENABLED=0`.
6. No valid biometric key material is committed to the repository or copied into tickets/chat/logs.
7. A verified PostgreSQL backup/restore path exists before migration is allowed to touch production.

The CI upgrade rehearsal is implemented by:

```bash
node apps/api/scripts/rehearse-wave2-upgrade.mjs
```

It applies migrations through `0025`, seeds representative Wave 1 state, applies `0026`, verifies preservation and new constraints, then removes the isolated rehearsal schema.

## Production deploy sequence

Follow `docs/development/vps-dev-deployment.md` for the authoritative VPS topology and Compose commands. For an already-running production checkout, the intended sequence is:

1. Record the currently deployed Git commit and current container/image identifiers.
2. Take and verify a PostgreSQL backup using the established VPS operations method.
3. Confirm `BIOMETRIC_COLLECTION_ENABLED=0` in the protected VPS environment file.
4. Fetch the approved commit from `main`.
5. Build API and web sequentially as documented for the memory-constrained VPS.
6. Start/update the Compose stack. The API applies pending additive migrations before starting.
7. Verify process/database health locally through the web proxy:

```bash
curl -i http://127.0.0.1:18080/api/health
curl -i http://127.0.0.1:18080/api/ready
```

8. Check container status and recent API/web/PostgreSQL logs before touching fingerprint behavior.
9. Verify existing ADMS polling continues without a spike in 4xx/5xx responses.

Do not enable biometric collection as part of the initial deployment.

## Wave 1 physical canary

The first physical gate remains attendance transport, not biometrics.

Use one controlled fresh fingerprint punch on `SPK7245000707` when access to the device is available and verify, in order:

1. the device continues polling HCIS normally;
2. the new punch reaches `/iclock/cdata` as ATTLOG;
3. the immutable raw ADMS event is stored with the original request provenance;
4. the exact leading-zero PIN resolves only through the explicit device mapping;
5. the neutral daily attendance projection is updated according to the documented earliest/latest punch rule;
6. no lateness, absence, overtime, work-hours, payroll, leave conversion, or attendance-resolution inference is introduced;
7. the event is visible in Admin observability.

Then validate the already-allowlisted read/recovery paths:

- one `INFO` command;
- one small bounded `DATA QUERY ATTLOG StartTime=... EndTime=...` request;
- repeat the same bounded range and confirm persisted event dedupe/retransmission behavior;
- verify online/offline status transitions using server-observed polling cadence.

A synthetic simulator or CI pass must not be recorded as completion of this physical canary.

## Wave 2 observation-only canary

With biometric collection still OFF:

1. observe normal device `USERINFO`/`OPERLOG` traffic if the firmware emits it naturally;
2. confirm sensitive request bodies are `NULL` in the routine request journal while SHA-256, byte length, classification and safe metadata remain available;
3. confirm safe roster observation stores only allowlisted PIN/name/card/privilege/verify-mode/group/timezone data;
4. confirm password and unknown vendor fields do not appear in roster rows, routine Admin API responses, UI, or safe log summaries;
5. if an FP/FACE record is emitted, confirm framing is recognized/redacted but **no** biometric credential row is created while collection is OFF;
6. preserve the physical wire evidence needed to decide whether the documented parser matches this firmware family.

Payloads larger than the 512 KiB ADMS capture limit are expected to return HTTP 413. Explicit sensitive tables must still be journaled as hash-only evidence with `bodyCapture=hash_only_oversize` and a redaction classification; oversized ATTLOG must not be parsed/projected.

## Biometric collection enablement gate

Do not set `BIOMETRIC_COLLECTION_ENABLED=1` until all of the following are explicitly true:

- Wave 1 fresh-punch and bounded-range physical canaries passed;
- real firmware behavior for the intended FP/FACE passive upload format was observed and matches the allowlisted parser;
- retention period, employee/privacy handling, backup policy, deletion/destruction policy and incident response are approved;
- ownership and recovery of the biometric encryption keyring are assigned;
- the production backup process covers encrypted vault rows and has a tested restore path;
- the collection scope is acceptable given that the current flag is global rather than per-device;
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

1. set `BIOMETRIC_COLLECTION_ENABLED=0`;
2. restart/redeploy the API with the same code/database;
3. verify readiness and ADMS polling;
4. leave already encrypted vault rows intact for investigation;
5. do not delete keys or credentials during incident triage.

Disabling collection does not require dropping Wave 2 tables.

## Application rollback

Migration `0026` is additive. A rollback to the previous Wave 1 application commit should therefore leave the extra Wave 2 tables untouched rather than attempting a destructive down-migration.

If a post-deploy application regression occurs:

1. keep the production database and additive Wave 2 schema intact;
2. set biometric collection OFF;
3. redeploy the previously recorded known-good application commit/image;
4. verify `/api/health`, `/api/ready` and ADMS polling;
5. verify raw attendance ingestion still works before declaring recovery;
6. retain request/audit evidence for root-cause review.

Do not drop `attendance_biometric_*` or `attendance_adms_device_roster_entries` during emergency rollback. Destructive database rollback can destroy forensic/provenance data and is not part of the normal rollback plan.

## Stop conditions

Stop the canary and return to collection OFF / known-good application state if any of these occur:

- ADMS polling begins returning unexpected errors;
- ATTLOG bodies are redacted or lost instead of remaining lossless attendance evidence;
- sensitive USER/OPERLOG/template plaintext appears in routine request journal/API/UI/log output;
- a PIN is associated with an employee without one explicit effective mapping;
- a passive biometric row is created while collection is OFF;
- encrypted-vault configuration starts without the required active key when collection is ON;
- command delivery differs materially from the allowlisted documented wire shape;
- duplicate historical attendance produces duplicate immutable event identities;
- physical behavior contradicts the current protocol assumption.

Any physical contradiction updates the protocol/design evidence first; do not broaden serializers to arbitrary commands as a shortcut.
