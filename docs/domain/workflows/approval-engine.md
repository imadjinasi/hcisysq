# Approval Engine

**Status:** ACCEPTED — ORG-004 EXTENSION DEPLOYED WITH CONTROLLED ROLLOUT
**Specification:** APR-001  
**Related:** ORG-002, ORG-004

## Purpose

Provide a simple, consistent approval pattern for leave, attendance clarification, reimbursement, loan, overtime, documents, and other requests without duplicating chain logic in every module.

Core principle:

> **Resolve the chain once at submission, store it as a snapshot, then execute it step by step.**

Hierarchy, role, or organization changes after submission must not silently rewrite an in-flight approval chain.

## Current implementation boundary

APR-001 describes the verified approval engine behavior used by the completed MVP. The accepted post-MVP organization successor is ORG-004 (`docs/domain/dynamic-organization-structure.md`).

ORG-004 changes how semantic authority may be resolved from organization data; it does **not** change APR-001's immutable snapshot rule. The implementation is deployed, but structural authority applies only where the effective rollout setting is `STRUCTURE`.

Legacy direct-manager and unit-approver fields are migration-compatibility
state. There is no dual-authoritative configuration:

- `LEGACY`: legacy is authoritative; structure has no routing/oversight side effect;
- `SHADOW`: legacy is authoritative; structure is comparison-only and has no
  structural notification side effect;
- `STRUCTURE`: ORG-004 is authoritative and fails closed; legacy is neither
  appended nor used as fallback.

## Initial release scope

The verified engine intentionally remains simple:

- sequential approval;
- one effective approver per step;
- no parallel approval/quorum;
- no generic auto-approval or expiry;
- reassignment only through an authorized procedure;
- notification is separate from the approval decision.

More complex behavior may be added only for a documented domain requirement.

## Actors

- Requester.
- Current approver.
- Domain administrator with `approvals.reassign` or a module-specific permission.
- System for state transition, audit, and notifications.

## Resolver principle

A workflow template should not normally store a person's name. It stores a semantic way to find the required authority.

Verified/current resolver vocabulary includes patterns such as:

```text
DIRECT_MANAGER
UNIT_ROLE(role_key)
ORG_ROLE(role_key)
SPECIFIC_PERSON(user_id)
```

Domain slices may also provide their own explicit resolver for concepts already implemented, such as the current Unit Approver.

At submission, semantic resolvers become concrete principals and those principals
are persisted in the request snapshot. A principal is normally an Employee, but
an explicit governance binding may select a `FOUNDATION_BOARD` Account. Each
stored step contains exactly one of `approver_employee_id` or
`approver_account_id`; existing employee-based steps remain valid unchanged.

Example:

```text
Template:
Step 1 -> DIRECT_MANAGER
Step 2 -> UNIT_APPROVER

Resolved for Ahmad:
Step 1 -> Budi
Step 2 -> Siti
```

The stored approval steps are `Budi -> Siti`, not a live query that keeps following organization changes.

Administrative preview must call the same rollout-aware backend authority
service as submission. It may present additional `SHADOW` diagnostics, but it
must not reproduce resolution rules in the web layer or merge authoritative and
candidate chains.

## ORG-004 structural resolvers

ORG-004 introduces the accepted direction for structure-driven authority resolution.

The implementation may expose semantic resolvers such as:

```text
STRUCTURAL_DIRECT_MANAGER
UNIT_APPROVER
GOVERNANCE_APPROVER
```

The exact internal names are implementation details; the required behavior is not.

Structural resolution may use:

- employee organizational membership;
- leader/parent positions;
- effective position incumbency;
- acting authority;
- documented employee override;
- authority binding;
- vacancy policy;
- effective date.

It must never infer authority from free-text job-title strings or a hardcoded numeric organization level.

### Vacancy behavior

ORG-004 may allow a structural resolver to climb past one or more vacant supervisory seats when the configured vacancy policy allows it.

Example:

```text
Director
-> Head of Social Division [VACANT]
-> Social Staff
```

For a Social Staff requester, `STRUCTURAL_DIRECT_MANAGER` may resolve to the Director.

