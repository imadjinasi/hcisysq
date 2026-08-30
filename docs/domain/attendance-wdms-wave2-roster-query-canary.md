# ATT-005 Wave 2 — Full Roster Read Canary

**Status:** IMPLEMENTATION  
**Specification:** ATT-005  
**Updated:** 2026-08-30

## Purpose

Open the next read-only Wave 2 capability after the strict single-PIN USERINFO path and safe same-PIN name synchronization have been physically verified.

This slice allows a SUPER_ADMIN to ask one selected active fingerprint device to upload its USERINFO roster using an exact allowlisted command. It is a controlled hardware canary, not an automatic synchronization job and not approval for device-side user creation, deletion, PIN mutation, or biometric operations.

## Preconditions already satisfied

The primary hardware path has evidence for:

- Wave 1 realtime ATTLOG and bounded historical recovery;
- command delivery/result handling;
- sensitive USERINFO ingress redaction;
- strict single-PIN USERINFO command plus new safe roster observation;
- same-PIN name update followed by strict USERINFO read-back;
- exact PIN preservation and safe metadata projection.

No production biometric collection is required for this capability.

## Wire capability

Allow exactly:

```text
DATA QUERY USERINFO
```

The existing command transport wraps the command using the numeric device command envelope.

No query parameters, PIN selector, template table, arbitrary command text, or vendor option may be supplied through this endpoint.

The application reuses the existing durable `query_user_info` command type and `admin_query_user_info` reason. A forward-only additive migration expands only the database wire/shape CHECK constraints so the exact no-parameter roster query is accepted in addition to the already-supported single-PIN form. It does not create a new table, rewrite attendance data, or broaden arbitrary command execution.

## Authorization and queueing

Only `SUPER_ADMIN` may queue the command.

Required server-side preconditions:

1. target device exists;
2. lifecycle is `active`;
3. at least one safe USERINFO roster observation already exists for that device, proving the redacted projection path has been exercised;
4. no other command for that device is `pending`, `delivered`, or `acknowledged`;
5. command request is written to durable command events and Admin audit;
6. the request is manual only; there is no polling/cron/automatic roster dump.

## Returned-data boundary

Existing sensitive-ingress rules remain unchanged:

- routine USERINFO request bodies remain redacted from `attendance_adms_request_journal`;
- safe projection may persist exact PIN, display name, card number, privilege, verify mode, allowlisted safe metadata, source request ID and observation timestamps;
- password, biometric template material and unknown vendor fields are discarded from the safe roster projection;
- leading-zero PINs remain strings;
- no employee identity is inferred from name, card, employee number, unit, or external identifiers;
- mapping remains explicit device PIN -> `employees.id`.

## Snapshot semantics

This canary does **not** change the roster API to a complete snapshot.

Until physical evidence proves the firmware response boundary and completeness semantics, the roster response remains:

- `inventorySemantics: observed_only`;
- `completeSnapshot: false`.

Absence of a PIN after a roster query must not be interpreted as user deletion or missing-device state.

For canary verification, HCIS may count safe roster observations whose `lastSeenAt` / `sourceRequestId` are new after command delivery, but that count is evidence of upload only, not proof that every user was returned.

## Canary success criteria

The first physical canary is successful only when:

1. queued command is exactly `DATA QUERY USERINFO`;
2. command reaches terminal `succeeded` with non-negative return code and `CMD=DATA`;
3. after command delivery, HCIS receives one or more new redacted USERINFO requests that produce safe roster observations;
4. no USERINFO plaintext/password is retained in the routine request journal;
5. no biometric credential is created merely because the roster command ran;
6. the Admin roster still reports `observed_only` / `completeSnapshot: false`.

A command success without new safe roster observations does not verify the capability.

## UI placement

The canary action belongs only in the selected device's `Diagnostik teknis` route while hardware completeness remains unproven.

The ordinary `Pengguna` route may show the resulting safe observations but must not present this as a completed authoritative roster sync.

## Explicitly out of scope

- automatic or scheduled roster query;
- bulk mapping;
- inferred mapping;
- device-side user create/update beyond the separately verified same-PIN name-only action;
- PIN migration;
- user deletion;
- fingerprint/face/palm template query;
- biometric collection enablement;
- enrollment, distribution, restore, or destructive maintenance.

## Migration and rollback

Migration `0031_attendance_adms_full_roster_query.sql` changes only the existing command wire/shape CHECK constraints. Existing rows remain valid and no attendance fact or roster observation is rewritten.

Operational rollback is to remove/disable the roster-query endpoint and diagnostics action. Retaining the expanded database CHECK after an application rollback is safe because command creation remains application allowlist-gated. Restoring the older CHECK shape is optional and must only be done after confirming no persisted full-roster command row would violate it.

Existing safe roster observations remain observational evidence and must not be deleted as part of rollback.
