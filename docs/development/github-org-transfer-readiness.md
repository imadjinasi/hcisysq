# GitHub Organization Transfer Readiness

**Status:** READINESS RUNBOOK  
**Current repository:** `imadjinasi/hcisysq`  
**Planned canonical repository:** `sabilulquran/hcisysq`

This runbook prepares the repository for a manual GitHub organization transfer without changing the running HCIS environments during the transfer itself.

## Invariants

The transfer must preserve all of these invariants:

- repository name remains exactly `hcisysq`;
- repository visibility remains **PUBLIC**;
- default branch remains `main`;
- no production, staging, or VPS runtime change is part of the repository transfer;
- no production/staging secrets or environment values are changed as part of the transfer;
- existing runtime image references remain on the currently proven personal GHCR namespace until organization-owned packages are published and verified separately.

## Repository transfer and GHCR are separate changes

Transferring `imadjinasi/hcisysq` to `sabilulquran/hcisysq` changes the GitHub repository owner. It must not be treated as proof that the existing GHCR packages have moved with the repository.

The current runtime defaults intentionally remain on:

- `ghcr.io/imadjinasi/hcisysq-api`
- `ghcr.io/imadjinasi/hcisysq-web`

Do not change `infra/docker-compose.staging.yml`, the VPS deploy defaults, or any running environment to `ghcr.io/sabilulquran/...` during transfer readiness.

The publisher workflow is owner-aware so that, after the repository is transferred, a new workflow run targets:

- `ghcr.io/${{ github.repository_owner }}/hcisysq-api`
- `ghcr.io/${{ github.repository_owner }}/hcisysq-web`

Published OCI metadata must identify the repository that executed the workflow through:

```text
org.opencontainers.image.source=https://github.com/${{ github.repository }}
```

## Pre-transfer checklist

Before the manual transfer:

- [ ] readiness PR is reviewed, CI is green, and the approved readiness change is merged to `main`;
- [ ] `main` has no unreviewed concurrent hotfix or release work;
- [ ] no GitHub Actions workflow is queued or in progress;
- [ ] repository is still PUBLIC;
- [ ] repository name is still `hcisysq`;
- [ ] production and staging are healthy on their already-proven image namespace;
- [ ] no runtime image, environment, or secret change is bundled with the transfer.

Do not transfer while a release/deploy workflow or hotfix is in flight.

## Manual transfer

The repository transfer itself is an explicit GitHub administration action. Transfer the repository to the `sabilulquran` organization while keeping the repository name `hcisysq` and visibility PUBLIC.

The expected canonical repository after the transfer is:

```text
https://github.com/sabilulquran/hcisysq
```

Fresh clones should use that URL only after the transfer has completed. Existing checkouts should update their `origin` URL only after the new canonical repository is confirmed.

## Deployment freeze after transfer

After the repository transfer, freeze deployment of any **new SHA** until organization-owned GHCR publishing has been proven.

During this freeze:

- existing production/staging workloads remain on the already-proven personal GHCR packages;
- do not point production or staging at `ghcr.io/sabilulquran/...`;
- do not change `scripts/deploy-vps.sh` GHCR defaults merely because the repository owner changed;
- do not infer package readiness from repository transfer success.

The freeze ends only after an exact-SHA API image and exact-SHA Web image have both been published successfully in the organization namespace and verified.

## Post-transfer verification

Verify the following before ending the repository-transfer maintenance window:

1. **Repository identity**
   - owner is `sabilulquran`;
   - name is `hcisysq`;
   - canonical URL is `https://github.com/sabilulquran/hcisysq`.
2. **Visibility**
   - repository remains PUBLIC.
3. **Default branch**
   - default branch remains `main`;
   - expected `main` SHA is present.
4. **Branches and pull requests**
   - required branches are present;
   - open PR state is preserved;
   - no unexpected branch or PR disappeared during transfer.
5. **GitHub App/integration permissions**
   - required GitHub Apps and repository integrations still have access in the organization;
   - organization policy has not silently removed permissions needed by automation.
6. **GitHub Actions**
   - workflow files are present and enabled;
   - required Actions permissions/policies allow the validation workflows to run;
   - repository `GITHUB_TOKEN` can perform the permissions declared by each workflow.
7. **Organization GHCR publisher**
   - manually run the image publisher for a reviewed exact SHA after transfer;
   - confirm API publishes as `ghcr.io/sabilulquran/hcisysq-api:sha-<SHA>`;
   - confirm Web publishes as `ghcr.io/sabilulquran/hcisysq-web:sha-<SHA>`;
   - confirm both package/image publications succeeded;
   - confirm OCI source metadata points to `https://github.com/sabilulquran/hcisysq`.

If organization package publishing fails, keep the deployment freeze in place and keep runtime on the existing personal GHCR namespace.

## Runtime migration is a later change

Only after organization GHCR publishing is proven should a separate, reviewed runtime-migration change consider switching staging/production image targets to `ghcr.io/sabilulquran/...`.

That later change must use the normal branch -> PR -> CI -> approval -> merge -> controlled deploy/verify process. It is intentionally outside this repository-transfer readiness work.