Higher-risk authorities may require an acting assignment or fail closed instead of climbing.

Vacancy fallback is structural only. Once an active, non-removed Employee
incumbent—or an explicit governance Account incumbent—has been selected, login
and capability checks cannot replace it by climbing. Account missing/not active
and capability missing are explicit fail-closed readiness errors for the selected
principal.

### Acting authority

An effective acting assignment must be honored when its mandate applies. Acting authority is explicit and effective-dated; it must not be inferred from an employee's temporary absence.

## Submit lifecycle

When a request is submitted:

1. validate the domain request;
2. load the organization context relevant to the effective resolver;
3. select the applicable workflow template/variant;
4. resolve every required approval step to a concrete approver;
5. apply documented fallback, vacancy, and override rules;
6. reject self-approval and deduplicate repeated concrete approvers;
7. validate the complete chain;
8. persist ordered approval steps as a snapshot;
9. mark the first step pending and later steps waiting;
10. commit request + chain + audit atomically;
11. enqueue notifications after commit.

If a mandatory resolver cannot find a valid approver, the request must **not** enter a partially resolved chain. Submission fails with an actionable configuration error.

## Chain validation

### No self-approval

A requester must not approve their own request.

If a resolver returns the requester, the workflow may use only a documented fallback. If no valid fallback exists, submission fails as a configuration error.

### Duplicate approver

The same person should not approve the same sequential request twice merely because multiple semantic steps resolved to them.

Example under a vacancy fallback:

```text
DIRECT_MANAGER -> Director
UNIT_APPROVER  -> Director
```

Stored chain:

```text
Director
```

not:

```text
Director -> Director
```

A domain may require two different decisions from the same actor only if that exception is explicitly specified.

### Active approver

A newly resolved approver must be active and possess the capability required by the workflow when the chain is created.

## Snapshot rule

After the chain is stored, changes to any of the following do not rewrite it:

- manager;
- unit;
- position;
- position incumbent;
- acting assignment;
- organization parent relationship;
- authority binding;
- role/scope;
- future restructure.

An existing request changes only through normal decisions, cancellation where the domain permits it, or authorized reassignment.

ORG-004 must preserve this rule during and after migration.

## Generic request state

```text
draft
  -> submitted
submitted
  -> in_review
in_review
  -> approved
  -> rejected
  -> cancelled
approved/rejected/cancelled
  -> terminal
```

A module may add documented domain-specific states.

## Approval-step state

```text
waiting
pending -> approved
pending -> rejected
pending -> reassigned
waiting -> pending
```

`waiting` means the step already belongs to the snapshot but is not active yet.

## Decision behavior

Only the valid current approver may decide the current step.

### Approve

- current step -> `approved`;
- next step -> `pending`;
- if no next step exists, request -> `approved`.

### Reject

- current step -> `rejected`;
- request -> `rejected`;
- later steps do not run.

### Cancel

Requester cancellation is allowed only in states explicitly permitted by the domain. Cancellation never deletes step history.

## Reassignment

If an approver already stored in the snapshot can no longer act, an authorized administrator may reassign the specific step.

Reassignment must store:

- changed step;
- previous approver;
- new approver;
- acting administrator;
- reason;
- timestamp;
- audit correlation ID.

Reassignment does not recompute the entire chain from the latest organization structure.

## Required data

Store at minimum:

- request type and request ID;
- requester ID;
- relevant organization context snapshot/explanation;
- workflow/template version;
- ordered steps;
- resolver type and parameter;
- resolved approver principal;
- enough resolution metadata to explain why that person was selected;
- state per step;
- decision timestamp;
- decision note/reason where required;
- version/concurrency token;
- audit correlation ID.

When ORG-004 becomes authoritative, resolution metadata should be sufficient to trace the structural path used at submission without making the chain dynamic.

## Concurrency

Two actions must not win the same transition.

Decision handling uses transaction and locking/version checks so double-clicks, retries, or parallel requests produce only one final transition.

## Notifications

Notification is not the source of truth for approval.

