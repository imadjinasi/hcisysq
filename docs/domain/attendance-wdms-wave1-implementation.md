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

An administrator may explicitly claim a detected device. Claim creates the canonical registry row in lifecycle `disabled`, not `active`. Activation remains a separate explicit lifecycle change through the existing device administration surface. The claim request body is optional; when omitted, the device timezone defaults to `Asia/Jakarta` and the display name remains unset.

Keeping the detection queue separate from the trusted registry preserves PR #15 registration-after-capture recovery: pre-claim request journal rows keep `device_id = NULL`, so the first active request can recover eligible durable ATTLOG with the original `source_request_id` and exact-event deduplication.

Traffic received after claim while the device is intentionally `disabled` remains disallowed. Claim therefore represents the trust boundary; activation represents permission to accept live attendance traffic.

## Connectivity health and policy

Connectivity and lifecycle are separate concepts.

Lifecycle describes administrative trust/permission (`active`, `disabled`, `quarantined`). Connectivity describes recent transport evidence (`online`, `offline`, `unknown`).

The Wave 1 health projection derives an effective connectivity timeout from:

1. optional per-device `connectivity_timeout_seconds` override; otherwise
2. three times the median interval between recent successful requests;
3. with an adaptive guardrail of 60–900 seconds.

If there is insufficient request-cadence evidence and no override, connectivity is `unknown` rather than guessed.

The Admin API exposes the observed median request interval, effective timeout, predicted offline timestamp, last successful request, last source IP, last command activity, last successful sync, and last raw-transaction activity.

Super Admin can set an explicit timeout override from 30–3600 seconds or clear it to return to adaptive mode. Policy changes are audited as device updates rather than hidden operational state.

## Safe device telemetry and Read Information

Wave 1 retains safe transport metadata observed on ADMS requests for registered devices under `attendance_adms_devices.metadata.transportObserved`.

The currently captured transport metadata is deliberately narrow and may include values such as PUSH version and language plus the observation timestamp. It does not expose raw request bodies through the Admin telemetry endpoint.

Wave 1 also supports the documented read-only `INFO` command. The wire serializer only permits the literal allowlisted command:

```text
C:<command-id>:INFO
```

Successful INFO response options are filtered through an explicit allowlist before being stored under `attendance_adms_devices.metadata.infoObserved`. The allowlist covers operational evidence such as firmware, platform/PUSH version and supported user/fingerprint/face/palm/transaction counters. Unknown INFO options are ignored rather than copied into the operational read model.

`FWVersion`, when returned by a successful INFO result, may refresh `firmware_version`. Platform/device-name values are retained as observed telemetry and are not automatically treated as a canonical model number when the protocol does not prove that equivalence.

No arbitrary remote-command input, shell command, or generic wire-command field is exposed to Admin users.

## Transaction transfer commands

Wave 1 keeps the existing documented non-destructive `LOG` command for requesting current/new transaction transfer.

Historical recovery uses the ZKTeco PUSH data-query command shape:

```text
C:<command-id>:DATA QUERY ATTLOG StartTime=YYYY-MM-DD HH:mm:ss<TAB>EndTime=YYYY-MM-DD HH:mm:ss
```

The application does not accept arbitrary wire command text from Admin requests. Wire serialization is allowlisted to `LOG`, `INFO`, and the validated ATTLOG range-query form. The repository command model treats the stored wire command as validated command text instead of incorrectly typing every durable transfer as the literal `LOG` command.

Historical range requests:

- require an active device;
- require `start <= end`;
- are bounded to at most 31 days per request;
- convert the requested instants to the configured device timezone for wire serialization;
- enter the durable command queue before device delivery;
- reuse exact raw-event deduplication on retransmission.

`ATTLOGStamp=0 + CHECK` is not the primary historical-recovery UX.

The accepted WDMS parity reference includes an “upload all transactions” action. No separate documented PUSH wire command for “all” has been proven for the current physical device/firmware, so Wave 1 does **not** invent one. Full-history recovery must be orchestrated from proven bounded range commands only after the lower-bound/completeness strategy is validated against physical-device behavior.

## Command state and observability

Wave 1 exposes recent durable command state including:

- command number;
- command type and reason;
- allowlisted wire command;
- status;
- attempt count;
- requested range;
- expiry timestamp;
- delivery/acknowledgement/completion timestamps;
- return code and result command.

Pending commands may be cancelled. Delivered commands are not presented as safely cancellable because the device may already have received them.

All current Wave 1 commands are read-only/non-destructive (`LOG`, `INFO`, bounded ATTLOG range query), so bounded retry remains safe. ATTLOG retransmission remains safe because raw event identity is exact-deduplicated.

