# ATT-005 Full WDMS Physical Parity Ledger

Status ATT-005: **IMPLEMENTING**.

Closure rule: every accepted row must end as `verified`, `verified_unsupported`, or `excluded_by_product_contract`. Repository implementation alone never changes a physical row to `verified`. No row with `not_verified` may remain when ATT-005 is closed.

Primary canary device: `SPK7245000707`. Second device `SPK7245000738` is not used for first experiments.

| Capability | Repository contract | Physical outcome now | Closure evidence required |
|---|---|---|---|
| Passive registration / last-seen | ingress journal + device timestamps + WDMS evidence API/UI | not_verified | observed registration/last-seen on primary canary |
| Heartbeat / getrequest | passive journal evidence | not_verified | repeated primary-device heartbeat evidence |
| Push protocol metadata | safe `pushver`/`PushVersion` metadata + desired profile | not_verified | actual firmware value or evidence firmware omits it |
| PUSH attendance-only profile | base `TransData + AttLog`; biometric/photo flags gated | not_verified | verify idle production handshake remains attendance-only |
| Active time sync | typed canary operation | blocked | Production attempt failed transactionally before command delivery because the applied wire-command constraint used PostgreSQL-invalid `{1,500}`; deploy migration 0044, rerun the single-device canary, and capture operation/result plus before/after device time. No physical PASS or return code is recorded. |
| Duplicate-punch period | typed SET OPTION + reload | not_verified | apply safe value, verify, restore original |
| Work Code upsert/delete | typed delivery + target state | not_verified | upsert then delete on primary device |
| Public message | typed SMS delivery/delete | not_verified | visible message + removal evidence |
| Private message assignment | typed SMS + explicit mapped PIN | not_verified | approved PIN receives only assigned message |
| User profile push | explicit employee.id -> effective PIN | not_verified | profile appears with leading-zero PIN preserved if applicable |
| User disable/enable | expiration/authorization only; no user delete | not_verified | disable, prove biometric survives, enable again |
| Reboot | typed reboot | not_verified | device reconnects and ATTLOG resumes |
| NTP configuration | typed NTP option | not_verified | reversible safe value evidence |
| ADMS server config | typed host/port; canary must preserve production ingress | not_verified | safe same-ingress rewrite + continued ingress |
| Firmware package/upgrade | model-bound explicit target + short-lived ticket | not_verified | compatible package canary or `verified_unsupported` with evidence |
| Attendance photo | encrypted ingress + gated handshake flag | not_verified | encrypted upload canary or supported-firmware negative evidence |
| Fingerprint template query | typed legacy query behind biometric gate | not_verified | approved single-PIN query and encrypted vault evidence |
| Unified BIODATA query | typed unified query behind biometric gate | not_verified | approved single-PIN query or unsupported evidence |
| Remote fingerprint enrollment | typed enrollment | not_verified | one approved employee/PIN canary |
| Unified biometric enrollment | typed enrollment | not_verified | one approved employee/PIN canary or unsupported evidence |
| Encrypted biometric backup | ingress encrypts before persistence | not_verified | credential created without routine plaintext exposure |
| Biometric restore same device | vault decrypt only at device polling | not_verified | same-device restore + match validation |
| Biometric distribution | explicit target device | not_verified | approved second-device distribution after primary workflow succeeds |
| Fingerprint delete | typed selected delete | not_verified | selected template removed, identity/master credential preserved |
| Legacy face delete | typed selected delete | not_verified | selected face removed or `verified_unsupported` |
| Unified BIODATA delete | typed selected delete | not_verified | selected credential removed or `verified_unsupported` |
| Clear attendance log | break-glass typed destructive operation | not_verified | last-phase canary with HCIS raw history preserved |
| Clear photo/cache | break-glass typed destructive operation | not_verified | last-phase canary with evidence |
| Clear all device data | highest-risk break-glass operation | not_verified | explicitly approved final canary or product-contract exclusion |
| Device inventory export | safe CSV | repository_ready | UAT export opens and excludes secrets |
| Mapping/user export | explicit/effective-dated CSV | repository_ready | UAT leading-zero PIN retained |
| Work Code delivery export | safe CSV | repository_ready | UAT target/delivery state |
| Physical operation history/export | safe metadata + return codes; no wire secrets | repository_ready | UAT export/history |
| Physical audit export | physical request/state/profile audit only | repository_ready | UAT export |
| Raw attendance export | raw facts only, no attendance policy inference | repository_ready | UAT sample reconciliation |
| Arbitrary/raw command | intentionally absent | excluded_by_product_contract | static/runtime guard remains absent |
| Active USERINFO reads | permanently retired after unsafe physical evidence | excluded_by_product_contract | DB trigger remains exactly one; UI/action absent |

## Invariants

- `BIOMETRIC_COLLECTION_ENABLED=0` on initial production deployment.
- No per-device biometric collection gate is enabled by deploy/verify.
- No biometric canary without explicit user approval, configured keyring, primary canary-only gate, and one approved employee/PIN.
- No raw biometric template, ciphertext, hash, IV, auth tag, key ID, or reusable firmware token in routine API/UI/logs.
- No `DATA DELETE user`.
- No identity inference from name, NIP, unit, card, or external ID.
- Attendance remains raw/policy-neutral.
- `scripts/verify-vps.sh` must finish with `verification_device_commands_requested=0`.

This ledger intentionally retains physical rows as `not_verified` until production deployment and one-capability-at-a-time hardware canaries are actually completed. Therefore ATT-005 is not DONE at repository merge time.
