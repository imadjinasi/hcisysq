# Organization Mapping and Approval Context

**Status:** ACTIVE IMPLEMENTATION BASELINE  
**Specification:** ORG-002  
**Related:** ORG-001, APR-001, AUTH-010, EMP-001, LEAVE-001

## Purpose

Keep organization administration simple while protecting approval routing.

Imported `UNIT`, `JABATAN`, `JABATAN FUNGSIONAL`, and `JABATAN STRUKTURAL` values are starting master data only. They are useful for setup, but they are **not approval rules** and HCIS must never infer hierarchy from title text.

## Current-state organization model

For the first usable HCIS release, organization data represents the structure that is valid **now**.

```text
Employee
  -> current Unit
  -> current Position / Job label
  -> current Direct Manager

Unit
  -> current Unit Approver
```

Rules:

1. Unit names may be renamed in place when the same unit changes nomenclature.
2. Units or job labels that are no longer used may be marked inactive or cleaned up once no active employee depends on them.
3. Historical aliases, effective-dated organization versions, seat registries, and automatic restructuring engines are not prerequisites for Leave.
4. Job Profile and formal Position registries may be introduced later for HCM/JD/grading needs without changing the approval contract below.
5. Raw import labels must never automatically create a reporting line.

## Direct Manager

`employees.direct_manager_employee_id` is the explicit current reporting relationship used by line approval.

Examples:

```text
Guru Kelas
  -> Wakasek Kurikulum
  -> Kepala SDIT
```

A role at a similar level may legitimately report directly to the unit head:

```text
Guru / Staf tertentu
  -> Kepala SDIT
```

HCIS does not hardcode either path from the employee's job title. Human Capital / Super Admin configures the actual direct manager.

Direct-manager assignment must reject:

- self-manager;
- inactive manager;
- reporting-line cycle.

## Unit Approver

Each active unit used by approval workflows has one explicit **current Unit Approver**.

The Unit Approver is normally the unit head, but it is a configuration value, not a title-derived rule.

This intentionally handles vacancies without a complex acting-position engine.

Examples:

```text
Kepala Unit filled
  Unit Approver = Kepala Unit

Kepala Unit vacant, authority temporarily at Kabid
  Unit Approver = Kabid

Kepala Unit and Kabid vacant, authority temporarily at Director
  Unit Approver = Director
```

HCIS must **not** automatically climb to the next visible hierarchy when a position is vacant. An administrator explicitly chooses the responsible employee.

When responsibility changes, the Unit Approver value is updated for future submissions.

## Standard line approval resolver

For ordinary line-approved workflows, including Cuti Tahunan, the resolver is:

```text
DIRECT_MANAGER
  -> UNIT_APPROVER
```

Resolution rules:

1. resolve the requester's active Direct Manager;
2. resolve the requester's unit's current Unit Approver;
3. remove self-approval;
4. deduplicate the same employee appearing in both steps;
5. reject inactive approvers;
6. fail submission when a mandatory relationship is not configured;
7. snapshot the resolved people at submission according to APR-001.

Examples:

```text
Guru Kelas
  Direct Manager = Wakasek Kurikulum
  Unit Approver  = Kepala SDIT

Resolved:
  Wakasek Kurikulum -> Kepala SDIT
```

```text
Guru yang langsung ke Kepala SDIT
  Direct Manager = Kepala SDIT
  Unit Approver  = Kepala SDIT

Resolved:
  Kepala SDIT
```

```text
Kepala SDIT mengajukan
  Direct Manager = Kepala Bidang Pendidikan
  Unit Approver  = dirinya sendiri

Resolved:
  Kepala Bidang Pendidikan
```

## Vacancy rule

Vacancy is solved by explicit current configuration, not automatic hierarchy search.

If a unit head is vacant, the Unit Approver must be intentionally pointed to the employee currently authorized to approve. This can be a Kabid, Director, or another authorized employee.

If no Unit Approver is configured, approval-dependent submission fails with an actionable configuration error. The system must not guess.

## Approval history

Organization administration is current-state and intentionally simple, but submitted approvals still preserve history through approval snapshots.

Changing Direct Manager or Unit Approver affects **new** submissions only. Existing submitted requests retain the approvers resolved when they were submitted.

This is the historical boundary required by APR-001; organization master itself does not need complex versioning for the initial release.

## Admin surface

The admin experience should prioritize setup speed and visibility:

- list current units and active employee counts;
- rename/clean up current unit and job labels;
- assign Direct Manager on active employees;
- assign one Unit Approver per active unit;
- show missing Direct Manager count;
- show missing Unit Approver count;
- preview the resolved approval chain for an employee;
- warn on self-manager, cycles, inactive approvers, and incomplete configuration.

No bulk title-based manager inference is allowed.

## Audit

Audit at minimum:

- Direct Manager changed;
- Unit Approver changed;
- employee unit changed;
- current unit renamed/deactivated when those operations are introduced.

Audit payloads use identifiers and normalized metadata only; do not copy raw employee workbook rows.

## Acceptance criteria

- ORG-002-A: imported unit/job text never automatically creates approval hierarchy.
- ORG-002-B: each active employee can have an explicit current Direct Manager.
- ORG-002-C: each approval-relevant unit can have one explicit current Unit Approver.
- ORG-002-D: `DIRECT_MANAGER -> UNIT_APPROVER` removes self-approval and duplicates.
- ORG-002-E: vacancy never causes automatic hierarchy fallback; the responsible Unit Approver is configured explicitly.
- ORG-002-F: missing mandatory approval configuration blocks submission instead of guessing.
- ORG-002-G: changes affect future submissions only; submitted approval snapshots remain unchanged.
- ORG-002-H: the initial Leave release does not depend on organization versioning, alias history, or a formal Position registry.
