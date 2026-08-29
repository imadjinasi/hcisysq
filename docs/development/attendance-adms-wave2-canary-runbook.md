# ATT-005 Wave 2 Canary, Rollback & Key Operations Runbook

**Status:** PRE-PRODUCTION HARDENING  
**Applies to:** ATT-005 Wave 1 device plane + Wave 2 roster/biometric control-plane foundation  
**Production biometric collection:** OFF unless every enablement gate below is explicitly satisfied

This runbook does not authorize a production deploy by itself. Production deployment remains a human-operated VPS action. It also does not replace physical-device validation: synthetic CI proves software behavior only.

## Fixed safety boundary

Until the physical canary is complete:

- keep `BIOMETRIC_COLLECTION_ENABLED=0`;
- keep every device `biometric_collection_enabled=false`;
- do not send roster/template/enrollment/delete/restore commands to fingerprint devices;
- do not enable periodic reconciliation automatically unless the previously validated Wave 1 operating policy explicitly calls for it;
- do not interpret roster absence as a missing device user/template;
- do not infer late, absence, work hours, overtime, payroll, leave, or attendance-resolution outcomes from raw fingerprint facts;
- keep device PIN to `employees.id` mapping explicit; leading zeroes remain significant.

Biometric collection now has two independent HCIS gates:

1. process-wide `BIOMETRIC_COLLECTION_ENABLED=1` with a valid biometric keyring; and
2. audited per-device `biometric_collection_enabled=true` on exactly the trusted pilot device.

Effective collection is true only when **both** gates are ON and the device lifecycle is `active`. Migration `0027` defaults every existing device to device-gate OFF, so enabling the process-wide flag cannot silently opt existing devices into collection.

The per-device gate is local HCIS policy. Changing it does **not** send a command to the fingerprint machine.

## Software pre-deploy gate

Before any production update:

1. PR quality gate is green on the exact commit being considered.
2. Clean migration passes.
3. Wave 1 -> Wave 2 upgrade rehearsal passes against an isolated schema seeded with existing Wave 1 device, journal, mapping and command state.
4. The rehearsal proves migration `0027` leaves every seeded existing device with biometric device-gate OFF.
5. Typecheck, lint, DB integration tests, build and Compose validation pass.
6. `infra/.env.vps` still has `BIOMETRIC_COLLECTION_ENABLED=0` for the initial deploy.
7. No valid biometric key material is committed to the repository or copied into tickets/chat/logs.
8. A verified PostgreSQL backup/restore path exists before migration is allowed to touch production.

The CI upgrade rehearsal is implemented by:

```bash
node apps/api/scripts/rehearse-wave2-upgrade.mjs
```

It applies migrations through `0025`, seeds representative Wave 1 state, applies `0026` and `0027`, verifies preservation, encrypted-vault constraints and default-OFF device pilot policy, then removes the isolated rehearsal schema.

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
10. In Admin Wave 2, verify every device shows `device OFF` and `effective OFF`.

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

With global and device biometric gates still OFF:

1. observe normal device `USERINFO`/`OPERLOG` traffic if the firmware emits it naturally;
2. confirm sensitive request bodies are `NULL` in the routine request journal while SHA-256, byte length, classification and safe metadata remain available;
3. confirm safe roster observation stores only allowlisted PIN/name/card/privilege/verify-mode/group/timezone data;
4. confirm password and unknown vendor fields do not appear in roster rows, routine Admin API responses, UI, or safe log summaries;
5. if an FP/FACE record is emitted, confirm framing is recognized/redacted but **no** biometric credential row is created;
6. preserve the physical wire evidence needed to decide whether the documented parser matches this firmware family.

Payloads larger than the 512 KiB ADMS capture limit are expected to return HTTP 413. Explicit sensitive tables must still be journaled as hash-only evidence with `bodyCapture=hash_only_oversize` and a redaction classification; oversized ATTLOG must not be parsed/projected.

## Biometric collection enablement gate

Do not begin active biometric collection until all of the following are explicitly true:

- Wave 1 fresh-punch and bounded-range physical canaries passed;
- real firmware behavior for the intended FP/FACE passive upload format was observed and matches the allowlisted parser;
- retention period, employee/privacy handling, backup policy, deletion/destruction policy and incident response are approved;
- ownership and recovery of the biometric encryption keyring are assigned;
- the production backup process covers encrypted vault rows and has a tested restore path;
- explicit device PIN mappings are reviewed for the intended pilot population;
- there is a documented rollback/disable decision owner present during the canary.

