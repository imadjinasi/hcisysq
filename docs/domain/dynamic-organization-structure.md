# Dynamic Organization Structure and Authority Resolution

**Status:** ACCEPTED DESIGN DIRECTION — IMPLEMENTATION NOT STARTED  
**Specification:** ORG-004  
**Related:** ORG-001, ORG-002, AUTH-010, APR-001, LEAVE-003, LEAVE-004  
**Decision date:** 2026-08-22

## Purpose

YSQ is a private foundation whose organization can change frequently. HCIS must therefore treat organization structure, reporting relationships, authority, vacancies, and acting assignments as **effective-dated configuration data**, not source-code assumptions.

The target outcome is simple:

> YSQ must be able to restructure the organization through an administrative UI without requiring application source-code changes.

A new directorate, division, head position, supervisory layer, temporary acting appointment, or changed approval relationship should be represented by data/configuration. Existing submitted transactions must retain their historical approval snapshots.

## Design principles

1. **Structure is data, not code.**
   - Do not encode rules such as `if title == Director` or `if level == 3` in workflow code.
   - Do not infer authority from free-text job titles.

2. **Structure, authority, and workflow policy are separate layers.**
   - Organization structure answers: *how is YSQ arranged?*
   - Authority relationships answer: *who is responsible for whom?*
   - Workflow policy answers: *which authority is required for this business process?*

3. **Positions are different from job profiles and employees.**
   - A job profile describes a kind of work, for example `Teacher` or `Finance Staff`.
   - An organizational position/seat carries structural responsibility, for example `Head of SDIT`, `Curriculum Vice Principal`, or `Director`.
   - An employee may occupy a position for a defined effective period.
   - A position may exist while vacant.

4. **Bulk structure should replace repetitive employee-by-employee setup.**
   - A group of teachers should normally belong to one organizational node/team whose leader position is configured once.
   - HC should not need to assign the same direct manager individually to dozens of employees.

5. **Explicit exceptions remain possible.**
   - Structure provides the default.
   - A documented effective-dated employee override may be used when a real reporting exception exists.

6. **Vacancy behavior is explicit and policy-aware.**
   - Supervisory resolution may climb past vacant positions.
   - Sensitive authority may instead require an acting assignment or fail closed.
   - Vacancy handling must never select an arbitrary employee.

7. **Effective dating is mandatory.**
   - Historical, current, and scheduled future structures must be distinguishable.
   - A future restructure may be prepared before its effective date.

8. **Approval snapshots remain immutable.**
   - Structure is dynamic.
   - A submitted transaction resolves concrete approvers once and stores them as a snapshot according to APR-001.

## Three-layer model

### 1. Organization structure

Represents the organization itself.

Examples:

```text
YSQ
|
+-- Foundation Governance
|   +-- Chair
|   +-- Secretary
|   +-- Director
|
+-- SDIT
|   +-- Head of SDIT
|   +-- Curriculum
|   |   +-- Curriculum Vice Principal
|   |   +-- Teachers
|   +-- Student Affairs
|       +-- Student Affairs Vice Principal
|       +-- Teachers / Staff
|
+-- Social Division
|   +-- Head of Social Division
|   +-- Social Staff
|
+-- Human Capital
    +-- Head of Human Capital
    +-- Human Capital Staff
```

The model must not assume this exact tree is permanent.

### 2. Authority relationships

Represents structural responsibility and decision authority.

Initial relationship vocabulary:

- `supervisory_parent`
- `leader_of`
- `member_of`
- `unit_approver`
- `governance_approver`
- `oversight_parent`
- documented employee-level override

A relationship should point to a structural entity or authority-bearing position whenever possible, not directly hardcode a person.

### 3. Workflow policy

A workflow refers to authority resolvers, not named employees.

Example annual leave policy:

```text
Step 1: resolve DIRECT_MANAGER
Step 2: resolve UNIT_APPROVER
After final approval: notify ONE_LEVEL_ABOVE_FINAL_APPROVER
```

The organization resolver converts those semantic requirements into concrete employees for the relevant effective date.

## Core entities

The exact physical schema may vary during implementation, but the domain model must preserve the following concepts.

### Organizational Node

A structural grouping such as:

- foundation/governance group;
- directorate;
- school/unit;
- division;
- department;
- team.

Suggested properties:

