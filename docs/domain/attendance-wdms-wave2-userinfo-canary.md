# ATT-005 Wave 2 — Single-PIN USERINFO Canary

## Purpose

Open the first command-capable Wave 2 read path only after the Wave 1 production hardware gates are physically verified.

This slice is intentionally limited to querying **one already-observed numeric device PIN** at a time. It is not a full roster dump and it does not query biometric templates.

## Wire capability

Allow exactly:

```text
DATA QUERY USERINFO PIN=<digits>
```

The HCIS command transport wraps it in the existing numeric command envelope:

```text
C:<command-number>:DATA QUERY USERINFO PIN=<digits>
```

PIN is treated as a string so leading zeros remain significant. For this canary slice, accepted PIN syntax is 1–128 ASCII digits only. Arbitrary command text is forbidden.

The expected device command result is `CMD=DATA` associated with the queued numeric command ID and a non-negative return code. A terminal command success proves only that the device accepted/executed the request; it does **not** prove that user information was uploaded.

## Returned data boundary

The device may upload user information through `/iclock/cdata`, normally with table `USERINFO` on supported PUSH firmware. Existing ingress rules remain mandatory:

- the ordinary request journal body is redacted for USERINFO/non-ATTLOG device data;
- only the safe roster projection may persist fields such as PIN, display name, card number, privilege, verify mode, safe group/timezone metadata, source request ID, and observed timestamps;
- password, template data, biometric payloads, and unknown vendor fields are discarded from the safe projection;
- leading-zero PIN values must be preserved exactly;
- no employee identity may be inferred from name, card, NIP, organizational unit, or any external identifier.

## Queueing and authorization

Only `SUPER_ADMIN` may queue the command.

Preconditions:

1. the target device exists;
2. device lifecycle is `active`;
3. the exact PIN has already been observed for that device in immutable ATTLOG facts or the safe observed roster;
4. no other command for that device is currently `pending`, `delivered`, or `acknowledged`;
5. PIN passes the digits-only boundary;
6. the command is explicitly audited as `command_requested`.

The observed-PIN requirement prevents this canary endpoint from becoming an arbitrary PIN-enumeration surface. It still does not infer or require an employee identity.

The command is manually queued only. There is no periodic or automatic USERINFO query.

## Canary success criteria

For one known observed PIN, physical canary is complete only when **both** are true:

1. the queued USERINFO command reaches terminal `succeeded` with `CMD=DATA` and a non-negative return code for the same numeric command ID; and
2. a safe roster entry for the requested PIN is observed from a new redacted request after command delivery, with a new `sourceRequestId` / `lastSeenAt` proving data upload.

Command success without a new safe roster observation is **not** sufficient.

## Explicitly out of scope

Until this single-PIN path is physically verified on the target firmware, do not add or enable:

- full `DATA QUERY USERINFO` roster dump;
- fingerprint/face/template query;
- user update/create;
- user delete;
- biometric distribution;
- enrollment;
- device restore or destructive cleanup.

After the single-PIN canary succeeds, full roster query may be considered as a separate bounded capability and must preserve the existing `observed_only` semantics until a complete snapshot is physically proven.
