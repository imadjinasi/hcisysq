# Annual Leave Submission and Approval Snapshot

**Status:** VERIFIED MVP BASELINE — ORG-004 EXTENSION IMPLEMENTED LOCALLY, NOT DEPLOYED
**Specification:** LEAVE-004  
**Related:** LEAVE-001, LEAVE-002, LEAVE-003, APR-001, ORG-002, ORG-004

## Purpose

Implement the first real employee leave transaction as Annual Leave for non-education employees while preserving the YSQ rule that the employee-facing annual right remains **12 working days per year** and usage is limited to **3 working days per quarter-period**.

The verified MVP uses the simple organization model already agreed for approvals:

```text
Direct Manager
  -> Unit Approver
  -> approved
  -> Human Capital notified
```

The same employee is never required to approve twice. The approver chain is resolved once at submission and persisted as a snapshot.

## Current implementation boundary

The flow above describes the **verified MVP runtime**.

ORG-004 (`docs/domain/dynamic-organization-structure.md`) is the implemented-local post-MVP successor for structure-driven authority resolution, effective-dated positions/incumbencies, vacancy fallback, and post-approval structural oversight notification.

Agents must not assume ORG-004 behavior is already live until that milestone is implemented and activated.

## Annual right versus current availability

HCIS must never describe a late-year employee as having only a 3-day annual right.

```text
Annual right:          12 working days / year
Period usage limit:     3 working days
Current availability:  depends on eligibility, period and previous usage
```

Eligibility begins after 12 continuous months of employment. Periods before the eligibility date are not made retroactively available. No automatic carry-forward is enabled in this baseline.

Example: employment starts 15 October 2025.

```text
Annual right shown: 12 working days / year
Eligible from:       15 October 2026
Oct-Dec 2026:        up to 3 working days available
Jan-Sep 2026:        not retroactively available
```

## Work calendar

Working-day calculation is backend-authoritative and must not assume Monday-Friday or any other schedule without configuration.

The organization configures:

- weekly working weekdays using ISO weekday numbers 1=Monday through 7=Sunday;
- date-specific exceptions for holidays, collective leave, or exceptional working days;
- timezone is Asia/Jakarta in the current baseline.

If the workweek is not configured, annual leave preview and submission fail closed with an actionable configuration error.

## Submission validation

Before submission the API validates:

- requester account maps to an active employee;
- employee is explicitly classified as `non_education`;
- employment start date is present;
- 12-month eligibility has been reached by the leave start date;
- request respects the minimum H-7 notice;
- the date range does not cross two period buckets;
- backend-calculated working days are greater than zero;
- existing `in_review` and `approved` requests are counted as reserved/used period quota;
- requested working days do not exceed the remaining 3-day period availability;
- Direct Manager and Unit Approver are configured;
- each concrete approver is an active employee with an active employee account.

Concurrency is serialized by locking the requester employee row during submission. An idempotency key prevents duplicate requests.

## Approval snapshot

At submission HCIS stores all concrete approval steps in order.

```text
request submitted
  -> step 1 pending
  -> later steps waiting
```

Approving the active step activates the next stored step. The hierarchy is never recomputed after submission. Rejecting the active step rejects the request.

A Direct Manager and Unit Approver resolving to the same employee become one stored step with both source labels.

ORG-004 must preserve this invariant even when authority is resolved from dynamic organization structure.

## Notifications — verified MVP

This slice writes notification intents to an outbox rather than coupling the transaction to a provider.

- first/next approver receives an approval-request intent;
- requester receives final approved/rejected intent;
- final approved Annual Leave creates an HC-role notification intent because HC is notified, not an approver, for this policy.

Notification-provider failure must not roll back the leave transaction.

## ORG-004 structural oversight notification

Accepted post-MVP rule:

> After the **overall leave request reaches final `approved`**, notify one structural layer above the **final line/governance approver**.

For ordinary Annual Leave:

```text
Employee
-> Direct Manager
-> Unit Approver                 [final line approver]
-> overall request APPROVED
-> one structural layer above Unit Approver NOTIFIED
```

This notification is:

