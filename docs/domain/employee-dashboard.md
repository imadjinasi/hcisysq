# Employee Self-Service Dashboard

**Status:** ACTIVE IMPLEMENTATION BASELINE  
**Specification:** EMP-005  
**Related:** EMP-001, LEAVE-004, LEAVE-005, LEAVE-007, APR-001

## Goal

`/app` is the employee's live home page. It must not display synthetic employee, leave, approval, attendance, or payroll facts as if they were production data.

## Live data sources in the initial implementation

The dashboard composes existing authoritative employee endpoints:

- employee identity and organization assignment from the authenticated employee account;
- annual-leave entitlement and current-period availability;
- latest annual and special-leave requests;
- pending approval count for the employee as an approver;
- Human Capital role signal;
- attendance-resolution tasks that require the employee's decision.

## Features not yet backed by an authoritative module

Attendance and payslip cards remain visible as product navigation, but must clearly state that live data is not yet connected. They must not show fabricated check-in times, salary periods, or status.

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

- `Cuti & Izin` -> `/app/leave`;
- `Persetujuan` -> `/app/approvals` when relevant;
- attendance-resolution employee task -> `/app/attendance-resolution`;
- HC workspaces remain visible only when the authenticated employee has the relevant additional role.

## Empty and unavailable states

A missing backend module is represented as `Belum tersedia` / `Belum terhubung`, not as zero or mock data.

An employee with no requests sees a calm empty state rather than placeholder requests.

## Acceptance criteria

- EMP-005-A: employee name, unit, position, annual-leave data, request status, and approval count come from live authenticated APIs.
- EMP-005-B: no employee-dashboard mock data is imported by `/app`.
- EMP-005-C: annual entitlement remains 12 days/year for eligible non-education policy display while period availability is shown separately.
- EMP-005-D: education employees do not receive a fabricated individual annual-leave balance.
- EMP-005-E: unresolved employee attendance-resolution decisions are visible as a priority action.
- EMP-005-F: unavailable attendance/payroll integrations never render fabricated operational values.
- EMP-005-G: dashboard actions navigate to the actual workflow pages.
