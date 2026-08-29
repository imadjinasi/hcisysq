# ATT-005 Physical Canary Evidence

**Status:** ACTIVE EVIDENCE LOG  
**Updated:** 2026-08-29  
**Device:** `SPK7245000707` — SDIT Tahfizh Sabilul Qur'an  
**Timezone:** `Asia/Jakarta`

This file records observed physical-device evidence separately from synthetic CI. It does not treat CI or protocol documentation as proof of hardware behavior.

## Fresh realtime ATTLOG — VERIFIED 2026-08-29

A production Super Admin screenshot from the fingerprint device page showed the trusted active device `SPK7245000707` continuing to poll HCIS and two fresh same-day raw events with near-realtime receipt:

| Device punch time (Asia/Jakarta) | HCIS received time (Asia/Jakarta) | Observed latency | PIN |
| --- | --- | ---: | --- |
| 2026-08-29 07:55:07 | 2026-08-29 07:55:16 | 9 s | `109041327` |
| 2026-08-29 06:19:26 | 2026-08-29 06:19:35 | 9 s | `205291319` |

The same UI showed:

- device lifecycle `active`;
- `Last seen` and `Last successful request` at 2026-08-29 08:30:24 Asia/Jakarta;
- last IP `182.253.124.5`;
- no current quarantine for this device;
- older 2026-08-28 raw events received together at 21:51:45, providing a visible contrast with the two fresh 9-second-latency events.

Conclusion: the physical realtime device -> HCIS ATTLOG transport and raw-event persistence path is verified for this device on 2026-08-29.

### Boundary of this evidence

This evidence does **not** verify employee attendance projection. The observed PINs were still unmapped in HCIS and the UI showed no mapping history. Do not infer or create employee identity from name, NIP, card, organizational unit, or any other field. Mapping remains explicit device PIN -> `employees.id` only.

This evidence also does not by itself prove INFO, bounded historical range, duplicate retransmission handling, roster/template query, biometric collection, enrollment, distribution, deletion, or restore behavior.

## Next physical gates

Run in this order on `SPK7245000707`:

1. **INFO read-only canary** using the existing allowlisted `INFO` command. Confirm delivery, device ACK/result success, and safe model/firmware/count telemetry only.
2. **Bounded historical ATTLOG canary** with a small explicit time window using documented `DATA QUERY ATTLOG StartTime=... EndTime=...`.
3. **Repeat the exact same bounded window** and confirm immutable event identity/dedup means no duplicate persisted raw event rows are created.
4. Observe normal polling long enough to validate an honest online/offline transition if operationally practical.

Do not enable periodic reconciliation merely to complete these canaries.

## Wave 2 boundary

Command-capable Wave 2 roster/template/enrollment/distribution/delete/restore behavior remains hardware-gated until the Wave 1 INFO and bounded historical canaries above are completed and the exact firmware behavior is observed.
