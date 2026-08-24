# Organization Designer Visual Ranking

**Status:** IMPLEMENTED, TESTED, AND DEPLOYED AS ORG-004 PRESENTATION METADATA
**Specification:** ORG-004 visual-layout addendum  
**Related:** ORG-002, ORG-004, APR-001  
**Decision date:** 2026-08-22

## Purpose

The HCIS Organization Designer must allow YSQ administrators to communicate **relative organizational rank visually** without falsifying the actual reporting or authority structure.

A structural child does not always belong on the immediately next visual row of an organization chart. For example, a bureau may report directly to a Head of Education Affairs while being intentionally displayed at the same visual rank as vice principals rather than school heads.

HCIS must support this without creating fake intermediate positions and without changing approval resolution.

The implemented renderer uses a deterministic top-down hierarchy: children are placed below their structural parent, siblings share a horizontal peer row, and explicit connector metadata/lines retain the real parent across skipped bands. Node and position visual offsets add actual vertical layout distance and visual-band depth; they are not presentation badges alone. Member populations remain summarized on group cards rather than expanded into one chart box per employee.

## Core invariant

> **Structural relationship and visual rank are different concepts.**

The organization structure answers:

> Who is structurally responsible for this item?

The visual layout answers:

> At what apparent rank should this item be displayed on the chart?

Workflow and authority resolution must use the structural relationship, never the visual row/depth.

## Example

Assume this real structure:

```text
Head of Education Affairs
|
+-- Head of SDIT
|   +-- SDIT Vice Principal
|
+-- Head of SMPIT
|   +-- SMPIT Vice Principal
|
+-- Al-Qur'an Bureau
```

`Al-Qur'an Bureau` reports directly to `Head of Education Affairs`, but YSQ wants the chart to communicate that its relative organizational rank is closer to a vice principal than to a school head.

The admin may therefore configure:

```text
Al-Qur'an Bureau
structural parent = Head of Education Affairs
visual offset     = +1
```

The chart may render approximately as:

```text
                 Head of Education Affairs
                          |
             +------------+------------+
             |                         |
        Head of SDIT               Head of SMPIT
             |                         |
      SDIT Vice Principal       SMPIT Vice Principal
             |
             +----------- Al-Qur'an Bureau
                         [same visual band]
```

The connector from `Head of Education Affairs` to `Al-Qur'an Bureau` must still represent the true direct structural relationship even when its box is rendered lower.

## Do not create fake vacant positions

Visual spacing must **not** be represented by invented empty organizational positions.

Do not model this:

```text
Head of Education Affairs
|
+-- [FAKE VACANT POSITION]
    |
    +-- Al-Qur'an Bureau
```

A `VACANT` position has real domain meaning: an actual position exists but currently has no effective incumbent.

Using fake vacant positions for layout would corrupt:

- direct-manager traversal;
- vacancy fallback;
- acting/temporary authority behavior;
- approval resolution;
- organization history;
- vacancy reporting.

Visual layout metadata must therefore be separate from structural entities and vacancy state.

## Visual offset

The implementation may use an internal concept such as `visual_offset`, `display_depth_offset`, or an equivalent layout property.

The exact physical field name is an implementation decision, but the semantics must remain:

```text
render depth = structural depth + visual offset
```

Illustrative values:

```text
visual offset = 0
-> render at the normal structural depth

visual offset = 1
-> render one visual band lower

visual offset = 2
-> render two visual bands lower

visual offset = 3
-> render three visual bands lower
```

Negative offsets should not be introduced in the first implementation unless a real YSQ case requires them, because rendering a structural child above its structural parent can make the chart misleading.

## Example with multiple offsets

```text
Head of Education Affairs
|
+-- Head of SDIT                 visual offset 0
|   +-- Vice Principal           visual offset 0
|       +-- Teachers             visual offset 0
|
+-- Al-Qur'an Bureau             visual offset 1
|
+-- Supporting Team X            visual offset 2
```

This allows:

- `Head of SDIT` to appear at the school-head visual band;
- `Al-Qur'an Bureau` to appear at the vice-principal visual band;
- `Supporting Team X` to appear at the teacher/staff visual band;

while all three may still have the same structural parent when that reflects YSQ's actual organization.

## Approval and authority behavior

Visual ranking must have **zero authority semantics**.

Approval code must never contain logic such as:

```text
approver = item at visual level - 1
```

or:

```text
if visual_offset == 1 then use school head
```

Instead, approval resolution continues to use semantic structural relationships defined by ORG-004, for example:

- structural/supervisory parent;
- configured leader position;
- unit approver authority;
- governance approver authority;
- effective incumbent;
- vacancy policy;
- employee-level reporting override where explicitly configured.

Example:

```text
Al-Qur'an Bureau
structural parent = Head of Education Affairs
visual offset = +1
```

Then:

```text
DIRECT_MANAGER
-> Head of Education Affairs incumbent
```

The system must **not** choose a school head merely because `Al-Qur'an Bureau` is visually aligned with vice principals.

## Vacancy behavior remains structural

Example:

```text
Head of Education Affairs
|
+-- Al-Qur'an Bureau
```

If `Head of Education Affairs` is a real authority-bearing position and is vacant, vacancy resolution follows ORG-004 vacancy rules.

Visual offset does not add, remove, or skip authority steps.

In particular:

```text
visual skip != vacancy skip
```

These are unrelated concepts.

## Organization Designer UX

Administrators should not need to understand an internal field named `visual_offset`.

