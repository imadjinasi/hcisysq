# ATT-005 Physical Canary Evidence

**Status:** ACTIVE EVIDENCE LOG  
**Updated:** 2026-08-29  
**Device:** `SPK7245000707` — SDIT Tahfizh Sabilul Qur'an  
**Timezone:** `Asia/Jakarta`

This file records observed physical-device evidence separately from synthetic CI. It does not treat CI, protocol documentation, or a pre-upgrade production deployment as proof of the current Wave 1 implementation.

## Fresh realtime ATTLOG on currently deployed production — OBSERVED 2026-08-29

A production Super Admin screenshot from the fingerprint device page showed `SPK7245000707` continuing to communicate with HCIS and two fresh same-day raw events with near-realtime receipt:

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

Conclusion: the **currently deployed production application** is receiving and persisting fresh physical ATTLOG in near real time for this device.

### Deployment-version boundary

This observation must **not** be recorded as completion of the merged ATT-005 Wave 1 canary yet.

Current `main` renders `AdminAdmsWave1Operations` and `AdminAdmsWave1Details` before the registry/mapping panel. Those Wave 1 surfaces were not present in the production UI shown on 2026-08-29. Therefore the deployed production UI is behind current `main`, although the exact deployed commit has not yet been established from the VPS.

The two 2026-08-29 punches prove physical device -> deployed HCIS realtime transport for the older deployment only. They do not prove that the merged Wave 1 command/recovery/observability code has been deployed or exercised.

### Employee-projection boundary

This observation also does **not** verify employee attendance projection. The observed PINs were still unmapped in HCIS and the UI showed no mapping history. Do not infer or create employee identity from name, NIP, card, organizational unit, or any other field. Mapping remains explicit device PIN -> `employees.id` only.

## Required deployment gate before Wave 1 hardware canary

Before running INFO or bounded historical recovery against the current implementation:

1. human-approved production deployment must update HCIS to the approved current `main` Wave 1 build;
2. record the deployed Git commit from the VPS;
3. verify `/api/health` and `/api/ready`;
4. verify normal ADMS polling continues;
5. verify the Wave 1 Operations and Transactions/Reconciliation/Logs UI surfaces are present.

Do not queue INFO/range commands from an older production build merely to satisfy the current canary.

## Next physical gates after Wave 1 deployment

Run in this order on `SPK7245000707` after the deployment gate above:

1. **Fresh realtime ATTLOG canary on the deployed Wave 1 build.** Use one controlled new punch and verify near-realtime raw persistence/provenance. A pre-deploy punch cannot validate a post-deploy code path.
2. **INFO read-only canary** using the existing allowlisted `INFO` command. Confirm delivery, device ACK/result success, and safe model/firmware/count telemetry only.
3. **Bounded historical ATTLOG canary** with a small explicit time window using documented `DATA QUERY ATTLOG StartTime=... EndTime=...`.
4. **Repeat the exact same bounded window** and confirm immutable event identity/dedup means no duplicate persisted raw event rows are created.
5. Observe normal polling long enough to validate an honest online/offline transition if operationally practical.

Do not enable periodic reconciliation merely to complete these canaries.

## Wave 2 boundary

Command-capable Wave 2 roster/template/enrollment/distribution/delete/restore behavior remains hardware-gated until the current Wave 1 build is actually deployed and its fresh realtime, INFO, and bounded historical canaries are completed against that deployed build.
