# Leave Policy YSQ

**Status:** VERIFIED MVP IMPLEMENTATION BASELINE — POLICY SOURCE STILL REQUIRES LEGAL REVIEW  
**Specification:** LEAVE-003  
**Related:** LEAVE-001, LEAVE-002, APR-001, ORG-002

## Source boundary

This specification translates the current internal `Master Ketentuan Cuti Final Sabilul Quran` working baseline into HCIS behavior.

The source itself states that it remains an internal policy working document that should receive legal review before becoming a final company regulation/SOP. HCIS therefore keeps the policy configurable and does not hardcode legal conclusions outside the approved YSQ rules.

The **implementation behavior** described here has been verified for the MVP. That verification does not convert the underlying working policy source into a legally final regulation.

## Human Capital handling

HCIS separates three Human Capital responsibilities:

```text
HC_NOTIFIED
  = HC receives the completed/ongoing leave information.

HC_VALIDATOR
  = HC verifies eligibility, documents, duration, or administrative compliance.
    Validation is not discretionary line approval.

HC_APPROVER
  = HC has explicit authority to approve/reject because the policy requires HC approval.
```

These responsibilities must not be collapsed into one generic `HC approval` step.

## Line approval

For leave that needs line approval, use ORG-002:

```text
DIRECT_MANAGER
  -> UNIT_APPROVER
  -> deduplicate
  -> remove requester self-approval
```

The resolved people are snapshotted at submission according to APR-001.

## Leave behavior groups

### 1. Individual request with line approval

Used when the employee requests planned leave and line management needs to approve operational scheduling.

Baseline examples:

- Cuti Tahunan;
- Cuti Pernikahan Karyawan;
- Cuti Menikahkan Anak;
- Cuti Khitan Anak;
- Cuti Ibadah Haji Wajib.

Document-heavy types may additionally require HC validation.

### 2. Notice / administrative validation

Used for rights or emergency events where the workflow should not imply that a manager decides whether the underlying event may occur.

Baseline examples:

- Cuti Hamil dan Melahirkan;
- Cuti Keguguran;
- Istirahat karena Haid;
- Cuti Sakit;
- Cuti Pendampingan Istri Melahirkan;
- Cuti Pendampingan Istri Keguguran;
- Cuti Keluarga Meninggal Dunia.

The line is notified as needed for staffing/operations. HC validates documents or administrative conditions where the policy requires it.

### 3. Explicit HC approval

`Cuti Tanpa Gaji` requires approval by the work-unit head and Human Capital.

HC is therefore an actual approver for this leave type, not merely a validator.

### 4. Organization event, not individual leave request

- Cuti Akhir Semester & Akhir Tahun Pelajaran;
- Cuti Bersama Yayasan.

These are established by YSQ and should appear as organization/academic calendar events rather than individual employee requests.

### 5. Attendance dispensation

`Keadaan Kahar/Bencana` is handled as attendance dispensation based on objective conditions and leadership decision. It is not an automatic leave entitlement.

## Cuti Tahunan — non-education employees

### Right versus usage availability

HCIS must always distinguish the annual right from current-period availability.

```text
Annual entitlement shown to employee = 12 working days / year
Current period usage limit            = 3 working days
```

The UI must never describe an employee as having only `3 days annual leave entitlement` merely because only one period is currently usable.

Recommended presentation:

```text
Hak Cuti Tahunan
12 hari / tahun

Status hak
Aktif sejak <eligibility date>

Periode saat ini
Oktober-Desember: 3 hari
Terpakai: 0 hari
Tersedia sekarang: 3 hari
```

### Eligibility

Cuti Tahunan applies to non-education employees after 12 continuous months of service.

Before the eligibility date:

- annual entitlement is still presented as `12 days / year` as the policy definition;
- available-to-use days are `0`;
- the UI shows the future eligibility date.

### Four usage periods

The 12-day annual entitlement is administered through four 3-day usage periods:

| Period | Usage limit |
| --- | ---: |
| January-March | 3 working days |
| April-June | 3 working days |
| July-September | 3 working days |
| October-December | 3 working days |

Initial implementation does **not** carry unused days from one period into the next unless YSQ later approves an explicit carry-forward rule.

### Employee becomes eligible mid-year

Eligibility does not retroactively unlock earlier periods.

Example:

```text
Employment start : 15 October 2025
Eligible from     : 15 October 2026
Annual right      : 12 days / year

2026 usage availability:
Jan-Mar           : not yet eligible
Apr-Jun           : not yet eligible
Jul-Sep           : not yet eligible
Oct-Dec           : up to 3 days
```

The correct HCIS display is **not** `Annual leave entitlement: 3 days`.

It is:

```text
Annual entitlement: 12 days / year
Available in current period: 3 days
```

In the following full eligible year, each of the four periods has a 3-day usage limit.

### Notice period

Cuti Tahunan is submitted at least 7 days before the leave starts.

