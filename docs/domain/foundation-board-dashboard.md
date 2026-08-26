# Foundation Board Dashboard

**Status:** VERIFIED MVP BASELINE  
**Specification:** ORG-003  
**Related:** ORG-001, ORG-002, EMP-005, LEAVE-007

## Purpose

`/board` is a governance-level dashboard for the Yayasan organ principal. It is not an employee self-service page and it is not the Super Admin configuration area. `/board/approvals` is the separate narrow action surface for governance Leave steps assigned to the exact logged-in account.

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

The dashboard does not expose employee names, NIP, email, phone, dates of birth, identity numbers, uploaded evidence, or personal payslip lines.

Named employee drill-down is out of scope for the initial Board dashboard unless a later permission decision explicitly authorizes it.

## Data freshness

All displayed aggregates are calculated from the current HCIS database at request time. The UI must not present mock or cached placeholder metrics as production values.

## Attendance and payroll boundary

ATT-001 factual attendance and PAYSLIP-001 imported employee payslips exist in the verified MVP, but that does **not** authorize the Board dashboard to infer attendance percentages, payroll totals, salary trends, deductions, overtime, or other financial/disciplinary metrics.

Board attendance/payroll aggregates remain unavailable until a later specification defines the authoritative aggregate semantics and permission boundary. The dashboard may display an explicit `Belum terhubung`/unavailable state for those metrics, but must not fabricate them from raw attendance or imported payslip lines.

## UX principles

- show 4-6 key indicators before detailed distributions;
- use plain governance language rather than database terminology;
- highlight configuration gaps as `Perlu perhatian`, not as system errors;
- show unit distribution as a compact ranked list rather than an employee table;
- mobile layout remains readable without horizontal scrolling.

## Governance Leave approval

An account with the explicit `leave.governance.approve` capability may open `/board/approvals` and decide only a pending Leave approval step whose snapshotted `approver_account_id` equals that account ID.

The page:

- does not call Employee self-service summary endpoints;
- shows requester, Leave type, dates, working days, reason, and the Indonesian business source label;
- labels `GOVERNANCE_APPROVER` as `Penyetuju Pengurus Yayasan`;
- uses the same immutable exact-principal decision endpoint as Employee approvals;
- returns a clean empty state when the account has no pending step;
- links back to Dashboard Organ Yayasan.

All aggregate dashboard content remains read-only. This explicit approval action does not authorize another Board account to view or decide the assigned step.

## Verification

Real browser UAT verified:

- `/board` loads live aggregate data for a `FOUNDATION_BOARD` principal;
- no personal employee detail/payslip data is exposed in the tested surface;
- Foundation Board cannot cross into `/app` or `/admin`;
- synthetic payslip UAT separately verified Foundation Board denial from personal payslip/import functionality.

## Acceptance criteria

- ORG-003-A: `/board` requires an authenticated `FOUNDATION_BOARD` principal.
- ORG-003-B: all metrics are aggregate and live from the HCIS database.
- ORG-003-C: initial board dashboard exposes no employee-level PII, evidence, or personal payslip data.
- ORG-003-D: approval readiness reports direct-manager and Unit Approver coverage without inferring hierarchy from titles.
- ORG-003-E: leave workflow indicators show current in-review, HC-validation, and unresolved attendance-resolution workload.
- ORG-003-F: attendance/payroll aggregate metrics remain unavailable until their aggregate semantics and permissions are explicitly specified; raw ATT-001/PAYSLIP-001 data must not be repurposed to fabricate them.
- ORG-003-G: `/board/approvals` is Foundation Board-only and its inbox/decision authorization is bound to the exact snapshotted account principal.
- ORG-003-H: the Board approval page has no dependency on Employee-only summary data.
