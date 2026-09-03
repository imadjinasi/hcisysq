# GitHub to HCIS Production VPS Deployment

**Status:** READINESS — workflow may be merged before production credentials are configured, but production deployment must remain manually approved.

## Goal

Production delivery is initiated from GitHub Actions while the VPS remains the runtime host. The workflow deploys only the exact current `main` SHA and delegates the actual cutover, migration, health checks, rollback guard, and verification to the repository scripts already used on the VPS.

```text
PR -> CI green -> merge main -> exact-SHA GHCR publish -> manual GitHub production approval -> SSH -> deploy-vps.sh -> verify-vps.sh
```

The workflow is intentionally **not** triggered automatically by a merge or image publication.

## Required GitHub environment

Create a GitHub Environment named `production`. Configure required reviewers / deployment protection there before enabling routine use.

The workflow expects these Environment secrets:

- `HCIS_PROD_HOST` — production VPS hostname or IP.
- `HCIS_PROD_USER` — dedicated SSH operator account that can run Docker without an interactive sudo prompt.
- `HCIS_PROD_REPO_PATH` — absolute path to the HCIS production working tree.
- `HCIS_PROD_SSH_PRIVATE_KEY` — private SSH key dedicated to GitHub Actions deployment.
- `HCIS_PROD_SSH_KNOWN_HOSTS` — pinned `known_hosts` entry for the production VPS. Do not replace this with an unauthenticated runtime `ssh-keyscan` step.

Do not store the production application `.env`, database password, auth encryption key, biometric keyring, or other application secrets in GitHub. Those remain VPS-local.

The job's ephemeral `GITHUB_TOKEN` is granted only `contents: read` and `packages: read`. It is piped through SSH to `docker login ghcr.io --password-stdin`, used for the deployment window, and removed from the VPS with `docker logout ghcr.io` in an `always()` cleanup step.

## Manual gate

Run **Deploy HCIS Production** manually and provide:

- `target_sha`: the full 40-character SHA to deploy;
- `confirmation`: exactly `DEPLOY_PRODUCTION`.

The workflow refuses to deploy if `target_sha` is not the current `origin/main` SHA.

Use the GitHub `production` Environment approval as the human authorization boundary. Starting the workflow is not a substitute for an approved production deployment.

## Preflight safety

Before `deploy-vps.sh` can run, the workflow verifies remotely that:

1. the production working tree is clean;
2. the production Git remote points to `sabilulquran/hcisysq`;
3. `origin/main` still equals the requested exact SHA;
4. `BIOMETRIC_COLLECTION_ENABLED=0` remains true;
5. the target API and Web exact-SHA images can be pulled from organization GHCR;
6. the **currently deployed SHA** API and Web images can also be pulled from organization GHCR.

The last condition is required because `deploy-vps.sh` automatically attempts application rollback to the previous SHA if the new application fails health checks. The GitHub workflow must not start a cutover unless that rollback image is available.

## First organization-GHCR cutover

The currently deployed production SHA may predate the repository transfer and therefore may exist only in `ghcr.io/imadjinasi/...`.

If the production preflight reports that rollback images are missing, **do not bypass the check** and do not disable automatic rollback.

Instead:

1. read the current production SHA from the VPS without changing runtime;
2. run **Publish HCIS Staging Images** manually with that full historical SHA in `target_sha`;
3. the publisher verifies that the SHA is an ancestor of `main` and publishes only the immutable `sha-<SHA>` API/Web tags to `ghcr.io/sabilulquran/...`;
4. it intentionally does **not** move the `staging` tag when backfilling a historical SHA;
5. rerun the production workflow preflight.

Once the previous production SHA and target SHA are both present in organization GHCR, the first cutover is rollback-safe.

## Runtime image namespace

The GitHub production workflow explicitly exports:

```text
HCIS_GHCR_API_REPO=ghcr.io/sabilulquran/hcisysq-api
HCIS_GHCR_WEB_REPO=ghcr.io/sabilulquran/hcisysq-web
```

This means the first organization cutover does not require changing the default repository values in `scripts/deploy-vps.sh` ahead of time. Keeping the script defaults unchanged until the first organization deployment succeeds reduces the migration blast radius.

After a successful organization-GHCR production deployment and verification, the old personal-namespace defaults can be retired in a separate cleanup PR.

## What the GitHub workflow does not do

It does not:

- auto-deploy on merge;
- change production application secrets;
- enable biometric collection;
- run arbitrary device commands;
- bypass the repository deployment or verification scripts;
- disable rollback checks;
- delete personal GHCR packages;
- change database rollback policy.

Database rollback remains manual and release-specific, exactly as documented in `vps-deployment.md`.

## First-use checklist

Before the first real GitHub-triggered production cutover:

- [ ] `production` Environment exists with required reviewer protection.
- [ ] all five SSH/VPS Environment secrets are configured.
- [ ] the SSH account is least-privilege and can run the required Docker/Git operations non-interactively.
- [ ] the pinned host key has been independently verified.
- [ ] current production SHA is recorded read-only.
- [ ] organization GHCR contains exact-SHA API/Web images for both current production and target `main`.
- [ ] target PR/CI is green and target SHA is current `main`.
- [ ] production deployment is explicitly approved.
- [ ] no concurrent HCIS production deployment is running.

The workflow itself also uses a non-cancelling `hcis-production` concurrency group so two GitHub-triggered production deployments cannot run simultaneously.
