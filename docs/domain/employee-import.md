# Employee Master Import

**Status:** ACCEPTED FOR MVP  
**Specification:** EMP-004  
**Related:** EMP-001, ORG-001, SEC-001

## Goal

Populate and maintain the employee master from the existing HR spreadsheet without requiring HC staff to enter employees one by one.

This import is a controlled data-ingestion flow. It does not create login accounts automatically and it does not make the source spreadsheet the long-term system of record.

## Source workbook contract

The initial source is an `.xlsx` workbook maintained by HC. The importer reads only the sheet named:

`Master Data SDM YSQ`

Header row: row 2. Data starts at row 3.

The importer uses an allowlist. Columns outside this list are ignored even when present in the workbook.

| Source header | Target | Required | Notes |
|---|---|---:|---|
| `NIP` | `employeeNumber` | yes | Natural key for deterministic upsert. Database primary key remains UUID. |
| `NAMA` | `fullName` | yes | Trimmed; empty name is an error. |
| `STATUS AKTIF` | `status` | yes | Normalized to `active`, `inactive`, or `resigned`; unknown values fail closed to inactive with warning. |
| `STATUS KEPEGAWAIAN` | `employmentStatus` | no | Descriptive value for the employee record. |
| `UNIT` | organization unit | no | Normalized reference; missing value is a warning. |
| `JABATAN` | position | no | Normalized reference; missing value is a warning. |
| `JENIS KEPEGAWAIAN` | `employmentType` | no | Descriptive value. |
| `JABATAN FUNGSIONAL` | `functionalPosition` | no | `-` is normalized to null. |
| `JABATAN STRUKTURAL` | `structuralPosition` | no | `-` is normalized to null. |
| `EMAIL` | `email` | no | Invalid/placeholder email becomes warning and is ignored; employee import still proceeds. |
| `NO HP` | `phone` | no | Stored as text; no numeric coercion. |
| `PENDIDIKAN TERAKHIR` | `education` | no | Descriptive value. |
| `TMT` | `startedOn` | no | Date normalization required. |
| `TAHUN KELUAR (TTTT-BB)` | `endedOn` | no | Month-only values normalize to the first day of the month and generate a warning. |
| `KETERANGAN` | `note` | no | Internal HR note; not exposed in employee self-service by default. |

## Explicitly excluded from MVP import

The source workbook contains additional personal/restricted fields. MVP must not ingest them merely because they exist in the spreadsheet.

Examples currently excluded:

- NIK;
- parent/spouse/child identity fields;
- KTP/KK/ijazah document markers;
- BPJS identifiers;
- bank account;
- NPWP;
- full KTP address and family-card number.

Adding any excluded field requires an explicit product/security decision and matching authorization/audit behavior.

## Import flow

```text
HC/Admin selects XLSX
  -> server validates file and required sheet/header
  -> rows are normalized using the allowlist
  -> duplicate NIP inside the same file is rejected
  -> server compares NIP with current employee master
  -> preview is persisted as sanitized rows only
  -> user reviews insert/update/error/warning counts
  -> user confirms commit
  -> one database transaction upserts references and employees
  -> import job becomes committed
```

Raw workbook bytes are not stored permanently by HCIS during this flow.

## Preview states

Each non-empty row receives one planned action:

- `insert`: NIP does not exist yet;
- `update`: NIP already exists;
- `error`: row cannot be committed;
- `skip`: reserved for future explicit skip behavior.

Warnings do not block commit. Errors do.

## Validation rules

Blocking errors:

- required worksheet missing;
- required headers missing;
- employee number/NIP missing;
- employee name missing;
- duplicate NIP within the uploaded workbook;
- import exceeds configured row/file limits.

Warnings:

- unknown employee status, normalized to inactive;
- invalid email, ignored;
- missing unit or position;
- ambiguous/month-only optional date normalized conservatively.

## Account and authorization boundary

Employee master import does **not** automatically create or activate a user account. Identity/account activation remains a separate flow under AUTH-001/AUTH-002.

The first implementation provides the import use case through a **local CLI adapter** so database/schema/import behavior can be verified before production authentication exists. The CLI is an engineering/admin bootstrap tool, not the final HC user experience.

The target UI/API flow remains preview -> confirm under the production permission `employee.import` with an explicit administrative scope. The HTTP endpoint and menu must not be enabled until the centralized authorization layer is available.

## Audit and history

Persist an import job with:

- job UUID;
- source filename;
- source sheet;
- SHA-256 checksum;
- row/insert/update/warning/error counts;
- created/committed timestamps;
- sanitized per-row outcome and messages.

Do not persist ignored source columns inside import row payloads.

## Organization references

For the first import, unit and position are normalized into reference tables. This does **not** yet establish the organizational reporting hierarchy.

Direct-manager/reporting relationships are a separate ORG-001 step and must be completed before approval resolution is considered ready.

## UI direction

The administrative navigation should eventually expose:

```text
Data Pegawai
  - Daftar Pegawai
  - Impor Pegawai
  - Riwayat Impor
```

The UI must use preview -> confirm. Upload must never silently write directly to the employee master.

## Acceptance criteria

1. A synthetic workbook with the supported headers can be previewed.
2. Preview clearly separates inserts, updates, warnings, and errors.
3. Duplicate NIP in one workbook blocks those rows.
4. Re-importing the same NIP updates the employee instead of duplicating it.
5. Invalid email does not block creation of the employee record and does not create an account.
6. Ignored sensitive columns never appear in persisted import payloads.
7. Commit runs transactionally; a failed commit does not leave a partially committed job.
8. Raw workbook bytes are not permanently stored.
9. The local CLI and the later HTTP/UI adapter call the same import application service.
10. Tests and fixtures use synthetic data only.