- stable UUID;
- display name;
- node type;
- parent node relationship;
- active/inactive state;
- effective-from / effective-to;
- optional code for integrations;
- audit metadata.

Node type is classification and presentation metadata. Workflow logic must not depend on a hardcoded numeric node level.

### Job Profile

Describes a type of work, for example:

- Teacher;
- Finance Staff;
- Human Capital Staff.

A job profile is **not** an approval position and must not automatically define reporting authority.

### Organizational Position / Seat

Represents a structural seat that may carry responsibility, for example:

- Director;
- Secretary of the Foundation;
- Head of SDIT;
- Curriculum Vice Principal;
- Head of Social Division.

Suggested properties:

- stable UUID;
- name;
- owning organizational node;
- structural parent position or parent supervisory node;
- authority flags/bindings defined separately;
- effective-from / effective-to;
- active/inactive state.

A seat remains in the structure when vacant.

### Membership

Connects an employee to an organizational node/team for an effective period.

Example:

```text
Employee: Ahmad
Job profile: Teacher
Member of: SDIT / Curriculum
```

All ordinary members of the same team may inherit the same structural leader without repeating an individual manager assignment.

### Position Assignment / Incumbency

Connects an employee to an organizational position for an effective period.

Assignment kinds should support at least:

- primary/permanent incumbent;
- acting/temporary authority assignment.

An acting assignment must have explicit effective dates and audit context. It participates in authority resolution only when its mandate is effective for the relevant date.

### Employee Reporting Override

An exceptional effective-dated relationship that replaces the structure-derived direct manager for one employee.

Use only when reality differs from the structural default. It must record:

- employee;
- override manager or authority-bearing position;
- effective dates;
- reason;
- actor;
- audit event.

The override is the exception, not the primary organization-management mechanism.

### Authority Binding

Associates an authority responsibility with a structural position or node.

Examples:

```text
SDIT
unit_approver -> Head of SDIT
```

```text
Director position
governance_approver -> Secretary of the Foundation
```

The binding should resolve the **effective incumbent**, not store the current employee as a permanent rule.

### Vacancy Policy

Defines what happens when a required authority-bearing position has no effective incumbent.

Initial policy vocabulary:

- `CLIMB_TO_PARENT`
- `REQUIRE_ACTING_OR_BLOCK`
- `BLOCK`

`DIRECT_MANAGER` should default to structural climbing because operational supervision must remain resolvable when an intermediate position is vacant.

High-risk authorities may choose a stricter vacancy policy.

## Structural direct-manager resolution

### Ordinary member

For an employee who is an ordinary member of a team/node:

1. check for an effective employee-specific reporting override;
2. otherwise identify the configured structural leader/supervisory position for the employee's effective membership;
3. resolve its effective authority-bearing incumbent;
4. if vacant and the relationship allows climbing, continue upward through supervisory parents;
5. stop at the first valid active employee found;
6. fail closed if the root is reached without a valid manager.

### Position incumbent

For an employee occupying an authority-bearing position:

1. identify the effective supervisory parent position/authority;
2. resolve its effective incumbent;
3. if vacant and climbing is allowed, continue upward;
4. reject self-resolution;
5. fail closed if no valid authority exists.

### Vacancy example: Social Division

Structure:

```text
Director
  |
Head of Social Division   [VACANT]
  |
Social Staff
```

For a Social Staff employee:

```text
DIRECT_MANAGER
-> Head of Social Division
-> vacant
-> climb to supervisory parent
-> Director
```

Resolved direct manager:

```text
Social Staff -> Director
```

The vacant Head of Social Division position remains visible in the organization chart. The structure is not rewritten merely because the seat is empty.

### Multiple consecutive vacancies

```text
Director
  |
Head of Social Affairs      [VACANT]
  |
Head of Social Division     [VACANT]
  |
Social Staff
```

Resolution may continue:

```text
Social Staff
-> Head of Social Division [vacant]
-> Head of Social Affairs [vacant]
-> Director [occupied]
```

Required safeguards:

- cycle detection;
- bounded traversal;
- effective-date checks;
- active-employee checks;
- no arbitrary fallback;
- actionable configuration failure when no authority can be resolved.

## Acting assignments

Vacancy climbing must not ignore a valid acting authority.

Example:

```text
Head of Social Division
Primary incumbent: vacant
Acting incumbent: Yusuf
Effective: 2026-09-01 through 2026-12-31
```