- decision commits first;
- notification intent is persisted/enqueued after the relevant committed state transition;
- notification delivery may be retried;
- retry must not repeat the decision.

### One-level-above line/governance notification

Implemented ORG-004 rule for leave workflows that contain line/governance approval:

> After the **overall request reaches final `approved`**, notify one structural layer above the **final line/governance approver**.

This is informational only and does not create another approval step.

This distinction matters when a workflow continues after line approval through HC validation or actual HC approval. Human Capital does not become the structural oversight reference merely because HC acts later in the workflow.

Examples:

```text
Annual leave:
Teacher
-> Curriculum Vice Principal approves
-> Head of SDIT approves            [final line approver]
-> overall request approved
-> Director notified
```

```text
Planned leave:
Employee
-> Direct Manager
-> Unit Approver                     [final line approver]
-> HC validates
-> overall request approved
-> one level above Unit Approver notified
```

```text
Unpaid leave:
Employee
-> Unit Approver                     [final line approver]
-> HC actual approval
-> overall request approved
-> one level above Unit Approver notified
```

```text
Director leave:
Director
-> Secretary of the Foundation approves  [final governance approver]
-> overall request approved
-> Chair of the Foundation notified
```

Pembina/Foundation Supervisor is not included by the Director rule.

The target resolution behavior is defined by ORG-004. The recipient may be resolved against the effective structure when final approval commits, then persisted on the notification intent. Concrete approval authority remains snapshotted at submission.

The ORG-004 rollout mode used at submission is part of that immutable resolution context. A later rollout-setting change must not introduce STRUCTURE routing or structural oversight into a request submitted under `LEGACY` or `SHADOW`, nor remove STRUCTURE oversight from a request that was already submitted under `STRUCTURE`.

Existing HC-role notification requirements remain separate and additive where a leave policy already requires them.

## Examples

### Annual leave — verified MVP authority pattern

```text
Employee
  -> DIRECT_MANAGER
  -> UNIT_APPROVER
```

The concrete employees are resolved at submission and snapshotted.

### Reimbursement example

```text
Employee
  -> DIRECT_MANAGER
  -> ORG_ROLE(FINANCE)
```

If a later policy requires a Management step above a threshold, that becomes a documented workflow variant selected at submission and then snapshotted.

## Audit minimum

Audit events are created for:

- chain created;
- step approved;
- step rejected;
- request cancelled;
- step reassigned;
- relevant configuration failure.

When ORG-004 is used, the audit/resolution explanation must allow operators to understand which effective structural relationship produced each concrete approver.

## Acceptance criteria

- APR-001-A: the complete chain is resolved and stored when submission succeeds.
- APR-001-B: hierarchy/organization changes after submission do not modify an existing chain.
- APR-001-C: requester cannot self-approve.
- APR-001-D: duplicate concrete approvers do not create repeated sequential approvals without an explicit domain reason.
- APR-001-E: a mandatory resolver failure causes clear submission failure rather than a stuck request.
- APR-001-F: an actor without the current task receives forbidden.
- APR-001-G: duplicate decision submission produces only one final transition.
- APR-001-H: reassignment requires permission, old/new approver, actor, and reason.
- APR-001-I: decisions and reassignment produce audit events.
- APR-001-J: notification delivery can retry without repeating the approval transition.
- APR-001-K: ORG-004 structural resolution, when activated, still produces a concrete immutable snapshot at submission.
- APR-001-L: structural vacancy fallback cannot bypass self-approval, duplicate, active-employee, capability, or fail-closed validation.
- APR-001-M: after overall final approval, the planned structural oversight notification is resolved from the final line/governance approver rather than automatically from a later HC validator/approver.
- APR-001-N: the oversight notification remains informational and is never converted into an implicit extra approval step.

## Deferred unless separately specified

- parallel approval;
- quorum/N-of-M;
- generic delegation engine;
- generic escalation timer;
- generic expiry;
- generic auto-approval;
- generic visual workflow builder.

The ORG-004 Organization Designer is an organization/authority configuration tool, not a generic workflow/BPMN builder.
