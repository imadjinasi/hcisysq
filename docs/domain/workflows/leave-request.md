# Leave Request Workflow

**Status:** ACTIVE IMPLEMENTATION BASELINE  
**Specifications:** LEAVE-001, LEAVE-002, LEAVE-003, APR-001, ORG-002

## Purpose

Define the shared request lifecycle. Leave-type-specific rights, notice rules, HC handling, and annual-period rules live in `docs/domain/leave-policy-ysq.md`.

Not every YSQ leave type is an ordinary individual approval request. The workflow engine must first read the policy's `request_mode`, `line_handling`, and `hc_handling`.

## Actors

- Employee as requester.
- Direct Manager and Unit Approver for line approval when required.
- Human Capital as `notified`, `validator`, or `approver` according to the leave policy.
- Administrator with explicit correction/configuration permission.

## Preconditions

- Employee is active.
- Leave type is active and applicable to the employee.
- Employee entitlement group is configured where the policy depends on education/non-education classification.
- Work calendar and organization timezone are configured.
- Required Direct Manager / Unit Approver relationships are configured for line-approved workflows.
- Policy validation can be completed without guessing missing organization or entitlement data.

## Request modes

```text
INDIVIDUAL
  employee creates a request/notice

ORGANIZATION_EVENT
  YSQ/HC creates a calendar event; no individual request

DISPENSATION
  attendance dispensation handled outside normal leave entitlement flow
```

## HC handling modes

```text
NOTIFIED
  HC receives the information; no HC decision step

VALIDATE
  HC verifies administrative eligibility/evidence/duration

APPROVE
  HC has an actual approve/reject step because policy explicitly requires it
```

HC validation must not be presented as discretionary approval.

## Line handling

For a leave type with line approval, resolve:

```text
DIRECT_MANAGER
  -> UNIT_APPROVER
```

ORG-002 rules apply:

- remove requester self-approval;
- deduplicate the same employee appearing in both roles;
- reject inactive approvers;
- do not auto-climb hierarchy when a position is vacant;
- fail closed when mandatory configuration is missing.

The concrete people are snapshotted once at submission according to APR-001.

## Input

Common input may include:

- leave type;
- start date;
- end date;
- partial-day indicator when supported;
- reason/notes when policy allows or requires it;
- attachment/evidence when required;
- emergency/deferred-document indicator when the policy permits administration after the event.

## Shared invariants

- Start date cannot be after end date.
- Request cannot overlap prohibited leave/attendance events.
- Working-day calculation uses the same calendar in preview and submit.
- Frontend never owns entitlement, payroll, approval, or validation rules.
- Requester can only change/cancel requests in states allowed by policy.
- An actor can only act on an active step assigned to that actor.
- Submitted approval steps are never recomputed because organization configuration later changes.

## Cuti Tahunan submit flow

For non-education employees:

1. Load active employee, entitlement group, start date, and 12-month eligibility date.
2. Keep the policy display right as `12 working days / year`.
3. Determine the usage period: Jan-Mar, Apr-Jun, Jul-Sep, or Oct-Dec.
4. Calculate the period's remaining 3-day usage limit.
5. Validate minimum notice and requested working days.
6. Resolve `Direct Manager -> Unit Approver` and deduplicate.
7. Persist request + calculation snapshot + approval snapshot transactionally.
8. Start the first line-approval step.
9. After final line approval, mark approved and notify HC.

An employee becoming eligible mid-year does not receive earlier period quotas retroactively. The UI still shows the annual policy right as 12 days/year while separately showing what is usable now.

## Notice / HC-validation flow

For medical/emergency/document-driven leave:

1. Accept the employee notice/request according to the policy's notice timing.
2. Allow deferred administration when explicitly permitted by policy.
3. Notify line management where required for operations.
4. Create an HC validation task only when the policy requires validation.
5. HC records validation result and normalized metadata; do not place sensitive medical detail in notification payloads.
6. Complete the request when required administrative checks are satisfied.

## HC-approval flow

For Cuti Tanpa Gaji:

```text
line approval
  -> HC approval
  -> final decision
```

HC is a real approver in this flow because the YSQ baseline explicitly requires Human Capital approval.

## States

The first implementation may use a shared request state with step-specific task types:

```text
draft
  -> submitted
submitted
  -> in_review
in_review
  -> approved
  -> rejected
  -> cancelled
```

Validation tasks distinguish `approval` from `validation`; do not infer semantics solely from the parent request state.

## Calculation snapshot

At submit, persist enough normalized facts to explain the decision later, for example:

- leave policy key/version;
- entitlement group;
- eligibility date;
- annual entitlement display value when applicable;
- current period key and period limit;
- used/remaining amount before submission;
- requested working days;
- notice-rule result;
- required evidence rule;
- concrete approval steps;
- HC handling mode.

Policy/config changes after submission do not rewrite the snapshot.

## Notifications

- Requester receives submit/decision status.
- Current line approver receives a task when line approval is required.
- HC receives a notification, validation task, or approval task according to `hc_handling`.
- Organization-event leave is communicated through calendar/event publication rather than fake employee requests.
- Notifications must not expose unnecessary medical or personal details.

## Audit events

```text
leave.request.created
leave.request.submitted
leave.request.approved_step
leave.request.rejected
leave.request.cancelled
leave.request.validated
leave.request.validation_rejected
leave.request.reassigned
leave.balance.adjusted
leave.policy.configuration_changed
leave.unit_approver.changed
```

## Failure behavior

- Missing Direct Manager or Unit Approver for mandatory line approval: submission fails with an actionable configuration error.
- Employee entitlement group missing when required: submission fails with an actionable configuration error.
- Calendar/configuration missing: submission fails without partial request creation.
- Notification provider down: committed business state remains valid; notification is retried.
- Concurrent submit: idempotency prevents duplicate requests.
- Concurrent balance/period use: transaction/locking prevents usage beyond the period limit.

## Acceptance criteria

- LEAVE-001-A: active employee can preview working-day impact before submit.
- LEAVE-001-B: idempotent submit creates one request and one approval/validation snapshot.
- LEAVE-001-C: invalid date ranges and prohibited overlap are rejected.
- LEAVE-001-D: Cuti Tahunan applies LEAVE-003 annual entitlement and 3-day period rules server-side.
- LEAVE-001-E: line approval uses ORG-002 Direct Manager + Unit Approver resolution.
- LEAVE-001-F: HC notification, validation, and approval are distinct task semantics.
- LEAVE-001-G: missing mandatory configuration fails closed without guessing an approver.
- LEAVE-001-H: notification failure does not roll back an already committed business transaction.
- LEAVE-001-I: employee UI clearly distinguishes `12 days/year entitlement` from `available now`.
