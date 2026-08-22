# Employee Self-Service Dashboard

**Status:** VERIFIED MVP BASELINE  
**Specification:** EMP-005  
**Related:** EMP-001, LEAVE-004, LEAVE-005, LEAVE-007, APR-001, ATT-001, PAYSLIP-001

## Goal

`/app` is the employee's live home page. It must not display synthetic employee, leave, approval, attendance, or payroll facts as if they were production data.

## Live data sources

The dashboard composes authoritative employee/session-backed data:

- employee identity and organization assignment from the authenticated employee account;
- annual-leave entitlement and current-period availability;
- latest annual and special-leave requests;
- pending approval count for the employee as an approver;
- effective Human Capital organization capability;
- attendance-resolution tasks that require the employee's decision.

ATT-001 provides the authoritative employee attendance surface at `/app/attendance`. The dashboard links to that surface rather than manufacturing a check-in time or attendance status. Daily attendance records contain observed check-in/check-out facts only; late, absence, overtime, and work-hour conclusions remain unavailable until attendance schedules/policy are explicitly defined.

PAYSLIP-001 provides the authoritative employee payslip surface at `/app/payslips`. Employee identity comes from the linked active employee record, and only published imported payslips owned by that employee are visible.

## Features intentionally not backed by an MVP engine

Payslip data is connected, but **payroll calculation is not**. Imported payslip lines remain opaque display data; the dashboard must not derive salary totals, deductions, overtime, tax, BPJS, or attendance consequences.

Attendance is backed by ATT-001 for factual daily records, but schedule-derived status is intentionally not available. The dashboard therefore must not label an employee late, absent, short on hours, or overtime.

## Leave presentation

For non-education employees:

```text
Hak Cuti Tahunan: 12 hari / tahun
Tersedia periode saat ini: N hari
```

For education employees, the dashboard explains that annual leave fulfillment follows the academic break calendar. It does not manufacture an individual 12-day balance bucket.

## Priority actions

The dashboard surfaces actions before passive metrics:

1. employee decision required for an Attendance Resolution annual-conversion proposal;
2. leave administration that needs completion;
3. approvals waiting for the employee as approver;
4. active leave requests.

A focused action links to the existing task screen instead of embedding complex workflow controls on the dashboard.

## Navigation

Quick actions use actual application routes:

- `Kehadiran` -> `/app/attendance`;
- `Cuti & Izin` -> `/app/leave`;
- `Slip Gaji` -> `/app/payslips`;
- `Persetujuan` -> `/app/approvals` when relevant;
- attendance-resolution employee task -> `/app/attendance-resolution`;
- organization-wide HC workspaces are shown only when the authenticated employee has the effective organization-scoped HC capability.

A `human_capital` role assignment with only `unit` scope must not expose organization-wide HC navigation. Backend authorization remains authoritative even when navigation is hidden.

## Empty and unavailable states

A missing backend capability is represented as `Belum tersedia` / `Belum terhubung`, not as zero or mock data.

For attendance, the absence of a daily record is represented as `Belum ada rekaman`, not as `Tidak hadir`. A missing punch is not an absence decision until schedule and resolution rules exist.

For payslip, no published payslip is an honest empty state; the UI must not fabricate a pay period or nominal value.

An employee with no requests sees a calm empty state rather than placeholder requests.

## Verification

Browser UAT verified:

- live employee dashboard rendering;
- attendance, leave, approval, and payslip navigation;
- unit-scoped HC does not receive organization-wide HC navigation;
- direct organization-wide HC routes still fail closed server-side for insufficient scope and terminate loading with a clear error state;
- payslip shell uses linked employee name/position/unit instead of raw login email fallback;
- employee cannot cross into Foundation Board or Super Admin areas.

## Acceptance criteria

- EMP-005-A: employee name, unit, position, annual-leave data, request status, and approval count come from live authenticated APIs.
- EMP-005-B: no employee-dashboard mock data is imported by `/app`.
- EMP-005-C: annual entitlement remains 12 days/year for eligible non-education policy display while period availability is shown separately.
- EMP-005-D: education employees do not receive a fabricated individual annual-leave balance.
- EMP-005-E: unresolved employee attendance-resolution decisions are visible as a priority action.
- EMP-005-F: payroll calculation remains unavailable and attendance never renders fabricated schedule-derived status.
- EMP-005-G: dashboard actions navigate to actual workflow pages, including `/app/attendance` and `/app/payslips`.
- EMP-005-H: organization-wide HC navigation requires an effective organization-scoped capability, not a role label alone.
- EMP-005-I: payslip identity uses the linked active employee identity when available.
