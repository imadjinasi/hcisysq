# Employee Master Import

**Status:** ACCEPTED FOR MVP  
**Specification:** EMP-004  
**Related:** EMP-001, ORG-001, SEC-001

## Goal

Populate and maintain the employee master from the existing HC source without requiring staff to enter employees one by one.

The import is a controlled data-ingestion flow. It does not create login accounts automatically and the uploaded file is not the long-term system of record.

## Source format

Preferred operational format: **CSV UTF-8**.

Compatibility format: `.xlsx` workbook.

CSV uses the supported headers on row 1. Comma and semicolon delimiters are accepted so exports from different spreadsheet locale settings remain deterministic.

For XLSX compatibility, the importer reads only the sheet named `Master Data SDM YSQ`, with header row 2 and data starting at row 3.

The importer uses an allowlist. Columns outside this list are ignored.

| Source header | Target | Required | Notes |
|---|---|---:|---|
| `NIP` | `employeeNumber` | yes | Natural key for current employee master upsert. Database PK remains UUID. |
| `NAMA` | `fullName` | yes | Trimmed; empty name is an error. |
| `STATUS AKTIF` | `status` | yes | Normalized to `active`, `inactive`, or `resigned`; unknown values fail closed to inactive with warning. |
| `STATUS KEPEGAWAIAN` | `employmentStatus` | no | Descriptive value. |
| `UNIT` | organization unit | no | Normalized reference; missing value is warning. |
| `JABATAN` | position | no | Normalized reference; missing value is warning. |
| `JENIS KEPEGAWAIAN` | `employmentType` | no | Descriptive value. |
| `JABATAN FUNGSIONAL` | `functionalPosition` | no | `-` becomes null. |
| `JABATAN STRUKTURAL` | `structuralPosition` | no | `-` becomes null. |
| `EMAIL` | `email` | no | Invalid/placeholder email becomes warning and is ignored. Employee still imports and Admin may correct it manually after confirmation. |
| `NO HP` | `phone` | no | Stored as text. |
| `PENDIDIKAN TERAKHIR` | `education` | no | Descriptive value. |
| `TMT` | `startedOn` | no | Date normalization required. |
| `TAHUN KELUAR (TTTT-BB)` | `endedOn` | no | Month-only becomes first day of month with warning. Source sentinel `0`/Excel epoch is treated as empty, not as year 1899/1900. |

## Fields excluded from MVP

The source contains additional sensitive fields. MVP does not ingest them merely because they exist.

Currently excluded include NIK, BPJS identifiers, bank account, NPWP, family identifiers, document markers, full address, and unclassified free-form notes.

**NIK is not an import key.** A duplicated NIK therefore does not drive merge/canonical selection in this MVP.

## Duplicate NIP and rehire policy

Real source data may contain more than one row for the same NIP when a former employee is recruited again. The employee master represents the **current/latest snapshot**, while historical employment periods are a separate future concern.

Duplicate NIP inside one source file is resolved deterministically instead of always blocking the import:

1. a row without blocking validation errors is preferred;
2. an `active` row is preferred over inactive/resigned rows;
3. if activity priority is equal, the latest valid `TMT` is preferred;
4. if still tied, the later source row wins.

The selected row becomes `insert`/`update`. Other rows with the same NIP become `skip` and receive a warning explaining that they were superseded.

This rule deliberately does not attempt to reconstruct employment-period history.

## Import flow

```text
Admin selects CSV (preferred) or XLSX
  -> server validates required headers/source shape
  -> rows are normalized using the allowlist
  -> duplicate NIP groups select one current record and skip superseded rows
  -> server compares selected NIP with employee master
  -> preview persists sanitized supported fields only
  -> Admin reviews insert/update/skip/warning/error counts
  -> Admin confirms commit
  -> one transaction upserts references and employees
  -> import job becomes committed
```

Raw upload bytes are not stored permanently.

## Preview states

- `insert`: selected NIP does not exist yet;
- `update`: selected NIP already exists;
- `skip`: row is deliberately not applied, including superseded duplicate-NIP history;
- `error`: selected row cannot be committed.

Warnings do not block commit. Errors do.

## Validation rules

Blocking errors include missing required headers, missing NIP, missing employee name, malformed source structure, and configured file/row limit violations.

Warnings include invalid email, invalid optional date, missing unit/position, unknown status defaulted to inactive, and duplicate-NIP selection/skip notices.

Invalid email never creates an account and does not block employee import. Admin may verify the email with the employee and update employee contact data manually in the employee detail panel.

## Account boundary

Employee import does not automatically create or activate accounts. Account activation remains a separate AUTH flow.

## Audit and history

Persist import job UUID, filename, source type/sheet, checksum, row/insert/update/warning/error counts, actor, timestamps, and sanitized per-row outcome/messages. Ignored sensitive source columns must never be persisted in import payloads.

## Acceptance criteria

1. CSV UTF-8 is the preferred source and XLSX remains supported.
2. Preview separates inserts, updates, skips, warnings, and errors.
3. Duplicate NIP selects a single current row using valid > active > newest TMT > later row.
4. Superseded duplicate rows are skipped, not committed.
5. Re-importing an existing NIP updates the employee instead of duplicating it.
6. Invalid email does not block employee creation and can be corrected manually by Admin later.
7. `0`/Excel epoch optional date values normalize to null.
8. Ignored sensitive columns never appear in persisted import payloads.
9. Commit is transactional and raw source bytes are not retained.
10. Tests and fixtures use synthetic data only.
