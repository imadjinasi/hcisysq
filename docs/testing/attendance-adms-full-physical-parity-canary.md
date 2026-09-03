# ATT-005 Full Physical Parity Canary Runbook

Use only after PR merge, one production deploy, and `scripts/verify-vps.sh <FINAL_MAIN_SHA>` PASS.

Primary canary: `SPK7245000707`. Do not start experiments on `SPK7245000738`.

## Global rules

1. One capability per step and one running canary per capability/device.
2. Record operation ID, capability, command type, device return code, before/after safe state, unexpected side traffic, and final capability state.
3. Never use active USERINFO reads. Never use arbitrary commands.
4. Keep `BIOMETRIC_COLLECTION_ENABLED=0` until the separately approved biometric phase.
5. Stop on unexplained OPERLOG/BIODATA traffic, ingress loss, repeated negative return codes, or device instability.
6. A firmware/hardware limitation is a valid closure only after evidence is saved as `verified_unsupported`; do not invent a wire command.

## Order

1. Passive heartbeat/registration/PUSH profile evidence.
2. Active time sync.
3. Duplicate-punch setting with known before value, canary change, then restore.
4. Work Code upsert then delete.
5. Public message upsert then delete.
6. Private message to one explicitly mapped approved employee.
7. User profile push.
8. User disable, prove local biometric remains, then enable.
9. Reboot and prove reconnect + ATTLOG resume.
10. NTP and ADMS server safe/reversible writes; server canary must retain production ingress.
11. Firmware only with model/package compatibility evidence.
12. Attendance photo.
13. Biometric query/enrollment/backup/restore/distribution/delete under the biometric runbook.
14. Destructive clear operations last under the break-glass runbook.

## Evidence transition

For a successful physical check: `documented -> canary_pending -> verified`.
For a proven firmware/hardware limitation: `documented -> canary_pending -> unsupported` and record the physical return/behavior evidence.
For a safety/product blocker: record `blocked` and evidence; ATT-005 closure still requires an explicit final contract outcome.

Do not mark ATT-005 DONE merely because repository CI, deploy, verifier, or passive UAT passes.
