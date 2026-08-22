# Dynamic Organization Structure and Authority Resolution

**Status:** ACCEPTED DESIGN DIRECTION — IMPLEMENTATION NOT STARTED  
**Specification:** ORG-004  
**Related:** ORG-001, ORG-002, AUTH-010, APR-001, LEAVE-003, LEAVE-004  
**Decision date:** 2026-08-22

## Purpose

YSQ is a private foundation whose organization can change frequently. HCIS must therefore treat organization structure, reporting relationships, authority, vacancies, and acting assignments as **effective-dated configuration data**, not source-code assumptions.

Target outcome:

> YSQ must be able to restructure the organization through an administrative UI without requiring application source-code changes.

A new directorate, division, head position, supervisory layer, temporary acting appointment, changed approval relationship, or future restructure should be represented by data/configuration. Existing submitted transactions must retain their historical approval snapshots.

## Design principles

1. **Structure is data, not code.**
   - Do not encode title checks such as `if title == Director`.
   - Do not encode workflow logic from numeric organization levels.
   - Do not infer authority from free-text job titles.

2. **Structure, authority, and workflow policy are separate layers.**
   - Structure: *how is YSQ arranged?*
   - Authority: *who is responsible for whom?*
   - Workflow policy: *which authority is required for this process?*

3. **Position, job profile, and employee are different concepts.**
   - Job profile: type of work, e.g. `Teacher`.
   - Organizational position/seat: authority-bearing place in the structure, e.g. `Head of SDIT`.
   - Employee: person who may occupy a position for an effective period.
   - A position remains in the structure while vacant.

4. **Structure provides defaults; explicit override handles exceptions.**
   - Do not configure the same manager individually for dozens of employees when one team/position relationship can define it once.
   - Allow effective-dated employee reporting override for a real exception.

5. **Vacancy behavior is explicit.**
   - Supervisory resolution may climb past vacant positions.
   - Sensitive authorities may require acting authority or block.
   - Never choose an arbitrary fallback person.

6. **Effective dating is mandatory.**
   - Historical, current, and scheduled future structure must be distinguishable.

7. **Approval snapshots remain immutable.**
   - Dynamic structure changes resolver inputs for new transactions only.
   - Concrete approvers already stored on submitted requests do not change automatically.

## Three-layer model

### Organization structure

Example only; the model must not assume this shape is permanent:

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

### Authority relationships

Initial semantic vocabulary:

- `supervisory_parent`
- `leader_of`
- `member_of`
- `unit_approver`
- `governance_approver`
- `oversight_parent`
- documented employee reporting override

Relationships should point to structural entities or positions whenever possible, not permanently hardcode the current person.

### Workflow policy

Workflow templates refer to semantic authority, not names.

Example annual leave policy:

```text
Step 1: resolve DIRECT_MANAGER
Step 2: resolve UNIT_APPROVER
After overall final approval: notify ONE_LEVEL_ABOVE_FINAL_LINE_APPROVER
```

The organization resolver converts semantic requirements into concrete employees for the relevant effective date.

## Core domain concepts

### Organizational Node

A grouping such as foundation/governance group, directorate, school/unit, division, department, or team.

Minimum concept:

- stable UUID;
- name;
- type/classification;
- parent relationship;
- active state;
- effective-from / effective-to;
- optional integration code;
- audit metadata.

Node type/depth may help presentation, but workflow logic must not depend on a hardcoded numeric level.

### Job Profile

Describes the type of work, e.g. Teacher or Finance Staff.

A job profile is not an authority-bearing seat and does not automatically define approval routing.

### Organizational Position / Seat

Examples:

- Director;
- Secretary of the Foundation;
- Head of SDIT;
- Curriculum Vice Principal;
- Head of Social Division.

A seat belongs to the structure and may have a structural parent. It may exist without an incumbent.

### Membership

Connects an employee to a team/node for an effective period.

Example:

```text
Employee: Ahmad
Job profile: Teacher
Member of: SDIT / Curriculum
```

All ordinary members of one team may derive the same structural leader without repeated employee-by-employee manager setup.

### Position Assignment / Incumbency

Connects an employee to an organizational position for an effective period.

Support at least:

