# Foundation Board Dashboard

**Status:** ACTIVE IMPLEMENTATION BASELINE  
**Specification:** ORG-003  
**Related:** ORG-001, ORG-002, EMP-005, LEAVE-007

## Purpose

`/board` is a governance-level dashboard for the Yayasan organ principal. It is not an employee self-service page and it is not the Super Admin configuration area.

The dashboard answers organization-level questions without exposing unnecessary employee-level personal data.

## Initial information set

The initial board dashboard contains live aggregate data for:

- active, inactive, and resigned employee counts;
- active headcount by organizational unit;
- education versus non-education leave-entitlement classification coverage;
- employment-status distribution;
- organization approval-readiness signals:
  - active employees with/without direct manager;
  - active units with/without current Unit Approver;
- leave workflow activity:
  - requests currently in review;
  - HC validations waiting;
  - attendance-resolution cases still open;
- current-year employee starts and recorded exits.

## Privacy boundary

The dashboard does not expose employee names, NIP, email, phone, dates of birth, identity numbers, or uploaded evidence.

Named employee drill-down is out of scope for the initial Board dashboard unless a later permission decision explicitly authorizes it.

## Data freshness

All displayed aggregates are calculated from the current HCIS database at request time. The UI must not present mock or cached placeholder metrics as production values.

## Attendance and payroll

Attendance and payroll aggregates are not shown until their authoritative modules are connected. The dashboard may display an explicit `Belum terhubung` state, but must not fabricate attendance percentages, payroll totals, or salary trends.

## UX principles

- show 4-6 key indicators before detailed distributions;
- use plain governance language rather than database terminology;
- highlight configuration gaps as `Perlu perhatian`, not as system errors;
- show unit distribution as a compact ranked list rather than an employee table;
- mobile layout remains readable without horizontal scrolling.

## Acceptance criteria

- ORG-003-A: `/board` requires an authenticated `FOUNDATION_BOARD` principal.
- ORG-003-B: all metrics are aggregate and live from the HCIS database.
- ORG-003-C: initial board dashboard exposes no employee-level PII or evidence.
- ORG-003-D: approval readiness reports direct-manager and Unit Approver coverage without inferring hierarchy from titles.
- ORG-003-E: leave workflow indicators show current in-review, HC-validation, and unresolved attendance-resolution workload.
- ORG-003-F: attendance/payroll metrics remain explicitly unavailable until authoritative modules exist.
