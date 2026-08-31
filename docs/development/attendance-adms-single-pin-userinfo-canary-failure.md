# ATT-005 — Single-PIN USERINFO Canary Safety Failure

**Status:** RETIRED / NOT SAFE AS METADATA-ONLY
**Observed:** 2026-08-31
**Scope:** redacted physical validation of strict `DATA QUERY USERINFO PIN=<digits>`

## Observed result

The strict single-PIN USERINFO functional readback completed successfully on the tested firmware. The device returned non-negative command result `0` with `CMD=DATA`, and HCIS received one fresh safe roster observation for the requested already-observed PIN.

The same command response sequence also produced additional sensitive device requests:

- one `OPERLOG` request of approximately 3 KB;
- one `BIODATA` request of approximately 844 B.

The request bodies were not read or inspected. No biometric material was decoded. The HCIS biometric-vault credential delta remained `0`, and `BIOMETRIC_COLLECTION_ENABLED` remained OFF.

This record intentionally excludes the production employee name, device PIN, card number, screenshots, raw OPERLOG/BIODATA bodies, biometric payloads, and secrets.

## Safety conclusion

Functional success is not sufficient to classify this command as a metadata-only read. On the physically tested firmware, strict single-PIN USERINFO readback can trigger additional `OPERLOG` and `BIODATA` traffic in the same response sequence.

Therefore:

- all active USERINFO reads are **RETIRED / NOT SAFE AS METADATA-ONLY**;
- both exact `DATA QUERY USERINFO` and `DATA QUERY USERINFO PIN=<digits>` are unavailable from the API, serializer, database insert boundary, and Admin UI;
- no serialized per-PIN refresh is approved;
- historical command and redacted evidence rows remain preserved;
- future name-sync verification requires passive/safely observed evidence or a separately reviewed and approved protocol capability. HCIS does not invent an alternate active readback command.

This conclusion does not change ATTLOG, INFO, same-PIN name-only update, mapping history, attendance projection, or biometric collection policy.