During the acting period:

```text
Social Staff -> Yusuf
```

After the acting period ends, if the seat remains vacant, the configured vacancy policy applies again.

If an acting assignment is intended to supersede a temporarily unavailable primary incumbent, that authority transfer must be explicit and effective-dated rather than inferred from absence.

## Unit approver resolution

A unit should bind approval responsibility to a **position**, not repeatedly to individual employees.

Example:

```text
SDIT
unit_approver -> Head of SDIT
```

Changing the incumbent of `Head of SDIT` changes the approver for future requests automatically.

The leave resolver receives the concrete incumbent at submission time and snapshots that employee in the request.

Vacancy behavior for `UNIT_APPROVER` is configurable. The default for leave may climb to the next authorized structural parent when explicitly enabled, but financial or higher-risk workflows may require acting authority or fail closed.

## Director governance rule

The accepted YSQ rule for Director leave is:

```text
Director requester
-> Secretary of the Foundation APPROVES
-> request becomes APPROVED
-> Chair of the Foundation is NOTIFIED
```

The Foundation Supervisor/Pembina is **not** notified by this rule.

This must be represented as structural configuration:

```text
Director position
governance_approver -> Secretary position

Secretary position
oversight_parent -> Chair position
```

The source code must not contain a special check for a title string such as `Director` or `Secretary`.

If YSQ later changes the governance rule so the Chair approves the Director directly, the administrator changes the authority binding. Existing submitted approval snapshots remain unchanged.

## One-level-above post-approval notification

Accepted rule:

> For every line-approved leave request, after the request reaches final `approved`, notify one structural layer above the final approver.

This notification:

- occurs **after final approval**;
- is informational only;
- does not create another approval step;
- does not block completion if delivery fails;
- is recorded as a notification intent/audit-relevant event;
- applies to all line-approved leave workflows unless a future policy explicitly opts out.

Example:

```text
Teacher
-> Curriculum Vice Principal APPROVES
-> Head of SDIT APPROVES
-> APPROVED
-> Director NOTIFIED
```

Director example:

```text
Director
-> Secretary APPROVES
-> APPROVED
-> Chair NOTIFIED
```

For this informational event, the recipient should normally be resolved against the effective structure when the final approval is committed, then persisted on the notification intent. Approval authority itself remains snapshotted at submission.

## Approval resolution and snapshots

The dynamic organization model does not change APR-001's core invariant.

At submission:

1. load the effective organization/authority configuration;
2. resolve semantic workflow steps to concrete employees;
3. apply vacancy policies and overrides;
4. reject self-approval;
5. deduplicate repeated approvers;
6. validate employee/account capability;
7. persist concrete approval steps as an immutable snapshot;
8. persist enough structural context to explain how each approver was resolved.

Example:

```text
Requester: Teacher Ahmad

Structure at submission:
Curriculum team leader -> Yusuf
SDIT unit approver -> Hasan

Snapshot:
Step 1 -> Yusuf
Step 2 -> Hasan
```

If the organization changes the next day, this request remains `Yusuf -> Hasan` unless an authorized reassignment occurs. A new request uses the new effective structure.

## Deduplication with vacancy fallback

Example:

```text
Requester: Social Staff
Head of Social Division: vacant
DIRECT_MANAGER resolves to Director
UNIT_APPROVER resolves to Director
```

The sequential approval snapshot must be:

```text
Director
```

not:

```text
Director -> Director
```

The existing no-self-approval and duplicate-approver invariants remain mandatory.

## Effective dating

Every structural relationship that can change over time should be effective-dated.

Examples:

```text
Curriculum Vice Principal
Ahmad: 2026-01-01 through 2026-12-31
Yusuf: 2027-01-01 onward
```

The admin UI must be able to display:

- past structure;
- current structure;
- scheduled future structure.

A date selector should allow an authorized administrator to answer:

> What did/will the organization look like on this date?

Historical records must not be mutated into the new structure merely because the current organization changed.

## Draft and publish model

Organization changes should support preparation before activation.

Example:

```text
Draft restructure
Effective date: 2027-01-01

+ Add Head of Education Affairs
+ Move Head of SDIT under Head of Education Affairs
+ Assign new incumbent
```

Expected lifecycle:

```text
DRAFT
-> VALIDATE
-> PREVIEW IMPACT
-> PUBLISH
-> becomes effective on configured date
```