Commands have a TTL. Active commands whose TTL elapses transition to `expired`, retain their command history, and emit an immutable `expired` command event. Late device results for an already expired/cancelled command are quarantined instead of silently rewriting terminal history.

The active-command constraint allows only one pending/delivered/acknowledged command per device at a time. This prevents an INFO request, manual transfer and scheduled reconciliation from racing each other on the device polling channel.

## Periodic bounded reconciliation

A per-device reconciliation policy is implemented with:

- `reconciliation_enabled` — default `false`;
- `reconciliation_interval_minutes` — default 1440 minutes, configurable from 60 to 10080;
- `reconciliation_lookback_hours` — default 48 hours, configurable from 1 to 744;
- `reconciliation_last_requested_at` — last automatically queued window.

The scheduler runs opportunistically on an active device poll. It queues a reconciliation only when:

- reconciliation is explicitly enabled;
- the configured interval is due;
- no other active command exists for the device.

The automatic command is always a bounded `DATA QUERY ATTLOG` request. It never exceeds the 31-day safety boundary, receives a command TTL, and is disabled by default so merging software does not automatically increase device traffic before the physical canary/policy decision.

## Historical reconciliation semantics

A bounded range command has a reconciliation read model. The purpose is to show evidence that HCIS can actually prove, not to manufacture WDMS-style completeness claims from unavailable data.

For each recent manual or scheduled historical range command, the Admin API can show:

- current persisted raw-event count whose occurrence time falls inside the requested range;
- how many such persisted events were received at or after command delivery;
- first and last persisted occurrence in the range;
- the number of ATTLOG journal requests observed after delivery.

The response intentionally reports `expectedCount: null` when the physical device has not supplied an expected row count for that specific requested range. A general device `TransactionCount` obtained from INFO is not treated as an expected count for an arbitrary date range.

It also reports `duplicatesObserved: null` rather than pretending the immutable fact table can reconstruct every exact duplicate rejected at insertion time.

This is therefore labelled **persisted-range coverage**, not a proof that a physical device has no missing rows. Hardware validation remains necessary for transaction completeness claims.

## Safe operational logs

Wave 1 exposes an Admin Logs read model with recent:

- request metadata (method/path/classification/status/body size/capture status/safe metadata);
- command lifecycle events;
- quarantine summaries;
- immutable Admin audit events.

Raw request bodies are deliberately excluded from this Admin log endpoint. The durable request journal remains the underlying forensic source, but the routine UI does not casually expose raw ADMS payloads.

## Admin UI

`Admin HCIS > Mesin Fingerprint` now adds Wave 1 operational surfaces with:

- multi-device cards rather than relying only on the legacy dropdown;
- lifecycle and connectivity displayed separately;
- last activity, last successful sync, and effective timeout diagnostics;
- editable connectivity timeout override with adaptive fallback;
- safe observed transport telemetry;
- explicit `Read Information` command for active devices;
- safe INFO counters/firmware evidence after a successful result;
- sync-new transaction action;
- bounded historical range upload action;
- configurable periodic bounded reconciliation, default OFF;
- recent command state, expiry, and pending cancellation;
- persisted-range reconciliation summaries;
- recent immutable raw transactions with explicit effective PIN-to-employee mapping when available;
- safe request/command/quarantine/Admin logs;
- detected/untrusted device queue with explicit claim.

The existing PIN-mapping and detailed raw-attendance administration surface remains available below it.

## API contract

`docs/api/openapi.yaml` is the authoritative route contract and must remain synchronized with the Wave 1 surface for:

- detected-device discovery and claim;
- connectivity health and policy;
- safe transport/INFO telemetry;
- reconciliation policy;
- command listing, Read Information, expiry and pending cancellation;
- sync-new and bounded attendance-range transfers;
- recent raw transactions;
- persisted-range reconciliation;
- safe operational logs.

The contract continues to distinguish software implementation from production/hardware verification.

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

Wave 1 software heads are required to pass GitHub Actions clean migration, typecheck, lint, automated tests, build, and compose validation. Synthetic integration coverage includes default-disabled reconciliation, enabled bounded reconciliation scheduling, and INFO allowlist persistence.

Production deployment remains a human-approved cutover.

Hardware-dependent checks still required before Wave 1 is declared production-complete:

- fresh physical punch realtime canary — **PENDING CANARY**;
- physical `INFO` command/result against a target device;
- bounded `DATA QUERY ATTLOG` request against a physical target device;
- retransmission/dedup evidence from that bounded historical request;
- online/offline transition observation using real device polling cadence;
- validate a safe full-history orchestration strategy before offering “upload all” as a parity action.

Biometric vault, roster synchronization, remote enrollment, messages, firmware update, reboot, and destructive maintenance remain outside this Wave 1 implementation.
