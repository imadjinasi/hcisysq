# Product Scope

**Status:** ACCEPTED — MVP COMPLETE, POST-MVP PLANNING ACTIVE  
**Updated:** 2026-08-22

## Sequencing principle

HCIS is built through vertical slices rather than by creating every screen first. Each slice must include the relevant UI, API, domain rules, permissions, audit, tests, and minimum operational behavior.

Detailed MVP scope is defined in `docs/product/mvp.md`. Final MVP evidence is frozen in `docs/product/mvp-release-checkpoint.md`.

## Verified MVP foundation

The verified MVP foundation includes:

- API/runtime configuration and health checks;
- PostgreSQL local/CI/runtime verification and migration runner;
- employee master + controlled CSV/XLSX import;
- organization unit/position reference data, current reporting line, and Unit Approver foundation;
- identity, session, and account activation foundation;
- role, permission, scope, and policy foundation;
- audit trail;
- notification outbox/intents required by MVP workflows;
- encrypted leave evidence storage adapter;
- logging/deployment/backup runbook foundation.

Production delivery adapters, full legacy cutover, and production security sign-off remain separate gates.

## Employee master — VERIFIED

```text
Start API + PostgreSQL
  -> upload synthetic employee workbook/CSV
  -> preview validation
  -> confirm import
  -> upsert employee by NIP
  -> normalize unit + position references
  -> review import history
```

Employee import remains the upstream source for employee/organization reference data and does not automatically create accounts.

## Leave vertical slices — VERIFIED

The MVP now includes more than the original annual-leave minimum:

```text
Login
  -> employee leave preview/submit
  -> working-day/policy validation
  -> approval chain resolved and snapshotted
  -> line approval where policy requires it
  -> HC notification / validation / actual approval according to policy
  -> attendance resolution when administration leaves unresolved dates
  -> audit + notification intents
```

Synthetic browser UAT verified annual, special, planned, unpaid, and attendance-resolution boundaries.

## Attendance factual foundation — VERIFIED

ATT-001 provides a raw/factual attendance foundation:

- employee self-read;
- Super Admin manual create/update/delete;
- immutable audit history;
- explicit source/provenance;
- Asia/Jakarta business-time handling.

Still post-MVP:

- work schedules/shift;
- lateness tolerance;
- absence inference from missing punch;
- overtime/work-hour calculation;
- GPS/photo/fingerprint production flow;
- payroll consequence.

## Payslip read-only — VERIFIED

The MVP includes read-only payslip data from controlled import. HCIS does not calculate payroll.

```text
Authorized importer
  -> upload CSV
  -> validate
  -> preview/review
  -> commit draft
  -> publish
  -> employee reads own published payslip
```

Import/publish, owner-only read, Board denial, published immutability, audit, and canonical period serialization were verified with synthetic data.

Reimbursement is not part of the completed MVP.

## Foundation Board — VERIFIED

`/board` is an aggregate-first, read-only governance dashboard. Browser UAT verified that Foundation Board cannot cross into employee/admin principal areas and does not receive personal payslip access.

# Immediate post-MVP design priority: ORG-004 Dynamic Organization Foundation

Before broad employee-account activation or deeper feature expansion, HCIS should evolve the current explicit organization mapping into a modular, effective-dated structure model.

Design baseline:

`docs/domain/dynamic-organization-structure.md`

The reason is operational rather than cosmetic: YSQ organization structure may change frequently, and normal restructuring must not require source-code changes or repetitive per-employee approver maintenance.

The accepted target includes:

- visual Organization Designer;
- organizational nodes/teams;
- authority-bearing positions/seats;
- employee membership;
- effective primary and acting incumbencies;
- supervisory and governance relationships;
- explicit authority bindings;
- vacancy policies;
- structural direct-manager resolution;
- employee-level reporting override for real exceptions;
- effective dating and historical/future views;
- draft/validate/preview/publish restructure flow;
- approval-chain preview;
- immutable transaction snapshots after semantic authority resolution.

Key accepted policy decisions:

```text
Leave with line/governance approval:
after the overall request reaches final approved
-> notify one structural layer above the final line/governance approver
```

The notification is informational only. HC validation or later HC actual approval does not automatically redefine the structural oversight target.

Director leave governance:

```text
Director
-> Secretary of the Foundation APPROVES
-> request APPROVED
-> Chair of the Foundation NOTIFIED
```

Pembina/Foundation Supervisor is not notified by this rule.

Supervisory vacancy example:

```text
Director
-> Head of Social Division [VACANT]
-> Social Staff
```

Target direct-manager resolution:

```text
Social Staff -> Director
```