The policy engine must validate this before submission. The exact day-count convention should remain configuration-driven if YSQ later clarifies whether the notice uses calendar days or working days.

### Approval flow

```text
System validation
  -> Direct Manager
  -> Unit Approver
  -> APPROVED
  -> HC notified
```

System validation includes at minimum:

- employee is active;
- employee belongs to the non-education entitlement group;
- 12-month eligibility has been reached by the leave start date;
- minimum notice is satisfied;
- requested working days fit the current period's remaining 3-day limit;
- request does not cross an unsupported period boundary without being split;
- no prohibited overlap exists.

HC does not manually validate every normal Cuti Tahunan request unless an exception workflow is introduced later.

## Education employees

Cuti Akhir Semester & Akhir Tahun Pelajaran is the implementation/fulfillment of annual leave for education employees according to the academic calendar and YSQ decision.

It is not an individual `Cuti Tahunan` balance request in the initial implementation.

HCIS must keep education/non-education classification explicit; it must not infer the classification solely from unit or job-title strings.

## Other leave baseline

| Leave type | Initial HCIS behavior | HC handling |
| --- | --- | --- |
| Cuti Akhir Semester & Akhir Tahun Pelajaran | Organization/academic calendar event | administrative administration |
| Cuti Tahunan | Individual line approval | notified |
| Cuti Bersama Yayasan | Organization event | administrative administration |
| Cuti Hamil dan Melahirkan | Individual notice/request with medical data | validator |
| Cuti Keguguran | Emergency notice; administration may follow | validator |
| Istirahat karena Haid | Notice; no H-7 requirement | notified; conditional follow-up validation |
| Cuti Sakit | Emergency notice; medical administration may follow | validator |
| Cuti Pernikahan Karyawan | Individual line approval; supporting document | validator |
| Cuti Menikahkan Anak | Individual line approval; supporting document | validator |
| Cuti Khitan Anak | Individual line approval; supporting document | validator |
| Cuti Pendampingan Istri Melahirkan | Notice for base right; extension handled separately | validator |
| Cuti Pendampingan Istri Keguguran | Emergency notice | validator |
| Cuti Keluarga Meninggal Dunia | Emergency notice | validator |
| Cuti Ibadah Haji Wajib | Individual line approval; official schedule/evidence | validator |
| Cuti Tanpa Gaji | Unit approval then HC approval | approver |
| Keadaan Kahar/Bencana | Attendance dispensation | outside normal leave approval |

Detailed duration/payroll consequences remain policy data and must not be inferred by the frontend.

## Data model direction implemented by MVP slices

The MVP keeps the policy small and explicit:

```text
Employee
  leave_entitlement_group = education | non_education

Organizational Unit
  leave_approver_employee_id

Leave Policy Catalog
  request_mode
  line_handling
  hc_handling
  notice_days
  evidence_requirement
  eligibility rule
  balance/period rule
```

Leave requests/slices persist the relevant submission-time facts needed by their workflow, including:

- policy key/version or policy metadata used at submission;
- calculated entitlement/usage facts;
- concrete approval steps where line approval applies;
- validation requirements and HC task kind;
- audit/events and notification intents.

Later organization changes must not rewrite already snapshotted approval chains.

## Verification

Final synthetic browser UAT verified the implemented policy boundaries across:

- Annual Leave: system validation -> Direct Manager -> Unit Approver -> approved -> HC notified;
- Special Leave: HC administrative validation with encrypted evidence where applicable;
- Planned Leave: line approval plus planned-domain HC validation where required;
- Cuti Tanpa Gaji: Unit Approver followed by **actual HC approval**;
- Attendance Resolution: unresolved administrative dates remain an attendance-classification concern, not automatic payroll or leave deduction;
- organization-scoped HC positive access and unit-scoped HC denial for global queues.

These tests verify HCIS behavior against the working policy baseline. They do not replace the pending legal review of the underlying YSQ policy document.

## Acceptance criteria

- LEAVE-003-A: Cuti Tahunan always exposes the policy right as 12 days/year while separately showing current-period availability.
- LEAVE-003-B: annual usage is limited to 3 working days per Jan-Mar, Apr-Jun, Jul-Sep, and Oct-Dec period.
- LEAVE-003-C: an employee reaching 12 months during a year only becomes usable from the period containing the eligibility date; earlier periods are not retroactively available.
- LEAVE-003-D: unused period quota does not automatically carry forward in the initial implementation.
- LEAVE-003-E: Cuti Tahunan uses system validation plus line approval; HC is notified, not a routine approver/validator.
- LEAVE-003-F: HC validator and HC approver are distinct workflow responsibilities.
- LEAVE-003-G: Cuti Tanpa Gaji requires actual HC approval.
- LEAVE-003-H: organization-event leave and attendance dispensation are not modeled as ordinary individual leave requests.
- LEAVE-003-I: education/non-education classification is explicit and never inferred from title text.