Then use this order:

1. keep every device pilot gate OFF;
2. provision the valid biometric keyring in the protected runtime environment;
3. set `BIOMETRIC_COLLECTION_ENABLED=1` and restart/redeploy the API;
4. verify `/api/ready`, ADMS polling and Admin Wave 2: global ON, every device OFF, every effective gate OFF;
5. select exactly one trusted active pilot device;
6. use the SUPER_ADMIN Wave 2 policy control to set that device gate ON;
7. verify Admin shows `global ON / device ON / effective ON` only for that device;
8. observe the smallest possible passive physical canary and verify encrypted vault provenance;
9. keep all other device gates OFF.

The API rejects device-gate enablement when global collection is OFF or the target device lifecycle is not `active`.

If any prerequisite is unresolved, keep both gates OFF.

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

When global collection is ON, configuration is fail-closed if the active key ID is missing, malformed or absent from the keyring. A valid global configuration alone does not collect data until a trusted active device is also explicitly enabled as a pilot.

## Key rotation

Current Wave 2 supports versioned decryption keys but does **not** yet provide an approved bulk re-encryption/removal workflow.

Safe rotation preparation is therefore:

1. generate a new independent 32-byte key;
2. add the new key to `BIOMETRIC_ENCRYPTION_KEYS` while retaining every old key still referenced by stored credentials;
3. change `BIOMETRIC_ACTIVE_KEY_ID` to the new key ID;
4. restart the API and verify readiness;
5. confirm intended device pilot gates did not change during restart;
6. new imports use the new active key; old encrypted rows remain decryptable through their historical key.

Do **not** remove an old key merely because a new active key exists. Old keys may be removed only after a future audited re-encryption/destruction workflow proves that no retained credential depends on them and backup/restore implications have been reviewed.

## Emergency disable

If biometric behavior is unexpected but attendance transport remains healthy, prefer the narrowest safe stop first:

1. disable the affected device pilot gate through the audited SUPER_ADMIN policy control;
2. verify effective collection becomes OFF immediately for that device;
3. if scope is uncertain or multiple devices are affected, set `BIOMETRIC_COLLECTION_ENABLED=0` and restart/redeploy the API;
4. verify readiness and ADMS polling;
5. leave already encrypted vault rows intact for investigation;
6. do not delete keys or credentials during incident triage.

Disabling either gate stops new vault imports. It does not require dropping Wave 2 tables or changing the fingerprint device configuration.

## Application rollback

Migrations `0026` and `0027` are additive. A rollback to the previous Wave 1 application commit should therefore leave the extra Wave 2 tables/columns untouched rather than attempting a destructive down-migration.

If a post-deploy application regression occurs:

1. keep the production database and additive Wave 2 schema intact;
2. set global biometric collection OFF;
3. redeploy the previously recorded known-good application commit/image;
4. verify `/api/health`, `/api/ready` and ADMS polling;
5. verify raw attendance ingestion still works before declaring recovery;
6. retain request/audit evidence for root-cause review.

Do not drop `attendance_biometric_*`, `attendance_adms_device_roster_entries`, or the device pilot-policy columns during emergency rollback. Destructive database rollback can destroy forensic/provenance data and is not part of the normal rollback plan.

## Stop conditions

Stop the canary and return the affected device gate/global gate to OFF or the known-good application state if any of these occur:

- ADMS polling begins returning unexpected errors;
- ATTLOG bodies are redacted or lost instead of remaining lossless attendance evidence;
- sensitive USER/OPERLOG/template plaintext appears in routine request journal/API/UI/log output;
- a PIN is associated with an employee without one explicit effective mapping;
- a passive biometric row is created while either required collection gate is OFF;
- a non-pilot device receives a biometric credential while its device gate is OFF;
- encrypted-vault configuration starts without the required active key when global collection is ON;
- command delivery differs materially from the allowlisted documented wire shape;
- duplicate historical attendance produces duplicate immutable event identities;
- physical behavior contradicts the current protocol assumption.

Any physical contradiction updates the protocol/design evidence first; do not broaden serializers to arbitrary commands as a shortcut.
