# ATT-005 Physical Canary Evidence

**Status:** ACTIVE EVIDENCE LOG  
**Updated:** 2026-08-29  
**Device:** `SPK7245000707` — SDIT Tahfizh Sabilul Qur'an  
**Timezone:** `Asia/Jakarta`

This file records observed physical-device evidence separately from synthetic CI. It does not treat CI, protocol documentation, or a pre-upgrade production deployment as proof of the current Wave 1 implementation.

## Pre-upgrade realtime ATTLOG — OBSERVED 2026-08-29

Before the Wave 1 production deployment, a production Super Admin screenshot showed `SPK7245000707` continuing to communicate with HCIS and two same-day raw events with near-realtime receipt:

| Device punch time (Asia/Jakarta) | HCIS received time (Asia/Jakarta) | Observed latency | PIN |
| --- | --- | ---: | --- |
| 2026-08-29 07:55:07 | 2026-08-29 07:55:16 | 9 s | `109041327` |
| 2026-08-29 06:19:26 | 2026-08-29 06:19:35 | 9 s | `205291319` |

The older production UI did not yet expose the merged Wave 1 operations/details surfaces, so these punches remain evidence for the older deployed path only. They must not be used to close the post-deploy Wave 1 realtime canary.

The observed PINs were also unmapped in HCIS. Employee attendance projection remains unverified and employee identity must not be inferred from name, NIP, card, organizational unit, or any other field. Mapping remains explicit device PIN -> `employees.id` only.

## Wave 1 production deployment gate — VERIFIED 2026-08-29

The approved current `main` Wave 1 build was deployed to production and the operator recorded exact Git head:

```text
1e061cd88daa0686bd487f4813cd17d483ff8cd2
```

Post-deploy evidence:

- PostgreSQL healthy;
- API healthy;
- web healthy;
- `GET /api/health` returned HTTP 200 `{"status":"ok"}`;
- `GET /api/ready` returned HTTP 200 `{"status":"ready"}`;
- Wave 1 `Transactions, Reconciliation & Logs` UI is visible in production;
- device lifecycle is `active`;
- connectivity is `online`;
- observed median request interval is approximately 1 second;
- last public IP remains `182.253.124.5`;
- periodic bounded reconciliation remains OFF.

Conclusion: the deployment-version gate for Wave 1 is complete.

## INFO read-only physical result — VERIFIED 2026-08-29

After the Wave 1 deployment, production safe telemetry showed a new INFO observation at approximately 2026-08-29 09:03:20 Asia/Jakarta (`2026-08-29T02:03:20.875Z`) with device-returned values including:

- `FWVersion = ZMM510-NF28VA-Ver2.0.16`;
- `MAC = 00:17:61:10:0d:4d`;
- `IPAddress = 192.168.18.221`;
- `FPCount = 186`;
- `FaceCount = 11`;
- `UserCount = 106`;
- `TransactionCount = 3422`.

The Wave 1 repository only updates `metadata.infoObserved` from a parsed device command result whose command is exactly `INFO`, whose return code is non-negative, and whose safe option set is non-empty. Device command results are first associated with a known command number for the same trusted device. Therefore this production observation is sufficient evidence that the physical device returned a successful INFO result to the deployed Wave 1 application.

No raw template or other biometric payload is exposed by this INFO surface.

## Fresh post-deploy realtime ATTLOG — PENDING NATURAL PUNCH

A new post-deploy fingerprint punch has not yet been observed. The machine is in normal operational use and a test punch will not be forced solely for canary completion.

When the next natural punch occurs, verify:

1. device punch time and HCIS `receivedAt` are near real time;
2. source is normal ATTLOG ingress, not historical recovery;
3. raw event persists once with immutable provenance;
4. no quarantine is introduced;
5. no late/absence/overtime/work-hours/payroll/leave/resolution inference is created.

Employee projection remains a separate boundary and requires a correct explicit device PIN mapping.

## Next physical gates that do not require a new punch

A small historical range can be tested without waiting for the next natural punch. Use a narrow range that contains a known pre-deploy event so retransmission/dedup can be observed without creating synthetic attendance.

Recommended canary window on `SPK7245000707`:

```text
Start: 2026-08-29 06:15:00 Asia/Jakarta
End:   2026-08-29 06:25:00 Asia/Jakarta
```

This window contains the previously observed `205291319` punch at 06:19:26.

Run:

1. one bounded `DATA QUERY ATTLOG StartTime=... EndTime=...` request for that exact window;
2. wait for the command to reach terminal success and confirm an ATTLOG request is observed;
3. confirm the persisted raw-event count for the window does not grow beyond the already-known event identity merely because the device retransmitted it;
4. repeat the **identical** window once;
5. confirm persisted raw events remain deduplicated after the second retransmission.

Do not enable periodic reconciliation and do not use an invented “upload all” command for this canary.

## Remaining Wave 1 hardware status

- production deployment/version gate: **VERIFIED**;
- INFO physical result: **VERIFIED**;
- fresh realtime ATTLOG on the deployed Wave 1 build: **PENDING NATURAL PUNCH**;
- bounded historical ATTLOG: **PENDING**;
- identical-range dedupe/retransmission: **PENDING**;
- online/offline transition: observational follow-up when operationally practical.

## Wave 2 boundary

Command-capable Wave 2 roster/template/enrollment/distribution/delete/restore behavior remains hardware-gated until bounded historical recovery/dedup is physically verified and a new post-deploy realtime punch is observed. The lack of an immediate natural punch does not require forcing a fingerprint event or blocking safe read/recovery canaries.