The Organization Designer should expose a simple visual control, for example:

```text
Display position
(*) Normal structural level
( ) Lower by 1 visual level
( ) Lower by 2 visual levels
```

or direct chart controls such as:

```text
[Move one visual level down]
[Move one visual level up]
```

The UI copy must make clear that this changes **chart presentation only**.

Suggested explanation:

> Adjust visual rank without changing reporting or approval relationships.

The HC administrator wording is:

```text
Tampilan
- Tingkat normal
- Tampilkan 1 tingkat lebih rendah
- Tampilkan 2 tingkat lebih rendah
- Tampilkan 3 tingkat lebih rendah
```

Canvas cards do not show `+1` / `+2` / `+3` badges, so the presentation
metadata does not compete with structural content. The selected-item inspector
retains the complete placement explanation.

The renderer lays out `structuralDepth + visualRankOffset` as an actual visual
band using a fixed complete row pitch for each rendered item type, rather than
a fractional card-height spacer. Normal siblings retain their structural row;
each `+N` advances exactly N discrete pitches. Connectors are explicit and keep
the real parent: center-aware sibling segments span only the first and last real
child centers even when a child subtree is wider, and a single child has no
horizontal extension.

## Add-below and add-sibling actions

The visual builder should preserve the simple administration model already accepted for ORG-004:

- **Add below** creates a new structural child of the selected item.
- **Add alongside** creates a sibling under the same structural parent.
- **Adjust visual rank** changes only the rendered vertical band of the selected item.

These actions must remain conceptually separate.

Example:

```text
Selected: Head of Education Affairs

Add below
-> Al-Qur'an Bureau

Adjust visual rank
-> lower by 1
```

The result is still a direct structural child of `Head of Education Affairs`.

## Rendering requirements

The chart renderer must be able to draw a connector across skipped visual bands so users can still see the true parent-child relationship.

A visually offset item must not appear disconnected or incorrectly attached to an item on its displayed row.

The first implementation should prioritize correctness and readability over automatic aesthetic optimization.

The renderer must also support:

- compact and expanded organization views;
- vacant positions remaining visible;
- occupied position labels;
- collapsed member counts for non-leadership employees;
- historical/current/future effective-date views from ORG-004;
- visual offsets that remain stable across those views when effective for the selected date.

Large structures are navigated as a canvas with zoom, fit-to-viewport,
center-root, center-selected, drag-to-pan, and collapse/expand controls. These
controls operate only on local viewport state and are never persisted as
organization configuration. Compact cards preserve horizontal sibling layout
and the existing structural connector source/target at every zoom level.

## Effective dating

Visual rank may change as part of a scheduled restructure.

Example:

```text
2026
Al-Qur'an Bureau visual offset = +1

2027
Al-Qur'an Bureau moved structurally under a new directorate
visual offset = 0
```

A future Organization Designer implementation should therefore treat layout-affecting structural configuration as effective-dated rather than destructively overwriting history.

Whether visual offset is independently effective-dated or versioned as part of the published organization structure is an implementation detail; historical chart rendering must nevertheless remain correct.

## Draft / impact preview

A draft restructure preview must show both:

1. visual changes to the chart; and
2. structural/authority changes that affect workflow resolution.

A pure visual-rank change should be explicitly identified as **no approval-routing impact**.

Example preview:

```text
Change:
Al-Qur'an Bureau visual rank +1

Structural parent changed: NO
Authority binding changed: NO
Approval routing impact: NONE
```

Conversely, moving the same bureau to a different structural parent must be identified as an authority-impacting change when the structural parent participates in approval resolution.

## API / model boundary

Organization APIs consumed by workflow code must expose structural/authority relationships independently from layout metadata.

A workflow consumer should not need visual information to resolve an approver.

Conceptually:

```text
Organization Designer read model
= structure + assignments + authority + layout metadata

Approval resolver model
= structure + assignments + authority
```

This keeps future features such as attendance clarification, reimbursement, loan, performance review, document requests, and other approval workflows independent of chart aesthetics.

## Acceptance criteria

- ORG-004-VIS-A: an organization item can be rendered below its immediate structural depth without inserting a fake position.
- ORG-004-VIS-B: visual rank changes do not alter direct-manager, unit-approver, governance-approver, or oversight resolution.
- ORG-004-VIS-C: a visually skipped structural relationship is rendered with a connector that still identifies the true parent.
- ORG-004-VIS-D: real vacant positions remain distinct from visual spacing and continue to participate in vacancy policy.
- ORG-004-VIS-E: approval code never resolves authority from numeric/display level or visual offset.
- ORG-004-VIS-F: the Organization Designer provides a user-friendly way to lower visual rank without exposing database terminology.
- ORG-004-VIS-G: draft impact preview distinguishes pure layout changes from structural/authority changes.
- ORG-004-VIS-H: historical/future chart views preserve the visual layout appropriate to the selected effective structure.
- ORG-004-VIS-I: future workflow modules can consume organization authority without depending on visualization metadata.
- ORG-004-VIS-J: offsets 0, 1, 2, and 3 map to computed visual-depth bands rather than small arbitrary pixel nudges.
- ORG-004-VIS-K: sibling connectors do not extend into empty canvas beyond actual child centers.

## Implementation boundary

Visual ranking and canvas navigation are deployed presentation behavior. They
do not change resolver inputs or rollout semantics. A workflow may treat
dynamic structure as authoritative only through an applicable `STRUCTURE`
rollout setting; visual metadata never activates or alters that authority.
