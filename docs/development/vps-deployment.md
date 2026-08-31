# HCIS VPS Deployment Workflow

**Status:** ACTIVE RUNBOOK  
**Production path:** human-approved VPS cutover only

## Standard release flow

Normal HCIS production delivery follows one repeatable cycle:

```text
CODE -> PR/MERGE -> CI GREEN -> 1x DEPLOY VPS -> 1x VERIFY -> UAT if required -> DONE
```

Do not turn ordinary releases into a sequence of ad-hoc container commands. The repository scripts are the default operational path.

## Preconditions

Before production cutover:

- the target commit is merged to `origin/main`;
- required GitHub Actions validation is green for that exact PR head;
- the operator has explicitly approved the production deployment;
- the VPS working tree is clean;
- production environment secrets remain only on the VPS;
- `BIOMETRIC_COLLECTION_ENABLED=0` remains required until the separate biometric production gate is explicitly approved;
- migration recovery notes for the release have been reviewed.

Never use `docker compose down -v`.

## Deploy

From the production repository working tree:

```bash
./scripts/deploy-vps.sh <EXPECTED_MAIN_SHA>
```

The deploy script:

1. verifies a clean working tree and exact `origin/main` SHA;
2. refuses to continue if biometric collection is not OFF;
3. creates a timestamped PostgreSQL custom-format backup before application migration/cutover;
4. records backup checksum and deployment metadata under ignored `backups/deploy/`;
5. fast-forwards local `main` only;
6. builds target API and Web images before replacing running services;
7. recreates API and lets the existing API-start migration runner apply additive migrations;
8. waits for API health/readiness;
9. recreates Web and waits for Web health;
10. runs local proxy health smoke checks;
11. records the migration and Compose snapshots;
12. re-checks the retired USERINFO safety trigger and biometric gate.

PostgreSQL is not intentionally restarted by the normal application cutover.

## Failure and rollback guard

The script differentiates application rollback from database rollback.

If target application health fails after the target images have been built, the default guard attempts to rebuild/recreate API and Web from the previous application SHA.

The database is **never automatically rolled back**. Migrations may have committed before application health failed. A release that contains a non-backward-compatible or destructive schema migration requires its own reviewed recovery procedure and must not rely on generic application rollback.

ATT-005 Package 1 migration `0034_attendance_adms_long_range_recovery.sql` is additive. It does not rewrite or delete raw attendance evidence.

Set `AUTO_ROLLBACK_APP=0` only when a release-specific recovery procedure explicitly requires manual application rollback.

## Verification

After a successful deploy, run exactly once:

```bash
./scripts/verify-vps.sh <EXPECTED_MAIN_SHA>
```

The verification script checks:

- deployed repository SHA;
- PostgreSQL/API/Web container health;
- `/healthz`, `/api/health`, and `/api/ready`;
- latest repository migration equals latest applied migration;
- retired USERINFO database trigger exists exactly once;
- retired USERINFO controls are absent from the built Web bundle;
- app-shell no-store and hashed-asset immutable cache policy;
- read-only ADMS mapping lifecycle summary SQL;
- biometric collection environment gate remains OFF.

The verification script sends **zero device commands**.

## UAT policy

Run UAT only when it adds evidence that deployment/health checks cannot provide. Examples:

- changed business workflow;
- changed authorization/permission behavior;
- primary Admin UI workflow;
- external WhatsApp/email integration;
- sensitive migration/cutover;
- explicitly approved hardware/device command canary.

Do not run a physical fingerprint command merely to prove that a CSS change, read-only Admin summary, deployment script, or database safety trigger deployed successfully.

For browser verification after Web releases, use a fresh browser session when stale SPA state could hide the deployed asset. `index.html` is no-store while content-hashed assets remain immutable.

## Evidence handling

Deployment evidence may record:

- target/previous commit SHA;
- timestamps;
- container health;
- migration names/timestamps;
- safe trigger/configuration checks;
- backup path and checksum;
- redacted smoke/UAT screenshots.

Do not store production employee identifiers, device credential payloads, biometric bodies, passwords, keys, cookies, or access tokens in repository deployment records.