- primary/permanent incumbent;
- acting/temporary authority assignment.

Acting authority must be explicit, effective-dated, and audited.

### Employee Reporting Override

Exceptional effective-dated reporting relationship for one employee when reality differs from the structural default.

Record at minimum employee, override authority, effective dates, reason, actor, and audit event.

### Authority Binding

Associates authority with a structural position/node.

Examples:

```text
SDIT
unit_approver -> Head of SDIT
```

```text
Director position
governance_approver -> Secretary position
```

The binding resolves the effective incumbent; it does not permanently bind the workflow to today's employee.

### Vacancy Policy

Initial vocabulary:

- `CLIMB_TO_PARENT`
- `REQUIRE_ACTING_OR_BLOCK`
- `BLOCK`

Direct-manager resolution should normally support structural climbing. Higher-risk authorities may use stricter behavior.

## Structural direct-manager resolution

For an ordinary employee:

1. use an effective employee-specific override if one exists;
2. otherwise locate the employee's effective team/node leader or supervisory position;
3. resolve the effective authority-bearing incumbent;
4. if vacant and climbing is allowed, move upward through supervisory parents;
5. stop at the first valid active employee;
6. fail closed if the root is reached without a valid manager.

For a position incumbent, begin from the position's supervisory parent instead of the member team's leader.

Required safeguards:

- self-resolution rejection;
- cycle detection;
- bounded traversal;
- effective-date validation;
- active employee/account validation;
- no arbitrary fallback;
- actionable configuration failure when unresolved.

## Vacancy example: Social Division

```text
Director
  |
Head of Social Division   [VACANT]
  |
Social Staff
```

Resolution:

```text
Social Staff
-> Head of Social Division [vacant]
-> climb
-> Director [occupied]
```

Result:

```text
Social Staff -> Director
```

The vacant position stays visible in the chart.

Multiple consecutive vacancies may be traversed until a valid authority is found or the configured root/fail-closed condition is reached.

## Acting authority

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

After the acting period ends, normal vacancy policy resumes if the seat is still vacant.

A temporary authority transfer must be explicit; it must not be inferred merely because a primary incumbent is absent.

## Unit approver resolution

A unit should bind approval authority to a **position**, not repeatedly to individual employees.

```text
SDIT
unit_approver -> Head of SDIT
```

Changing the incumbent automatically changes the resolver result for future requests. The concrete employee is still snapshotted at request submission.

Vacancy behavior is configurable. Leave may permit climbing where explicitly enabled; financial/high-risk workflows may require acting authority or block.

## Director governance rule

Accepted YSQ rule:

```text
Director requester
-> Secretary of the Foundation APPROVES
-> request reaches final APPROVED
-> Chair of the Foundation is NOTIFIED
```

Pembina/Foundation Supervisor is not notified by this rule.

Model this as data:

```text
Director position
governance_approver -> Secretary position

Secretary position
oversight_parent -> Chair position
```

Do not implement title-specific source-code branches.

If the governance rule changes next year, change the authority binding. Existing submitted approval snapshots remain unchanged.

## One-level-above post-approval notification

Accepted rule:

> Every leave workflow that contains a line/governance approval stage should, after the **overall request reaches final `approved`**, notify one structural layer above the **final line/governance approver**.

This wording intentionally separates line/governance authority from Human Capital validation or approval.

Examples:

### Annual leave

```text
Teacher
-> Curriculum Vice Principal APPROVES
-> Head of SDIT APPROVES        [final line approver]
-> overall request APPROVED
-> Director NOTIFIED
```

### Planned leave with later HC validation

```text
Employee
-> Direct Manager
-> Unit Approver                [final line approver]
-> HC validates administration
-> overall request APPROVED
-> one layer above Unit Approver NOTIFIED
```

HC validation does not change the structural oversight target.

### Unpaid leave

```text
Employee
-> Unit Approver                [final line approver]
-> HC actual approval
-> overall request APPROVED
-> one layer above Unit Approver NOTIFIED
```

HC's own supervisor is not automatically the oversight recipient merely because HC is the final workflow approver.

### Director

```text
Director
-> Secretary APPROVES           [final governance approver]
-> overall request APPROVED
-> Chair NOTIFIED
```

