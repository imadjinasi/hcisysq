# UI and Design Guidelines

**Status:** ACTIVE PRODUCTION UI SYSTEM

## Canonical ownership

Reviewed product UI now lives in `apps/web` in this repository. The earlier `imadjinasi/hcis-ysq-foundation` repository is design/reference history only.

GitHub `imadjinasi/hcisysq` is the source of truth for product UI, domain rules, API contracts, and engineering work.

## Current MVP screens

1. Login/recovery foundation.
2. Employee app shell and dashboard.
3. Leave request form and preview.
4. Approval task detail/timeline.
5. Payslip read-only list/detail from imported data.
6. Foundation Board read-only statistics/report panel.
7. Super Admin access/audit minimum panel.
8. Empty, loading, error, forbidden, offline/slow, and mobile states.

## Brand

Follow `docs/design/brand-guideline.md`.

## Design tokens

Define and reuse:

- typography scale;
- spacing scale;
- radius;
- elevation;
- semantic colors;
- focus ring;
- breakpoints;
- motion duration;
- density for table/form layouts.

Do not hardcode status meaning per page. Status needs label/icon/text and may use semantic color as secondary reinforcement.

## Production interface system

This section is the authoritative UI system for production HCIS. It extends the foundation; it does not replace the YSQ semantic colors in the brand guideline.

### Typography

Use the following target scale in production surfaces:

| Role | Size | Use |
|---|---:|---|
| Metadata / compact | 12px | supporting metadata, badges, table headers, sidebar group labels |
| Body | 14px | navigation, fields, controls, tables, and ordinary copy |
| Section heading | 16px | card and section titles |
| Mobile page heading | 20px | employee page title at narrow widths |
| Desktop page heading | 28px | desktop/admin page title |

Avoid arbitrary 9px, 10px, 11px, and 13px text for primary production UI. Existing untouched exceptions may remain while their owning component is normalized. The heading stack is `"LT Museum", "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; LT Museum is a licensed optional font and must not be bundled or fetched until supplied. Body uses Inter followed by the same system fallbacks.

Employee surfaces are mobile-first and readable with generous line-height; administration may use a denser desktop layout without reducing ordinary text below 14px. Metadata may be 12px only when it is clearly subordinate.

### Spacing, shape, and elevation

- Use a 4px spacing rhythm: 4, 8, 12, 16, 20, 24, 32, 40, 48px. Prefer a gap or padding from this scale rather than one-off values.
- Fields and standard controls use 12px (`rounded-xl`) corners; cards use 16–24px, with 32px reserved for prominent employee cards and sheets.
- Use no elevation for ordinary grouped content, `--shadow-soft` for cards/fields, and `--shadow-raised` only for floating navigation, sheets, and prominent containers. Never use decorative glow.
- Content is centered at `max-w-7xl`; employee desktop content reserves the persistent sidebar, and admin layout uses a fixed ~232px sidebar plus a `minmax(0, 1fr)` content column. Every table parent inside a grid/flex column must have `min-w-0`.

### Navigation and layout

- Sidebar groups use sentence case or restrained uppercase at 12px semibold with modest tracking. Navigation items are 14px semibold and use a clear semantic-color active surface.
- Employee mobile navigation has four equal slots, 12px labels, visible focus, safe-area-aware placement, and an at-least-44px target. It is capability-aware: normal employees receive Beranda, Hadir, Cuti, and Lainnya; employees with live approval work receive Beranda, Hadir, Persetujuan, and Lainnya. Do not infer this from title.
- `Lainnya` contains only real, authorized routes. It includes Slip Gaji and relevant secondary leave routes; placeholders must not be presented as navigation.
- Administration page headers use a compact desktop rhythm so the title and task workspace remain visible together at common laptop heights. This density applies through the shared admin shell, not employee/mobile page headers.
- Organization Designer keeps publication state, effective date, human revision context, editor actions, and chart controls in a compact workspace shell. Primary UI uses revision names and dates rather than UUIDs, abbreviated hashes, stable keys, or raw authority enums.
- Dense chart navigation controls are local to the Organization Designer toolbar. They do not redefine shared application button sizing or workflow call-to-action sizing.
- The Organization Designer is a **viewport workspace**: its compact single control bar remains outside a bounded, internally scrollable diagram viewport. On narrow screens, date/state context plus zoom and Fit remain visible, while secondary canvas navigation is disclosed through a labelled overflow control. This pattern does not apply to ordinary admin pages.

### Canonical primitives

Use the smallest appropriate shared primitive when a touched surface repeats it: Button (primary, secondary, destructive), IconButton, Field, PageHeader, StatusBadge, and Alert/feedback state. Add SearchInput, FilterBar, Dialog, MobileSheet, DataTable, or EmptyState only once there is immediate reuse; do not introduce a component framework or convert unrelated screens opportunistically.

Buttons use 14px semibold/bold text, an obvious primary action, visible focus, disabled state, and a 44px target on employee mobile actions. IconButton is square and labelled with `aria-label`. Fields have persistent labels, nearby validation, and 14px input text. Search and filters preserve submitted/query state and do not hide active filters.

### Content states and components

- Tables retain readable column widths and scroll within their own container; they must never widen the document. On small employee views, use a detail/card pattern when a table would not be comprehensible.
- Cards contain one clear purpose and use semantic status badges with text; color is secondary reinforcement.
- Loading, empty, error, offline/slow, forbidden, and read-only states state what happened and a legitimate next action when one exists. Never show fabricated zeroes, facts, or disabled fake workflow actions.
- Dialogs confirm destructive or consequential actions, preserve focus, label their outcome, and offer a safe cancel path. On mobile, use a sheet only when it improves reachability and preserve safe-area spacing.
- Destructive actions use the destructive token, an explicit consequence, and confirmation appropriate to risk; they do not rely on color alone.

## Interaction principles

- One obvious primary action per task.
- Destructive action requires confirmation appropriate to risk.
- Validation error stays close to the field.
- Tables support practical filter/sort/pagination when data volume needs it.
- Approval view shows requester, request summary, policy context, history, and decision consequence.
- Do not reveal restricted data that is unnecessary for a decision.
- Payslip employee views are read-only.

## Accessibility

- Target minimum WCAG 2.1 AA.
- Keyboard navigation and visible focus.
- Semantic HTML and form labels.
- Status not conveyed by color alone.
- Dialog focus management.
- Adequate touch targets on mobile.
- Respect reduced motion.

## Responsive strategy

- Mobile-first for employee self-service and quick approval.
- Desktop-efficient for administration, import, reconciliation, and reporting.
- Do not squeeze desktop tables onto mobile; use detail/card patterns when more appropriate.

## Mock data

All prototypes and fixtures use synthetic data. Production employee/payroll data must never be placed in prompts, screenshots, fixtures, or public repository history.
