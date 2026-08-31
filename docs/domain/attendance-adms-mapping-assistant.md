# ATT-005 — ADMS Mapping Assistant

## Purpose

Help a Super Admin explicitly map a device PIN to the correct HCIS employee without turning name similarity into an identity inference.

The assistant places observed device identity facts next to HCIS employee candidates, sorts candidates by **name similarity only**, and requires an explicit Admin confirmation before the existing mapping write endpoint is called.

## Non-negotiable identity boundary

A similarity result is a suggestion, not a mapping and not proof of identity.

HCIS MUST NOT automatically create an employee mapping from:

- device PIN;
- employee number / NIP;
- card number;
- organizational unit;
- external identifier;
- name similarity.

Only the existing explicit mapping write may establish `device_id + PIN -> employees.id`.

The assistant MUST NOT mutate attendance, employee, roster, or mapping state while computing suggestions.

## Input facts

For one registered ADMS device, the assistant may read:

- observed PIN values from immutable `attendance_adms_events`;
- passive safe USERINFO roster projection from `attendance_adms_device_roster_entries`;
- current explicit active mappings and the authoritative lifecycle of their HCIS employees;
- active HCIS employee names for candidate ranking.

Safe device fields such as card number may be displayed for human review, but they are not scoring inputs.

The roster is intentionally `observed_only` / `completeSnapshot: false`. Active full-roster and single-PIN USERINFO reads are retired for the physically tested firmware, so absence from the observed roster MUST NOT be interpreted as absence from the device and the assistant MUST NOT issue a read command to fill the gap.

Explicit HCIS mapping lifecycle is a different fact source from passive device roster observation. A mapping may therefore remain visible and reviewable even when its PIN has no safe roster observation.

## Candidate eligibility

Candidates are limited to HCIS employees with `status = active`.

An employee already actively mapped to a different PIN on the same device is excluded from suggestions. Existing active mappings are shown as mapped and are not sent through suggestion ranking.

## Mapped employee lifecycle anomaly

An explicit device mapping may outlive the employee's active HCIS lifecycle. Whenever a current explicit mapping points to an employee whose authoritative HCIS status is `inactive` or `resigned`, HCIS must treat that as an Admin review state, not as a reason to mutate the device or mapping automatically.

This review state MUST NOT depend on the existence of a passive USERINFO roster observation for the PIN. The current mapping plus authoritative employee status is sufficient to surface the anomaly.

The Admin user workspace must:

- include current explicit mappings alongside passively observed PIN facts, while clearly distinguishing absent device metadata from proof of on-device absence;
- keep the historical/current mapping visible;
- clearly mark the row as requiring review because the mapped employee is no longer active;
- keep `Akhiri hubungan` available so a Super Admin can explicitly close the mapping while preserving history;
- disable name synchronization and PIN-correction planning for the inactive/resigned mapping, matching the existing server-side `EMPLOYEE_NOT_ACTIVE` guard;
- never delete/recreate the device user, change PIN, touch biometrics, or alter attendance automatically.

If authoritative employee status is unavailable, HCIS must not guess that the employee is inactive. Only an explicit non-`active` employee status creates this review state.

## Name scoring

Scoring is deterministic and server-side. The frontend does not reproduce domain logic.

Normalization:

1. Unicode normalize and remove combining marks;
2. lowercase;
3. replace punctuation/separators with spaces;
4. collapse whitespace.

No honorific/title dictionary is stripped automatically.

Score is `0..100` and uses only the normalized names:

- exact normalized equality: 100;
- otherwise a weighted combination of token-set overlap and character-bigram Dice similarity.

The API returns a short ordered candidate list. The score is a ranking aid only and MUST be labelled as similarity, not confidence/probability.

## Admin workflow

For every unmapped observed PIN:

1. show PIN and safe device USERINFO metadata when available;
2. show the best HCIS employee candidates, ordered by name similarity;
3. visually distinguish exact normalized-name matches from fuzzy matches;
4. require the Admin to choose a candidate and click an explicit mapping action;
5. call the existing audited mapping endpoint;
6. reload authoritative mapping state after success.

There is no bulk auto-map button.

If the PIN has no passively/safely observed device name yet, show that name-based recommendations are unavailable. Active USERINFO reads are retired; do not fabricate candidates from PIN/card/NIP and do not provide an alternate raw-command path.

## Safety and attendance invariants

This feature does not infer lateness, absence, work hours, overtime, payroll deduction, leave conversion, or attendance-resolution outcomes.

Creating or ending a mapping may trigger only the existing neutral mapping/projection behavior defined elsewhere. Raw ADMS events remain immutable.

Biometric collection/query/write behavior is unchanged and remains separately gated.