Publishing must validate at least:

- no structural cycles;
- no invalid parent references;
- no illegal effective-date overlaps;
- required leadership/authority relationships are resolvable or intentionally vacant;
- no duplicate active primary incumbent where the seat requires one;
- no invalid employee status;
- no unbounded authority loop.

## Organization Designer UX

The target admin experience is a visual organization designer, not a table-only maintenance screen.

### Chart view

Illustrative view:

```text
                    Chair
                      |
                  Secretary
                      |
                   Director
                      |
          +-----------+-----------+
          |                       |
      Head of SDIT          Head of SMPIT
          |
   Curriculum Team
          |
Curriculum Vice Principal
          |
    Teachers [32]
```

Vacant seats remain visible:

```text
Director
  |
Head of Social Division
[VACANT - climbs to Director]
  |
Social Staff [5]
```

### Minimum admin actions

Authorized organization administrators should eventually be able to:

- add organizational nodes;
- add authority-bearing positions;
- move a node/position under another parent;
- assign or replace a primary incumbent;
- assign an acting incumbent with effective dates;
- bulk manage team membership;
- configure node leader;
- configure unit approver position;
- configure governance approver relationship;
- configure vacancy behavior where allowed;
- set effective dates;
- deactivate structure elements without deleting history;
- create an individual reporting override with reason;
- preview resolved approval chains for selected employees;
- preview the impact of a draft restructure;
- inspect historical/future charts by date;
- publish a validated structure change.

### Position detail

Example:

```text
Position: Head of SDIT
Node: SDIT
Reports to: Director
Primary incumbent: Hasan
Acting incumbent: none
Unit approver: yes
Vacancy behavior for leave: climb to parent authority
Effective: 2026-01-01 onward
```

### Team detail

Example:

```text
Node: SDIT / Curriculum
Leader position: Curriculum Vice Principal
Members: 32 employees

[Manage members]
[Change leader position]
[Schedule restructure]
```

## Do not use numeric level as workflow logic

The visual designer may display depth/level for readability, but workflow behavior must not be written as:

```text
level 4 -> level 3 approver
```

Organization depth can change after restructuring. Resolution must follow semantic relationships such as `supervisory_parent`, `unit_approver`, and `governance_approver`.

## Multiple hierarchy types

YSQ may eventually need more than one organizational relationship, for example:

- supervisory/operational reporting;
- governance authority;
- functional/dotted-line reporting.

ORG-004 should initially implement only what is required by real YSQ workflows:

1. supervisory structure;
2. governance approval/oversight relationships;
3. documented employee reporting override.

A generic matrix-organization engine is out of scope until a concrete use case requires it.

## Access and security boundary

Organization structure does not replace RBAC.

An employee occupying a position may receive authority/capabilities only through an explicit documented binding between the structural responsibility and a role/permission model.

Requirements:

- backend remains authoritative;
- structure edits require explicit admin permission;
- draft/publish actions are audited;
- incumbent/acting changes are audited;
- authority-binding changes are audited;
- overrides require actor, reason, and effective dates;
- structure must never silently grant `SUPER_ADMIN`;
- Foundation Board account type remains separate from employee operational authority unless an explicit employee/account relationship and permission model is designed.

## Compatibility with the verified MVP

The verified MVP currently uses explicit current-state employee manager and unit-approver relationships. ORG-004 is a planned successor, not a claim about current runtime behavior.

Migration must be incremental.

Recommended implementation sequence:

### Phase 1 — model and read-only visualization

- introduce effective-dated nodes, positions, memberships, and incumbencies;
- map existing unit/position/import references into the new model without changing current approvals;
- render a read-only organization chart;
- identify missing/ambiguous structural mappings.

### Phase 2 — configuration and preview

- add Organization Designer editing;
- add draft/effective-date validation;
- add acting assignments and vacancy visualization;
- add `preview resolved chain` for an employee;
- continue using current MVP resolver as production authority.

### Phase 3 — shadow resolver

- resolve approval chains using both the old explicit model and ORG-004;
- compare results without changing transactions;
- investigate mismatches;
- validate real YSQ structure.

### Phase 4 — controlled activation

- enable structure-driven resolution for selected units/workflows;
- preserve explicit employee overrides for exceptions;
- keep approval snapshot invariants unchanged;
- audit which resolver/version produced each chain.

### Phase 5 — structure becomes authoritative

