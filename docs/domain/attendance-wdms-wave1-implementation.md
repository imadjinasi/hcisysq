# ATT-005 Wave 1 — WDMS Core Device Plane Implementation

**Status:** IMPLEMENTATION  
**Specification:** ATT-005  
**Baseline:** `ff6bdaea9c14f017765aeb3ef76998f0d6e797f1`  
**Updated:** 2026-08-28

## Purpose

This document records the Wave 1 reliability implementation layered on top of the production-verified PR #15 ADMS transport/recovery foundation.

PR #15 already proved in production:

- device polling to HCIS;
- literal `OK` idle response on `/iclock/getrequest`;
- durable `LOG` command delivery;
- `/iclock/devicecmd` result ingestion with `Return=0` success;
- pre-registration ATTLOG recovery;
- raw-event persistence and exact deduplication;
- ATTLOG cursor recovery.

Fresh realtime physical punch after PR #15 remains **PENDING CANARY**. Synthetic tests and historical recovery do not satisfy that canary.

## Fixed attendance boundaries

Wave 1 does not change attendance meaning:

- `attendance_adms_events` remains raw device evidence;
- `attendance_daily_records` remains neutral punch/correction presentation;
- one fingerprint punch per Jakarta business date projects check-in only;
- two or more fingerprint punches project earliest check-in and latest check-out;
- manual attendance retains precedence over integration projection;
- PIN-to-employee mapping remains explicit;
- no device-management path infers late, absence, working hours, overtime, payroll deduction, leave conversion, or attendance-resolution outcome.

## Unknown-device discovery and trust

Unknown serials are observed in `attendance_adms_detected_devices`, a separate detection queue.

Detection is not trust:

- no registered `attendance_adms_devices` row is auto-created;
- unknown traffic remains journaled with no trusted device relationship;
- unknown ATTLOG remains unaccepted and quarantined;
- no device command is issued to an unclaimed serial.

An administrator may explicitly claim a detected device. Claim creates the canonical registry row in lifecycle `disabled`, not `active`. Activation remains a separate explicit lifecycle change through the existing device administration surface.

Keeping the detection queue separate from the trusted registry preserves PR #15 registration-after-capture recovery: pre-claim request journal rows keep `device_id = NULL`, so the first active request can recover eligible durable ATTLOG with the original `source_request_id` and exact-event deduplication.

Traffic received after claim while the device is intentionally `disabled` remains disallowed. Claim therefore represents the trust boundary; activation represents permission to accept live attendance traffic.

## Connectivity health

Connectivity and lifecycle are separate concepts.

Lifecycle describes administrative trust/permission (`active`, `disabled`, `quarantined`). Connectivity describes recent transport evidence (`online`, `offline`, `unknown`).

The Wave 1 health projection derives an effective connectivity timeout from:

1. optional per-device `connectivity_timeout_seconds` override; otherwise
2. three times the median interval between recent successful requests;
3. with an adaptive guardrail of 60–900 seconds.

If there is insufficient request-cadence evidence and no override, connectivity is `unknown` rather than guessed.

The Admin API exposes the observed median request interval, effective timeout, predicted offline timestamp, last successful request, last source IP, last command activity, and last raw-transaction activity.

## Transaction transfer commands

Wave 1 keeps the existing documented non-destructive `LOG` command for requesting current/new transaction transfer.

Historical recovery uses the ZKTeco PUSH data-query command shape:

```text
C:<command-id>:DATA QUERY ATTLOG StartTime=YYYY-MM-DD HH:mm:ss<TAB>EndTime=YYYY-MM-DD HH:mm:ss
```

The application does not accept arbitrary wire command text from Admin requests. Wire serialization is allowlisted to `LOG` and the validated ATTLOG range-query form.

Historical range requests:

- require an active device;
- require `start <= end`;
- are bounded to at most 31 days per request;
- convert the requested instants to the configured device timezone for wire serialization;
- enter the durable command queue before device delivery;
- reuse exact raw-event deduplication on retransmission.

`ATTLOGStamp=0 + CHECK` is not the primary historical-recovery UX.

## Command observability

Wave 1 exposes recent durable command state including:

- command number;
- operation/reason;
- wire command summary;
- status;
- attempt count;
- requested range;
- delivery/acknowledgement/completion timestamps;
- return code and result command.

Pending commands may be cancelled. Delivered commands are not presented as safely cancellable because the device may already have received them.

The existing retry behavior remains bounded and is used only for the current non-destructive/idempotent transaction-transfer operations. ATTLOG retransmission remains safe because raw event identity is exact-deduplicated.

## Admin UI

`Admin HCIS > Mesin Fingerprint` now adds a Wave 1 operational panel with:

- multi-device cards rather than relying only on the legacy dropdown;
- lifecycle and connectivity displayed separately;
- last activity and effective timeout diagnostics;
- sync-new transaction action;
- bounded historical range upload action;
- recent command state and pending cancellation;
- detected/untrusted device queue with explicit claim.

The existing PIN-mapping and raw-attendance administration surface remains available below it.

## Migration and recovery

Migration `0025_attendance_adms_wave1_core.sql` is additive.

It does not rewrite or delete:

- `attendance_adms_request_journal`;
- `attendance_adms_events`;
- `attendance_adms_quarantines`;
- `attendance_daily_records`;
- existing ATTLOG cursors;
- existing command history.

Existing production command #1 / `LOG`, cursor `9999`, and the six previously recovered raw events remain compatible with the extended schema.

Rollback of application code may leave additive Wave 1 tables/columns unused. Do not drop raw evidence as part of rollback. If schema rollback is required, remove only Wave 1 additive objects after confirming no Wave 1 command/detection evidence needs to be retained; immutable attendance evidence must remain untouched.

## Verification status

GitHub Actions for the Wave 1 draft PR has run clean migration, typecheck, lint, automated tests, build, and compose validation successfully on synthetic data.

Production deployment remains a human-approved cutover.

Hardware-dependent checks still required before Wave 1 is declared production-complete:

- fresh physical punch realtime canary — **PENDING CANARY**;
- bounded `DATA QUERY ATTLOG` request against a physical target device;
- retransmission/dedup evidence from that bounded historical request;
- online/offline transition observation using real device polling cadence.

Biometric vault, roster synchronization, remote enrollment, messages, firmware, reboot, and destructive maintenance remain outside this Wave 1 implementation.
