# Product Scope

**Status:** ACCEPTED — MVP COMPLETE, POST-MVP PLANNING ACTIVE  
**Updated:** 2026-08-22

## Prinsip sequencing

HCIS dibangun melalui vertical slice, bukan membuat seluruh halaman lebih dahulu. Setiap slice harus mencakup UI, API, domain rule, permission, audit, test, dan operasional minimum yang relevan.

MVP rinci mengikuti `docs/product/mvp.md`. Evidence final MVP dibekukan di `docs/product/mvp-release-checkpoint.md`.

## Foundation

Foundation MVP yang sudah terverifikasi mencakup:

- API/runtime configuration dan health check;
- PostgreSQL local/CI/runtime verification dan migration runner;
- employee master + controlled CSV/XLSX import;
- struktur organisasi, unit, posisi, reporting line, dan Unit Approver foundation;
- identity, session, dan account activation foundation;
- role, permission, scope, dan policy;
- audit trail;
- notification outbox/intents yang dibutuhkan workflow MVP;
- encrypted leave evidence storage adapter;
- logging/deployment/backup runbook foundation.

Production delivery adapters, full legacy cutover, dan production security sign-off tetap gate terpisah.

## Foundation slice 0: employee master — VERIFIED

```text
Start API + PostgreSQL
  -> upload synthetic employee workbook/CSV
  -> preview validation
  -> confirm import
  -> upsert employee by NIP
  -> normalize unit + position references
  -> review import history
```

Import employee tetap menjadi upstream source untuk employee/organization reference dan tidak otomatis membuat account.

## Vertical slice leave — VERIFIED

MVP sekarang mencakup lebih dari annual leave minimum:

```text
Login
  -> employee leave preview/submit
  -> working-day/policy validation
  -> approval chain di-resolve dan di-snapshot
  -> line approval bila policy membutuhkan
  -> HC notification / validation / actual approval sesuai policy
  -> attendance resolution bila administrasi menyisakan unresolved dates
  -> audit + notification intents
```

Synthetic browser UAT telah memverifikasi annual, special, planned, unpaid, dan attendance-resolution boundaries.

## Attendance factual foundation — VERIFIED

ATT-001 tersedia sebagai raw/factual attendance foundation:

- employee self-read;
- Super Admin manual create/update/delete;
- immutable audit history;
- explicit source/provenance;
- Asia/Jakarta business-time handling.

Yang **belum** termasuk dan tetap post-MVP:

- work schedules/shift;
- lateness tolerance;
- absence inference dari missing punch;
- overtime/work-hour calculation;
- GPS/photo/fingerprint production flow;
- payroll consequence.

## Payslip read-only — VERIFIED

MVP menyertakan payslip **read-only** dari controlled import. HCIS belum menghitung payroll.

```text
Authorized importer
  -> upload CSV
  -> validate
  -> preview/review
  -> commit draft
  -> publish
  -> employee melihat published payslip miliknya
```

Import/publish, owner-only read, Board denial, published immutability, audit, dan canonical period serialization sudah diverifikasi dengan synthetic data.

Reimbursement tidak termasuk MVP.

## Foundation Board — VERIFIED

`/board` adalah governance dashboard aggregate-first dan read-only. Browser UAT memverifikasi Board tidak dapat berpindah ke employee/admin principal area dan tidak mendapat personal payslip access.

## Modul target setelah MVP

- Attendance schedule/shift, location, GPS/photo/fingerprint, dan evidence policy di luar ATT-001.
- Reimbursement.
- Payroll calculation, reconciliation, statutory semantics, dan payslip penuh di luar opaque imported lines.
- Employee loan dan cicilan.
- Performance review.
- Training dan learning record.
- Surat kepegawaian dan peringatan.
- Organization/academic calendar management yang lebih lengkap.
- Announcement, reminder, production email, dan WhatsApp notification adapters.
- Employee data change request.
- Recruitment/careers bila lolos discovery dan prioritas produk.
- Reporting tambahan sesuai role dan kebutuhan governance.
- Full legacy-data migration/cutover.

## Di luar scope awal

- Native mobile app terpisah.
- Real-time chat internal.
- General ledger dan accounting lengkap.
- Vendor-specific biometric device management tanpa adapter boundary.
- Data warehouse terpisah.
- Multi-tenant komersial.

## Release gates

### Foundation ready — PASS

- API dan PostgreSQL dapat dijalankan dari clean/local verification environment.
- Clean migration dan realistic upgrade path lulus.
- Employee import memiliki automated verification dengan synthetic fixtures.
- Identity, permission, scope, audit, dan environment configuration memiliki tests.
- Lint, typecheck, tests, dan build lulus pada verified MVP checkpoint.

### MVP ready — PASS

- Leave vertical slices lulus synthetic end-to-end browser UAT.
- Approval snapshot dan role/scope boundaries terverifikasi.
- Attendance factual mutation + audit lulus synthetic UAT.
- Payslip import/publish/read-only access lulus synthetic UAT.
- Foundation Board read-only boundary lulus browser UAT.
- Cross-principal authorization lulus browser UAT.
- Final verified application SHA tercatat di `docs/product/mvp-release-checkpoint.md`.

### Pilot ready — PENDING

MVP complete tidak otomatis berarti Pilot Ready. Sebelum pilot:

- tentukan staging/pilot data policy (synthetic atau sanitized copy);
- lakukan backup **dan restore drill**, bukan hanya membuat backup;
- pastikan observability minimum dan incident/rollback path tersedia;
- tetapkan pilot users/personas dan scope operasi;
- validasi organization setup yang dipakai pilot (manager, Unit Approver, role/scope, calendar);
- review security/operational assumptions untuk data nyata yang dipakai pilot.

### Production ready — PENDING

- legacy-data migration/cutover rehearsal berhasil dan dapat direkonsiliasi;
- security review selesai;
- production operational runbook dan ownership tersedia;
- legacy freeze/cutover plan disetujui;
- rollback/data-recovery procedure diuji;
- sistem lama tetap read-only selama periode verifikasi yang disetujui;
- production go-live disetujui oleh owner operasional yang berwenang.
