# ADMS Destructive / Break-glass Runbook

`CLEAR LOG`, `CLEAR PHOTO`, and especially `CLEAR DATA` are last-phase physical parity operations. HCIS raw attendance history must remain preserved.

## Preconditions

- All lower-risk canaries are stable.
- Explicit SUPER_ADMIN approval exists for the exact target device and exact destructive capability.
- Target is primary canary `SPK7245000707` unless a later approved plan says otherwise.
- No concurrent physical operation is running.
- Device-side data targeted for deletion is documented before the operation.
- HCIS ingestion/database backup and raw-fact retention are verified.

## Procedure

1. Record safe before-state evidence and the expected typed confirmation phrase.
2. Queue one `mode=canary` destructive operation from the separate Danger Zone.
3. Record operation ID, command type, return code and device reconnect/health evidence.
4. Verify HCIS raw attendance history was not deleted or rewritten.
5. Verify subsequent ATTLOG ingestion still works when applicable.
6. Save final evidence and only then transition capability to verified.

## CLEAR DATA additional rule

`CLEAR DATA` is never used as a convenience reset. It is performed only as the final approved break-glass canary when the hardware state can be safely rebuilt. If the accepted product contract explicitly excludes destructive all-data reset, record `excluded_by_product_contract` in the parity ledger instead of executing it.

Never run destructive operations from CI, deploy, or `verify-vps.sh`.
