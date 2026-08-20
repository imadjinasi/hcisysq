# AI-Assisted Development Workflow

**Status:** ACCEPTED

## Goal

Menggunakan Lovable untuk percepatan desain dan Codex untuk engineering tanpa menjadikan output AI sebagai sumber kebenaran yang tidak direview.

## Workflow

```text
Product/domain documentation
       -> Lovable UI exploration with mock data
       -> reviewed design decisions
       -> code lands in GitHub branch
       -> Codex/human engineering and tests
       -> pull request quality gates
       -> merge
```

## Lovable phase

Input minimum:

- problem statement;
- actor dan permission context;
- workflow dan states;
- design references;
- required loading/error/empty/mobile states;
- synthetic mock data.

Output yang diterima:

- design direction;
- tokens;
- reusable components;
- page/flow prototype;
- responsive behavior.

Output yang tidak dianggap authoritative:

- database schema;
- permission rules;
- payroll/approval calculation;
- production auth;
- secret/configuration;
- migration.

## Codex phase

Sebelum bekerja, Codex harus membaca:

1. `AGENTS.md`;
2. specification/feature parity item;
3. workflow terkait;
4. ADR terkait;
5. OpenAPI dan security baseline.

Codex diminta menghasilkan perubahan kecil dan dapat direview, menjalankan test, serta menyebut asumsi dan risiko.

## Prompt contract

Prompt implementasi yang baik mencakup:

```text
Repository/path scope
Specification ID
Outcome
Non-goals
Relevant docs
Acceptance criteria
Required tests
Forbidden changes
```

## Review checklist khusus AI

- Apakah AI mengarang requirement?
- Apakah business rule bocor ke UI?
- Apakah authorization hanya di client?
- Apakah query membuka cross-tenant/cross-unit data?
- Apakah migration destructive?
- Apakah retry membuat duplicate side effect?
- Apakah log/error membocorkan data?
- Apakah dependency baru benar-benar perlu?
- Apakah generated code lebih rumit daripada kebutuhan?

## Data policy

Hanya synthetic data yang boleh masuk prompt, fixture, screenshot, dan prototype. Secret dan data production dilarang.

## Human approval required

- Perubahan product scope.
- Role/permission.
- Payroll/loan/reimbursement rule.
- Data retention.
- Migration/cutover.
- Security exception.
- Production deployment.