The vacant seat remains in the organization structure; the resolver climbs according to configured vacancy policy.

ORG-004 is a **planned successor** to the verified MVP current-state organization model. It is not current runtime behavior yet. Migration must preserve all existing approval snapshots.

## Why ORG-004 comes before broad real-user approval testing

The completed MVP already proves the technical approval engine with synthetic data. The next important operational proof is that imported real employee identities can participate in a real organization-driven approval chain.

Activating many employee accounts while normal reporting still depends on repetitive employee-by-employee manager setup would validate a model that is already planned to evolve.

Recommended sequence:

```text
MVP COMPLETE
  -> finalize ORG-004 organization model
  -> implement structure read/visualization
  -> configure/validate real YSQ structure
  -> shadow-compare structural resolver with current explicit resolver
  -> controlled activation for selected units/personas
  -> real employee approval-chain verification
  -> deeper feature-by-feature product refinement
```

## Other post-MVP target modules

After organization/pilot readiness is stable, candidate modules include:

- Attendance schedule/shift, location, GPS/photo/fingerprint, and evidence policy beyond ATT-001;
- Reimbursement;
- Payroll calculation, reconciliation, statutory semantics, and full payslip behavior beyond opaque imported lines;
- Employee loan and installments;
- Performance review;
- Training and learning records;
- Employment certificates and warning letters;
- richer organization/academic calendar management;
- announcement, reminder, production email, and WhatsApp notification adapters;
- employee data change request;
- recruitment/careers if discovery validates product priority;
- additional role-aware/governance reporting;
- full legacy-data migration/cutover.

## Outside initial scope

- separate native mobile application;
- general internal real-time chat;
- full general ledger/accounting;
- vendor-specific biometric device management without an adapter boundary;
- separate data warehouse;
- commercial multi-tenancy.

# Release gates

## Foundation ready — PASS

- API and PostgreSQL run in clean/local verification environments.
- Clean migration and realistic upgrade path passed.
- Employee import has automated synthetic verification.
- Identity, permission, scope, audit, and environment configuration have tests.
- Lint, typecheck, tests, and build passed at the verified MVP checkpoint.

## MVP ready — PASS

- Leave vertical slices passed synthetic end-to-end browser UAT.
- Approval snapshot and role/scope boundaries were verified.
- Attendance factual mutation + audit passed synthetic UAT.
- Payslip import/publish/read-only access passed synthetic UAT.
- Foundation Board read-only boundary passed browser UAT.
- Cross-principal authorization passed browser UAT.
- Final verified application SHA is recorded in `docs/product/mvp-release-checkpoint.md`.

## Organization foundation ready — IMPLEMENTED LOCALLY, OPERATIONAL VALIDATION PENDING

Before structure-driven approval is activated for real pilot users:

- ORG-004 data model is implemented without rewriting existing snapshots;
- current YSQ structure is represented as nodes/positions/memberships/incumbencies;
- acting and vacancy behavior have automated tests;
- organization cycles and invalid effective-date overlaps are rejected;
- Organization Designer can preview structure and resolved approval chains;
- shadow resolution can compare ORG-004 results with current explicit mapping;
- Director governance rule resolves Secretary as approver and Chair as post-approval notification recipient;
- one-level-above post-final-approval line/governance notification is verified;
- structure-derived authority remains constrained by backend RBAC;
- selected real organization configuration is reviewed before activation.

The ORG-004 branch now implements the data model, resolver, Organization Designer, draft/validate/impact/publish lifecycle, controlled rollout, Leave consumption, and post-approval oversight intent with synthetic automated coverage. It remains **not deployed** and **not production validated**. The real YSQ structure, SHADOW comparison evidence, selected-unit activation approval, and real-principal capability review remain operational prerequisites rather than completed claims.

## Pilot ready — PENDING

MVP complete does not automatically mean Pilot Ready. Before pilot:

- define staging/pilot data policy (synthetic or sanitized/approved real configuration);
- perform a backup **and restore drill**, not only backup creation;
- ensure minimum observability and incident/rollback paths exist;
- define pilot users/personas and operational scope;
- validate the organization setup used by the pilot (manager, authority, role/scope, calendar);
- review security/operational assumptions for any real data used by the pilot;
- decide whether password recovery and production notification delivery are required for the selected pilot population or whether documented administrative/manual fallback is acceptable.

## Production ready — PENDING

- legacy-data migration/cutover rehearsal succeeds and reconciles;
- security review is complete;
- production operational runbook and ownership exist;
- legacy freeze/cutover plan is approved;
- rollback/data-recovery procedure is tested;
- old system remains read-only during the agreed verification period;
- production go-live is approved by the authorized operational owner.
