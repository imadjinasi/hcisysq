# ATT-005 Package 1 — Non-Biometric Device Operations Completion

**Status:** IMPLEMENTATION  
**Parent:** `attendance-wdms-device-parity.md`  
**Execution plan:** `attendance-wdms-implementation-plan.md`

## Outcome

Complete the production-useful non-biometric fingerprint-device plane in one integrated delivery package while preserving the physical-firmware safety findings from the USERINFO canaries.

After this package, ordinary Admin operation should cover:

- trusted device registry/connectivity;
- durable command/result history;
- realtime and historical attendance transaction recovery;
- explicit PIN-to-HCIS Employee mapping review;
- passive roster observations;
- mapped employee lifecycle review;
- safe same-PIN name synchronization;
- operational diagnostics and deployment verification.

Biometric credential backup/restore/distribution is deliberately reserved for Package 2 and remains production-disabled.

## Long-period historical recovery

HCIS does not invent a vendor `upload all` command.

The only physically approved historical request remains:

```text
DATA QUERY ATTLOG StartTime=<device-local timestamp>\tEndTime=<device-local timestamp>
```

Package 1 may orchestrate a longer requested period by splitting it into bounded chunks of at most 31 days.

Rules:

- explicit SUPER_ADMIN request only;
- overall job range greater than 31 days and at most 730 days;
- each child command uses the existing allowlisted ATTLOG serializer;
- one child command is active at a time;
- later child commands remain server-side `queued` and are not returned to the device until the previous child succeeds;
- success promotes exactly the next queued chunk;
- failure or expiry marks the job failed and cancels all not-yet-delivered chunks;
- Admin cancellation is allowed only while the current chunk remains pending; delivered/acknowledged chunks are not recalled;
- existing exact raw-event deduplication applies to retransmitted facts;
- the job reports persisted evidence/progress, not proof that a physical device contains no additional rows outside the requested period.

This is an HCIS orchestration capability, not a newly discovered PUSH command.

## Mapping review queue

The Users workspace may summarize and prioritize unmapped observed PINs, but it may not infer identity.

Allowed review inputs:

- observed raw ATTLOG PIN;
- passive safe roster display name already received by HCIS;
- event count/timestamps;
- active HCIS employee names for recommendation ranking.

Name similarity is only an ordering aid. It is not confidence/probability and it never writes a mapping.

Explicit Admin confirmation remains required to establish `device + PIN -> employees.id`.

Card number, employee number/NIP, unit, PIN shape, or external IDs are not automatic identity inputs.

Active USERINFO reads are retired. A PIN without passively observed roster metadata may remain without a name recommendation; HCIS must not issue a read command to fill that gap.

## USERINFO retirement boundary

Package 1 must preserve all of the following:

- no executable full `DATA QUERY USERINFO` route or serializer path;
- no executable `DATA QUERY USERINFO PIN=...` route or serializer path;
- database trigger `attendance_adms_reject_retired_userinfo_reads` remains active;
- historical USERINFO command evidence remains preserved;
- ordinary UI contains no retired USERINFO read controls;
- no alternate raw-command endpoint or roster dump is introduced.

Safe same-PIN name-only update remains a separate previously verified capability.

## Attendance invariants

This package does not change attendance meaning.

- raw ADMS events remain immutable evidence;
- daily records remain factual punch/correction presentation;
- one fingerprint punch on a Jakarta business date projects check-in only;
- two or more fingerprint punches project earliest check-in and latest check-out;
- manual attendance retains precedence;
- no late, absence, work-hour, overtime, leave, payroll, or attendance-resolution inference is introduced.

## Database and rollback

Migration `0034_attendance_adms_long_range_recovery.sql` is additive.

It adds:

- recovery-job orchestration state;
- optional recovery job/sequence linkage on durable commands;
- server-side `queued` command state;
- a trigger that promotes/stops bounded recovery chunks according to terminal command state.

It does not delete or rewrite:

- `attendance_adms_request_journal`;
- `attendance_adms_events`;
- `attendance_daily_records`;
- command history;
- USERINFO retirement evidence;
- biometric credential data.

Application rollback may leave additive recovery tables/columns unused. Database rollback is not automatic and raw attendance evidence must never be dropped as part of rollback.

## Deployment workflow

Package 1 also establishes the standard production release scripts:

```text
CODE -> PR/MERGE -> CI GREEN -> 1x DEPLOY VPS -> 1x VERIFY -> UAT if required -> DONE
```

See `docs/development/vps-deployment.md`.

The deployment script must take a pre-migration PostgreSQL backup, pin the exact main SHA, preserve biometric OFF, run health gates, and never use destructive Compose volume operations.

## Acceptance criteria

Package 1 is ready to merge when:

1. clean and upgrade-path migrations pass, including 0034 orchestration tests;
2. USERINFO retirement still rejects new full and single-PIN reads after 0034;
3. same-PIN name-only update remains valid;
4. long recovery creates only bounded ATTLOG commands;
5. only one long-recovery chunk can be active at a time;
6. success promotes the next chunk and failure/expiry stops the remainder;
7. mapping review remains recommendation-only and name-only;
8. no biometric operation is added or enabled;
9. deploy/verify scripts pass Bash syntax and static safety tests;
10. typecheck, lint, test, build, migration rehearsals, and Compose validation are green;
11. production deployment is executed once by an approved human operator using the pinned merged SHA;
12. post-deploy verification runs without issuing a device command.

A physical UAT command is not required merely to deploy this package. If the operator later chooses to exercise long-period recovery, it is a separate explicit operational action built only from the already proven bounded ATTLOG command family.