- organization structure becomes the default source for reporting/authority resolution;
- legacy per-employee direct-manager configuration becomes an exception/compatibility mechanism rather than normal administration;
- no source-code change is required for ordinary restructuring.

Existing submitted approval snapshots must never be recomputed during any migration phase.

## Planning scenarios that must be supported

### Scenario A — many employees share one leader

Thirty-two teachers belong to `SDIT / Curriculum`.

One configuration:

```text
Curriculum leader position -> Curriculum Vice Principal
```

All members resolve the current effective incumbent as their default direct manager. No 32-row manager setup is required.

### Scenario B — individual exception

One coordinator reports directly to the Head of SDIT rather than the Curriculum Vice Principal.

Use an effective-dated employee reporting override. The rest of the team remains structure-derived.

### Scenario C — vacant intermediate position

```text
Director
-> Head of Social Division [vacant]
-> Social Staff
```

Direct manager for Social Staff resolves to Director.

### Scenario D — acting appointment

Head of Social Division is vacant, but Yusuf is appointed acting head for three months.

During that effective period, Yusuf resolves as the authority. After expiry, normal vacancy fallback resumes.

### Scenario E — restructure next year

2026:

```text
Director
-> Head of SDIT
```

2027:

```text
Director
-> Head of Education Affairs
-> Head of SDIT
```

Admin schedules the new layer effective 2027-01-01. No workflow source code changes.

### Scenario F — Director leave

```text
Director submits leave
-> Secretary approves
-> request approved
-> Chair notified
```

Pembina is not notified by this rule.

## Acceptance criteria

- ORG-004-A: ordinary organization restructuring can be performed as data/configuration without application source-code changes.
- ORG-004-B: job profile, organizational node, authority-bearing position, employee membership, and position incumbency are distinct concepts.
- ORG-004-C: a position remains in the chart when vacant.
- ORG-004-D: ordinary team members inherit their default direct manager from structure without repetitive employee-by-employee configuration.
- ORG-004-E: documented employee-level reporting overrides are effective-dated and auditable.
- ORG-004-F: direct-manager resolution can climb through one or more vacant supervisory positions until a valid effective authority is found.
- ORG-004-G: an effective acting authority is honored before vacancy fallback where its mandate applies.
- ORG-004-H: vacancy behavior can be stricter for sensitive authorities and can fail closed instead of always climbing.
- ORG-004-I: structure traversal rejects cycles, invalid/inactive incumbents, and unresolved roots.
- ORG-004-J: structure and incumbent changes are effective-dated and historical/future views are available.
- ORG-004-K: administrators can prepare and validate a future restructure before its effective date.
- ORG-004-L: approval workflows resolve semantic authority to concrete employees and then store immutable approval snapshots.
- ORG-004-M: duplicate/self approvers created by structural fallback are removed/rejected according to APR-001.
- ORG-004-N: all line-approved leave requests create a post-final-approval notification intent for one structural layer above the final approver unless a future policy explicitly opts out.
- ORG-004-O: Director leave resolves Secretary as the approver and Chair as the post-approval notification recipient; Pembina is not included by this rule.
- ORG-004-P: the Organization Designer exposes nodes, positions, vacancies, incumbents, memberships, authority relationships, effective dates, and draft/publish state in an understandable visual model.
- ORG-004-Q: organization structure does not bypass backend RBAC or implicitly create `SUPER_ADMIN` access.
- ORG-004-R: existing submitted approval snapshots are never rewritten by restructuring or by migration to ORG-004.

## Explicit non-goals for the first ORG-004 implementation

- generic visual workflow builder;
- arbitrary BPMN engine;
- parallel approval/quorum;
- payroll or grading hierarchy;
- full succession planning;
- generic matrix/dotted-line organization engine without a concrete YSQ requirement;
- automatic inference of organization from job-title text;
- automatic legal/governance conclusions from titles;
- deleting historical structures when a restructure occurs.

## Product decision summary

The accepted planning direction is:

```text
Structure-driven defaults
+ effective-dated positions and incumbents
+ acting authority
+ vacancy fallback
+ explicit exception overrides
+ semantic authority bindings
+ approval snapshot at transaction submission
+ one-level-above notification after final approval
+ visual Organization Designer
```

This specification is the planning baseline for replacing repetitive current-state organization administration with a modular, restructuring-safe organization foundation.