The notification:

- is emitted only after final approval;
- is informational only;
- does not create another approval step;
- does not block the completed workflow if delivery fails;
- is stored as a notification intent/auditable event;
- applies to line/governance-approved leave unless a future policy explicitly opts out.

The structural recipient may be resolved against the effective organization when final approval commits, then persisted on the notification intent. Concrete approval authority remains snapshotted at submission.

Existing HC-role notification requirements remain separate and additive where the leave policy already requires them.

## Approval resolution and snapshot

At submission:

1. load effective organization/authority configuration;
2. resolve semantic workflow steps to concrete employees;
3. apply effective acting, vacancy, and override rules;
4. reject self-approval;
5. deduplicate repeated concrete approvers;
6. validate account/capability;
7. persist concrete ordered approval steps;
8. persist enough structural resolution context for audit/explanation.

Example:

```text
Requester: Teacher Ahmad
Curriculum leader incumbent: Yusuf
SDIT unit approver incumbent: Hasan

Snapshot:
Step 1 -> Yusuf
Step 2 -> Hasan
```

A later restructure does not rewrite this request. New requests use the new effective structure.

## Deduplication after vacancy fallback

Example:

```text
Requester: Social Staff
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

APR-001 self-approval and duplicate rules remain mandatory.

## Effective dating

Structural relationships and assignments that can change over time must be effective-dated.

Example:

```text
Curriculum Vice Principal
Ahmad: 2026-01-01 through 2026-12-31
Yusuf: 2027-01-01 onward
```

Admin UX should allow viewing:

- past structure;
- current structure;
- scheduled future structure.

Historical structure must not be overwritten when current structure changes.

## Draft, validate, preview, publish

Future restructure should be preparable before activation.

```text
Draft restructure
Effective: 2027-01-01

+ Add Head of Education Affairs
+ Move Head of SDIT under Head of Education Affairs
+ Assign incumbent
```

Lifecycle:

```text
DRAFT
-> VALIDATE
-> PREVIEW IMPACT
-> PUBLISH
-> becomes effective on configured date
```

Publishing validates at least:

- no structural cycles;
- valid parent references;
- valid effective-date ranges/no illegal overlaps;
- valid employee state;
- no duplicate active primary incumbent where single occupancy is required;
- resolvable or intentionally vacant required authority;
- no unbounded authority loop.

## Organization Designer UX

Target experience is a visual organization designer, not only maintenance tables.

Illustrative chart:

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

Vacancy remains visible:

```text
Director
  |
Head of Social Division
[VACANT - fallback: climb]
  |
Social Staff [5]
```

Minimum planned actions:

- add organizational node/team;
- add authority-bearing position;
- move node/position to another parent;
- assign/replace primary incumbent;
- assign acting incumbent with effective dates;
- bulk-manage team membership;
- configure team leader;
- configure unit/governance authority bindings;
- configure allowed vacancy policy;
- set effective dates;
- deactivate without deleting history;
- create employee reporting override with reason;
- preview resolved approval chain for an employee;
- preview draft-restructure impact;
- inspect structure by effective date;
- publish validated future changes.

## Do not use numeric organization level as workflow logic

The UI may display a level/depth for readability. Workflow logic must follow semantic relationships, not `level N -> level N-1` arithmetic.

This allows a restructure such as:

```text
2026:
Director -> Head of SDIT