- informational only;
- emitted after final approval;
- not an additional approval step;
- separate from the existing Human Capital notification required by Annual Leave policy;
- resolved through ORG-004 structure/authority configuration rather than job-title code.

Therefore an approved Annual Leave request may legitimately produce both:

```text
HC notification               [existing leave-policy responsibility]
Structural oversight notice   [planned ORG-004 rule]
```

### Director requester

Accepted planned governance behavior:

```text
Director
-> Secretary of the Foundation APPROVES
-> request APPROVED
-> Chair of the Foundation NOTIFIED
```

Pembina/Foundation Supervisor is not included by this rule.

This is a **planned ORG-004 behavior**, not the current verified MVP runtime. It must be represented through structure/authority configuration, not a source-code title check.

## Employee surfaces

The employee leave surface shows:

- annual right as 12 days/year;
- eligibility date;
- four period buckets;
- current period availability;
- preview of backend-calculated working dates;
- snapshotted approval chain preview before submit;
- recent request history and current approver;
- pending approval inbox for employees who are approvers.

A future ORG-004-enabled preview should explain the resolved structural approvers without exposing unnecessary internal configuration detail.

## Slice boundary and later MVP slices

When LEAVE-004 was first introduced, the following were intentionally outside this slice:

- medical/document attachment storage;
- HC Validator queue for leave types that require validation;
- HC approval step for Unpaid Leave;
- half-day leave;
- post-approval cancellation;
- notification-provider adapter;
- collective/academic calendar event management beyond working-day exceptions.

By the final MVP checkpoint, encrypted evidence/HC validation, planned/unpaid leave, and Attendance Resolution are implemented by later leave slices and were verified separately. They do **not** change the verified LEAVE-004 annual approval rule: normal Annual Leave remains Direct Manager -> Unit Approver -> approved -> HC notified until ORG-004 is implemented.

Half-day leave, post-approval cancellation, production notification delivery adapters, and fuller collective/academic calendar management remain outside the verified MVP unless specified elsewhere.

## Verification

The final isolated synthetic UAT completed a real browser Annual Leave flow from preview and submission through snapshotted Direct Manager and Unit Approver decisions to final approved state. This verification used synthetic employees/accounts only and did not touch the VPS employee data.

## Audit and privacy

Store identifiers, dates, policy metadata, structural resolution metadata when ORG-004 is introduced, and decision metadata only. Do not copy raw employee import rows into leave audit payloads.

Decision notes and leave reasons are authorized leave-domain data and must not be included in notification payloads by default.

## Acceptance criteria

### Verified MVP

- LEAVE-004-A: annual right is always represented as 12 days/year while current availability is calculated separately.
- LEAVE-004-B: employee becoming eligible in October can use at most the Oct-Dec 3-day bucket; earlier buckets are not retroactive.
- LEAVE-004-C: backend working-day calculation requires an explicitly configured calendar.
- LEAVE-004-D: in-review requests reserve period quota and concurrent submission cannot overspend it.
- LEAVE-004-E: submission snapshots concrete Direct Manager and Unit Approver steps and rejects unavailable approver accounts.
- LEAVE-004-F: approval proceeds only through the stored snapshot; organization changes do not rewrite an existing request.
- LEAVE-004-G: duplicate approvers are deduplicated and self-unit-approval is not added.
- LEAVE-004-H: final annual approval notifies HC without adding HC as an approval step.
- LEAVE-004-I: submission is idempotent by employee + idempotency key.
- LEAVE-004-J: employee and approver APIs are authenticated as EMPLOYEE and cannot operate on another employee's request or step.

### Planned ORG-004 extension

- LEAVE-004-K: Annual Leave authority can be resolved from effective organization structure without changing the immutable approval-snapshot rule.
- LEAVE-004-L: vacant supervisory positions follow the configured ORG-004 vacancy policy; no title-text inference is permitted.
- LEAVE-004-M: after overall final approval, one structural layer above the final line/governance approver receives an informational notification intent.
- LEAVE-004-N: the structural oversight notification remains separate from the existing HC notification.
- LEAVE-004-O: Director leave resolves Secretary as approver and Chair as the post-approval structural notification recipient; Pembina is not included by this rule.
