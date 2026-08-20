# Organization Mapping and Approval Context

**Status:** ACTIVE IMPLEMENTATION BASELINE  
**Specification:** ORG-002  
**Related:** ORG-001, APR-001, AUTH-010, EMP-001

## Purpose

Define a safe boundary between imported employee labels and the organization model that may influence authorization and approval routing.

Imported `UNIT`, `JABATAN`, `JABATAN FUNGSIONAL`, and `JABATAN STRUKTURAL` values are useful source labels, but they are **not approval rules** and must never be interpreted as an organization hierarchy by string matching.

## Core model

HCIS distinguishes these concepts:

```text
Job Profile
  = reusable definition of work / role nature

Position
  = one concrete seat in a unit/location, may be filled or vacant

Employee Assignment
  = employee (NIP) occupying a Position for an effective period

Reporting Line
  = explicit Position-to-Position or employee direct-manager relationship

Approval Role Assignment
  = explicit role + scope used by UNIT_ROLE / ORG_ROLE resolvers
```

A single Job Profile may be used by multiple Positions. A Position may be vacant. Employee identity is not part of the Job Profile definition.

## Imported data boundary

The employee import currently creates normalized unit and position references so employee master can be used immediately. Those references are treated as **source-derived labels** until reviewed.

Rules:

1. Never derive seniority from words such as `Kepala`, `Direktur`, `Koordinator`, `Wakil`, `Mudir`, or similar text.
2. Never derive parent unit from similar names or naming prefixes.
3. Never infer direct manager from unit + position labels alone.
4. Never convert a functional/centre-of-excellence relationship into line authority without an explicit approved reporting line.
5. Never treat governance/supervisory bodies as operational reporting lines unless explicitly configured for that purpose.
6. A source rename must not silently create a new approval hierarchy.

## Canonical mapping layer

Future organization implementation must preserve source labels through aliases rather than rewriting imported values destructively.

Conceptual mapping:

```text
source unit label
  -> reviewed unit alias
      -> canonical organization unit

source position/job label
  -> reviewed position alias
      -> canonical Job Profile
      -> concrete Position
```

Mapping records require a review state:

```text
unreviewed -> proposed -> approved
                    \-> rejected
```

Only `approved` canonical mappings may be used as organization context for authorization or approval resolvers.

## Position identity

`Job_Profile_ID` and `Position_ID` are intentionally different identifiers.

- `Job_Profile_ID` identifies a reusable job profile.
- `Position_ID` identifies a concrete seat in the organization.
- NIP identifies the employee occupying a seat.

HCIS must not collapse these three identities into one table or key.

## Vacant positions and acting arrangements

A vacant manager Position is valid organization data.

The system must not silently bypass a vacancy and assume the next visible manager. If work is temporarily reported to another person, that must be represented explicitly as an acting/temporary reporting assignment with:

- acting approver/manager;
- effective start;
- optional effective end;
- reason/mandate;
- administrator;
- audit trail.

If an approval resolver requires a manager and neither a filled manager Position nor an approved acting fallback exists, submission fails with an actionable configuration error as required by APR-001.

## Reporting line and approval safety

`DIRECT_MANAGER` resolves from explicit current reporting data, not from job title text.

`UNIT_ROLE(role_key)` and `ORG_ROLE(role_key)` resolve from explicit account role assignments and scope, not from position names.

At request submission:

1. read only approved organization/reporting configuration;
2. resolve concrete approvers;
3. reject self-approval and inactive approvers;
4. fail closed if a mandatory resolver is unresolved;
5. persist the complete approval chain snapshot;
6. never recompute an existing request when organization mapping later changes.

## Current-state versus target-state structure

HCIS must support organization change without rewriting history.

A proposed target structure is not automatically effective. Reporting-line changes require an effective date and explicit approval/publish action before they become resolver input.

Historical approval snapshots remain unchanged.

## Admin mapping workflow

The organization admin surface should eventually provide:

- source unit labels and employee counts;
- canonical unit candidates;
- source job/position labels and counts;
- canonical Job Profile candidates;
- explicit parent unit selection;
- explicit reporting Position selection;
- vacant-seat visibility;
- acting assignment management;
- mapping warnings and unresolved counts;
- preview of approval-impact changes before publish.

Bulk automatic approval-impacting mappings are prohibited.

## Publish guard

Publishing organization mapping must fail when any approval-critical inconsistency exists, including:

- reporting-line cycle;
- self-manager;
- manager seat points to an inactive employee without an approved acting arrangement;
- duplicate active occupancy of a single-seat Position unless the Position explicitly allows multiple incumbents;
- an approval-critical employee maps to an unreviewed unit/Position;
- a required organization role has no active assignee or has ambiguous active assignees where the resolver expects one person.

## Audit

Audit at minimum:

- source alias mapped/unmapped;
- canonical unit created/renamed/reparented;
- Job Profile mapping changed;
- Position created/changed/vacated/filled;
- reporting line changed;
- acting assignment started/ended;
- organization mapping published;
- publish rejected because validation failed.

Audit payloads use identifiers and normalized metadata only; do not copy raw employee workbook rows.

## Acceptance criteria

- ORG-002-A: raw import labels cannot directly create approval hierarchy.
- ORG-002-B: Job Profile, Position, employee assignment, and reporting line remain separate concepts.
- ORG-002-C: all approval-impacting mappings require explicit reviewed/approved state.
- ORG-002-D: vacant manager seats do not silently fall through to another approver.
- ORG-002-E: acting reporting relationships are explicit, effective-dated, and audited.
- ORG-002-F: organization changes do not rewrite historical approval snapshots.
- ORG-002-G: publish validation blocks cycles, ambiguity, inactive approvers, and unresolved approval-critical mappings.
- ORG-002-H: approval resolvers use explicit approved relationships/roles, never title-text heuristics.
