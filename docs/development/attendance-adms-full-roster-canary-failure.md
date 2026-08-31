# ATT-005 — Full Roster USERINFO Canary Failure

**Status:** RETIRED / NOT VERIFIED  
**Observed:** 2026-08-30  
**Hotfix deployed:** 2026-08-31 (Asia/Jakarta)  
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

Hotfix merge `e8f9e50ccabb270a993971101d48a785aa31dcf2`:

- removes the full-roster Admin action;
- removes the full-roster API endpoint;
- removes exact `DATA QUERY USERINFO` from the application command serializer allowlist;
- preserves migration `0031` as applied history;
- adds migration `0032_attendance_adms_retire_full_roster_query.sql` with a database insert guard rejecting any new command whose wire command is exactly `DATA QUERY USERINFO`;
- preserves the historical failed canary command as immutable evidence.

Migration `0033_attendance_adms_retire_all_userinfo_reads.sql` supersedes the narrower database guard by also rejecting new strict single-PIN USERINFO reads while preserving historical evidence rows. Safe same-PIN name sync, attendance recovery, and biometric gates remain unchanged.

## Production hotfix verification

**Status:** VERIFIED DEPLOYED  
**Verified:** 2026-08-31 (Asia/Jakarta)

Operator-provided production verification confirmed:

- API recreation applied `0032_attendance_adms_retire_full_roster_query.sql`;
- API returned healthy after restart;
- web health, API health, and API readiness all returned successful responses;
- PostgreSQL was not restarted;
- database trigger `attendance_adms_reject_retired_full_roster_query` exists on `attendance_adms_commands` before insert;
- provenance-only verification found zero biometric credentials linked to request-journal rows in the failed canary time window.

The credential verification used only row counts and request provenance. No biometric payload, ciphertext, hash, PIN, employee identity, card number, or other sensitive value was read for that check.

Conclusion: the unsafe full-roster command surface was removed from the deployed application and hard-blocked for future inserts at the database boundary. The later single-PIN safety failure extends the retirement decision to all active USERINFO reads; production deployment of migration `0033` is tracked separately and must not be inferred from this `0032` verification record.
