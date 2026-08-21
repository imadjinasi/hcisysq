# Attendance Resolution after Leave Validation

**Status:** ACTIVE IMPLEMENTATION BASELINE  
**Specification:** LEAVE-007  
**Related:** LEAVE-003, LEAVE-005, LEAVE-006, APR-001

## Purpose

Leave administration, attendance classification, and payroll consequences are separate concerns.

A special-leave report can represent a real event while its administration is only partially supported or not supported by the evidence available. HCIS must not collapse those facts into one generic `approved/rejected` result.

## Administrative validation states

Special leave handled by Human Capital uses an explicit administration status:

```text
pending
validated
partially_validated
not_validated
not_applicable
```

`not_validated` means the administrative requirement was not fulfilled. It does not assert that the underlying medical/family event did not happen.

## Partial validation

Human Capital may validate only the working dates supported by the available administration.

Example:

```text
Reported sick leave : 1-4 September
Evidence covers      : 1-2 September

1 Sep -> validated as sick leave
2 Sep -> validated as sick leave
3 Sep -> unresolved attendance
4 Sep -> unresolved attendance
```

The unresolved working dates create one Attendance Resolution case linked to the original leave request.

## Attendance Resolution

An Attendance Resolution case contains only dates that still need a final attendance classification.

Initial resolution options:

- `dispensation`;
- `unpaid_absence`;
- `annual_conversion` for eligible non-education employees;
- `manual_review` while Human Capital still needs an internal decision.

The leave module records the source and administrative facts. Payroll later consumes the final attendance classification; this feature does not calculate payroll deductions.

## Education employees

Education employees do not have an individual annual-leave bucket that may be consumed by Attendance Resolution.

Therefore:

```text
education employee
  -> annual_conversion is never offered
  -> unresolved dates remain an attendance-resolution matter
```

Cuti Akhir Semester/Akhir Tahun Pelajaran is not reduced because a special-leave document was incomplete.

## Non-education annual conversion

Annual conversion is an administrative fallback, not a normal planned annual-leave request.

It is only available when all of the following are true:

- employee is `non_education`;
- employee had reached 12 months of service on the unresolved date(s);
- all unresolved dates belong to one annual-leave period;
- the corresponding 3-day period still has sufficient unused quota;
- the employee explicitly accepts the conversion.

Normal H-7 notice and line approval are not re-run because the absence already happened and the conversion is an administrative settlement. The resulting annual-leave usage is persisted as an approved administrative conversion so the period quota is consumed and auditable.

Human Capital may propose the conversion but must not silently deduct annual leave.

## Human Capital GUI

The validation screen keeps the common path first:

```text
Administrasi sesuai
Minta dilengkapi
Sebagian / tidak terpenuhi
```

Only the third action expands date-level controls. Human Capital checks the dates supported by the evidence; unchecked dates automatically become one Attendance Resolution case.

The resolution queue then presents a small set of explicit actions instead of payroll or disciplinary jargon.

## Employee GUI

Employees are not expected to understand resolver/workflow terminology.

When annual conversion is proposed, the employee sees a focused task:

```text
2 hari perlu penyelesaian
Human Capital mengusulkan penggunaan Cuti Tahunan
Sisa periode sebelum konversi: 2 hari

[Gunakan Cuti Tahunan] [Jangan gunakan]
```

Rejecting the proposal returns the case to Human Capital for another resolution. It does not silently apply another consequence.

## Audit and invariants

- each unresolved leave request has at most one Attendance Resolution case;
- each resolution case stores the exact unresolved working dates;
- date-level validation is immutable after the HC validation task is closed;
- annual conversion is blocked for education employees;
- annual conversion is revalidated transactionally at employee acceptance;
- conversion never exceeds the 3-day period limit;
- no automatic annual-leave deduction occurs without employee acceptance;
- final attendance resolution is audited and may be handed off to attendance/payroll later.

## Acceptance criteria

- LEAVE-007-A: HC can validate all, request completion, validate a subset of working dates, or mark administration not validated.
- LEAVE-007-B: unresolved working dates create one linked Attendance Resolution case.
- LEAVE-007-C: education employees never receive an annual-conversion option.
- LEAVE-007-D: eligible non-education employees may be offered annual conversion only when the original period has sufficient quota.
- LEAVE-007-E: annual conversion requires explicit employee acceptance and then consumes annual-leave period usage.
- LEAVE-007-F: rejecting annual conversion returns the case to HC without another automatic consequence.
- LEAVE-007-G: dispensation and unpaid-absence classifications are recorded as attendance outcomes, not payroll calculations.
- LEAVE-007-H: GUI keeps common actions visible and expands date-level complexity only when partial/not-validated treatment is selected.
