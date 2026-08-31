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
- safe USERINFO roster projection from `attendance_adms_device_roster_entries`;
- current explicit active mappings;
- active HCIS employee names.

Safe device fields such as card number may be displayed for human review, but they are not scoring inputs.

Because full roster snapshot semantics are not physically validated yet, absence from the observed roster MUST NOT be interpreted as absence from the device.

## Candidate eligibility

Candidates are limited to HCIS employees with `status = active`.

An employee already actively mapped to a different PIN on the same device is excluded from suggestions. Existing active mappings are shown as mapped and are not sent through suggestion ranking.

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

If the PIN has no passively/safely observed device name yet, show that name-based recommendations are unavailable. Active USERINFO reads are retired; do not fabricate candidates from PIN/card/NIP.

## Safety and attendance invariants

This feature does not infer lateness, absence, work hours, overtime, payroll deduction, leave conversion, or attendance-resolution outcomes.

Creating a mapping may trigger the existing neutral historical attendance projection for that explicit mapping. Raw ADMS events remain immutable.

Biometric collection/query/write behavior is unchanged and remains separately gated.
