# ATT-005 Wave 2 — USERINFO Read Retirement

**Status:** RETIRED / NOT SAFE AS METADATA-ONLY
**Updated:** 2026-08-31

## Decision

HCIS exposes no active USERINFO read capability.

Both of these wire commands are retired:

```text
DATA QUERY USERINFO
DATA QUERY USERINFO PIN=<digits>
```

They must not be queued through an HTTP route, client helper, Admin UI, serializer, scheduled job, or direct database insert. No alternate roster dump, raw command endpoint, or serialized per-PIN refresh is approved.

## Physical evidence basis

The full-roster command was previously retired after broad sensitive uploads occurred without the expected safe roster result. A later strict single-PIN canary completed functionally with `Return=0`, `CMD=DATA`, and one fresh safe roster observation, but the same response sequence also produced additional `OPERLOG` and `BIODATA` requests.

The sensitive bodies were not inspected. The biometric-vault credential delta was `0`, and biometric collection remained OFF. The redacted evidence record is `docs/development/attendance-adms-single-pin-userinfo-canary-failure.md`.

Functional command success therefore does not establish metadata-only safety on this firmware.

## Preserved boundaries

- Historical USERINFO commands, command events, audit records, and redacted transport evidence remain immutable evidence.
- Passive/safely observed USERINFO projection may still update the observed-only roster when the device sends it naturally; HCIS does not actively request it.
- Existing explicit mapping history and attendance projection behavior are unchanged.
- Same-PIN `DATA UPDATE USERINFO PIN=<same PIN>\tName=...` remains the only approved USERINFO write shape.
- `LOG`, `INFO`, and bounded `DATA QUERY ATTLOG StartTime=...\tEndTime=...` remain available.
- `BIOMETRIC_COLLECTION_ENABLED=0` remains mandatory.

## Name-sync verification

A non-negative name-update command result proves command execution only. Immediate active USERINFO readback is retired. Future verification requires passive/safely observed evidence or a separately reviewed and approved protocol capability. This decision does not authorize a new active readback command.