2027:
Director -> Head of Education Affairs -> Head of SDIT
```

without workflow source-code changes.

## Multiple hierarchy types

Initial ORG-004 should support only what current YSQ workflows require:

1. supervisory/operational structure;
2. governance approval/oversight relationships;
3. documented employee reporting override.

A generic matrix/dotted-line engine is deferred until a concrete YSQ requirement exists.

## Access and security boundary

Organization structure does not replace RBAC.

Requirements:

- backend authorization remains authoritative;
- position/responsibility grants capability only through explicit documented binding;
- structure edits, publish, incumbency, acting assignment, authority binding, and override changes are audited;
- structure never silently grants `SUPER_ADMIN`;
- free-text title or numeric level never grants permission;
- Foundation Board account type remains distinct from operational employee authority unless an explicit mapping specification is approved.

## Compatibility with the verified MVP

The verified MVP uses explicit current Direct Manager and Unit Approver relationships. ORG-004 is a planned successor, not a claim about current runtime behavior.

Recommended migration:

### Phase 1 — model + read-only visualization

- add effective-dated nodes, positions, memberships, incumbencies;
- map current references without changing approval authority;
- render read-only chart;
- identify ambiguous/missing mappings.

### Phase 2 — configuration + preview

- Organization Designer editing;
- draft/effective-date validation;
- acting/vacancy visualization;
- approval-chain preview;
- current MVP resolver remains production authority.

### Phase 3 — shadow resolver

- resolve using current explicit model and ORG-004 in parallel;
- compare results without changing transactions;
- investigate mismatches using real YSQ structure.

### Phase 4 — controlled activation

- activate structure-driven resolution for selected units/workflows;
- preserve employee override for exceptions;
- record resolver/version used for each chain;
- preserve snapshot invariants.

### Phase 5 — structure authoritative

- structural resolution becomes normal administration;
- legacy per-employee manager setup becomes compatibility/exception behavior;
- ordinary restructuring requires no source-code change.

Existing submitted snapshots are never recomputed during migration.

## Required planning scenarios

- Many employees share one team leader without repeated manager setup.
- Individual employee reporting exception.
- One or multiple vacant supervisory positions.
- Effective acting appointment.
- Future-dated restructure with inserted/removed hierarchy layers.
- Director leave: Secretary approves, Chair notified, Pembina not notified.
- Duplicate approver created by vacancy fallback is deduplicated.
- Higher-risk authority can block rather than climb.

## Acceptance criteria

- ORG-004-A: ordinary restructuring is configuration/data, not application source-code change.
- ORG-004-B: job profile, node, position, employee membership, and incumbency are distinct concepts.
- ORG-004-C: vacant positions remain visible and historical.
- ORG-004-D: team members derive default direct manager from structure without repetitive per-employee setup.
- ORG-004-E: employee reporting overrides are effective-dated, exceptional, and audited.
- ORG-004-F: direct-manager resolution can climb through multiple vacant supervisory positions.
- ORG-004-G: effective acting authority is honored before applicable vacancy fallback.
- ORG-004-H: sensitive authority may require acting or block instead of always climbing.
- ORG-004-I: traversal rejects cycles, invalid incumbents, and unresolved roots.
- ORG-004-J: structure/incumbency is effective-dated with historical/current/future view.
- ORG-004-K: future restructure can be drafted, validated, impact-previewed, and published before its effective date.
- ORG-004-L: semantic authority resolves to concrete employees and approval steps are snapshotted at submission.
- ORG-004-M: vacancy fallback cannot bypass self-approval/duplicate/capability validation.
- ORG-004-N: after overall final approval, leave with line/governance approval notifies one layer above the final line/governance approver; HC validation/approval does not redefine that target by default.
- ORG-004-O: Director leave resolves Secretary as approver and Chair as post-approval recipient; Pembina is not included by this rule.
- ORG-004-P: Organization Designer exposes nodes, positions, vacancies, incumbents, memberships, authority relationships, effective dates, and draft/publish state visually.
- ORG-004-Q: structure does not bypass RBAC or imply Super Admin authority.
- ORG-004-R: existing submitted approval snapshots are never rewritten by restructure or ORG-004 migration.

## Explicit non-goals for initial ORG-004

- generic visual workflow/BPMN builder;
- parallel approval/quorum;
- generic delegation engine beyond explicit acting authority needed by organization structure;
- payroll/grading hierarchy;
- succession planning;
- generic matrix organization without a real YSQ requirement;
- inference of authority from job-title text;
- deleting historical structure on restructure.

## Product decision summary

Accepted direction:

```text
Structure-driven defaults
+ effective-dated nodes/positions/incumbencies
+ acting authority
+ vacancy fallback
+ explicit exception override
+ semantic authority binding
+ approval snapshot at submission
+ one-level-above final-line-authority notification after overall final approval
+ visual Organization Designer
```

This is the planning baseline for replacing repetitive current-state organization administration with a modular, restructuring-safe organization foundation.
