# ATT-005 — Full Roster USERINFO Canary Failure

**Status:** RETIRED / NOT VERIFIED  
**Observed:** 2026-08-30  
**Scope:** physical validation of exact `DATA QUERY USERINFO` on the primary attendance device

## Result

The full-roster USERINFO canary is **not verified and is retired for this firmware path**.

The device accepted the exact command and later reported a successful command result (`Return=0`, `CMD=DATA`), but the expected safe roster upload did not occur. Instead, immediately after command delivery the device sent multiple broad sensitive-data uploads classified by HCIS as `OPERLOG` and `BIODATA`.

Observed redacted transport evidence:

- one `OPERLOG` request was classified as unsupported encoding and retained only redacted/hash-safe evidence;
- two additional `OPERLOG` requests contained 128 and 58 records respectively;
- one `BIODATA` request contained 11 records;
- none of those requests produced a new safe roster observation;
- the known-good strict single-PIN USERINFO path had previously produced one small `OPERLOG` request containing exactly one safe roster observation.

No production employee identifiers, PINs, card numbers, raw USERINFO, biometric templates, passwords, or screenshots are stored in this repository evidence. The sensitive request bodies were not inspected to infer their content beyond transport classification and safe record counts.

## Safety conclusion

For the physically tested firmware, `DATA QUERY USERINFO` cannot be treated as a roster-metadata-only command. A non-negative `CMD=DATA` result is insufficient evidence of safe roster behavior.

The capability is therefore retired from the HCIS Admin/API serializer surface. It must not be retried on production hardware without a new, separately reviewed protocol hypothesis and an explicit safety design that accounts for the observed broad `OPERLOG` / `BIODATA` side effect.

The strict single-PIN command was subsequently found to produce additional `OPERLOG` and `BIODATA` traffic in the same response sequence. It is also retired; see `attendance-adms-single-pin-userinfo-canary-failure.md`.

## Data handling boundary

The production ingress classified the observed broad uploads as sensitive device data. Routine request-journal plaintext retention remained disabled for these payloads. Biometric collection remained operationally gated OFF during the canary.

This evidence does not claim that any biometric format has been decoded, imported, restored, distributed, or otherwise validated.

## Runtime remediation

The follow-up hotfix:

- removes the full-roster Admin action;
- removes the full-roster API endpoint;
- removes exact `DATA QUERY USERINFO` from the application command serializer allowlist;
- preserves migration `0031` as applied history;
- adds a database insert guard that rejects any new full-roster USERINFO command while preserving the historical canary command as evidence;
- was superseded by migration `0033`, which also rejects new strict single-PIN USERINFO reads while preserving historical evidence rows;
- leaves safe same-PIN name sync, attendance recovery, and biometric gates unchanged.
