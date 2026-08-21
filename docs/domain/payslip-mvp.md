# Payslip MVP

**Status:** ACTIVE IMPLEMENTATION BASELINE  
**Specification:** PAYSLIP-001  
**Related:** AUTH-010, ORG-003, SEC-001

## Purpose

Payslip pada MVP adalah dokumen data hasil import. HCIS tidak menghitung payroll dan tidak menurunkan nilai baru dari data payslip.

## Import contract

MVP menerima CSV UTF-8 dengan header tepat:

```text
employee_number,period,lines_json
```

- `employee_number`: natural key employee yang harus sudah ada di employee master.
- `period`: periode tampilan berformat `YYYY-MM`.
- `lines_json`: JSON array non-kosong berisi maksimal 100 object `{ "label": string, "value": string }`.

`label` dan `value` diperlakukan sebagai data tampilan opaque yang berasal dari sumber import. Sistem tidak memberi arti payroll pada label, tidak mengubah `value` menjadi angka, dan tidak menjumlahkan atau menurunkan komponen apa pun.

Contract ini sengaja tidak menetapkan komponen gaji Indonesia, currency, gross/net, pajak, BPJS, overtime, deduction, attendance deduction, atau formula lain. Penambahan semantik payroll membutuhkan specification terpisah.

## Workflow

```text
Authorized importer
  -> upload CSV
  -> validate format + employee reference + duplicate employee/period in batch
  -> preview/review
  -> commit as draft
  -> authorized publisher publishes batch
  -> employee can read own published payslip
```

### Preview

Preview disimpan sebagai batch agar review dapat dilakukan sebelum commit. Row invalid tetap tersimpan bersama validation error. Preview tidak membuat payslip yang dapat dibaca employee.

### Commit

Commit hanya diizinkan bila batch berstatus `previewed` dan tidak memiliki validation error. Commit membuat draft payslip. Kombinasi employee + period harus unik; existing draft maupun published payslip tidak ditimpa.

### Publish

Publish hanya diizinkan untuk batch `committed`. Publish membuat draft batch tersebut visible pada employee self-service. Published payslip tidak memiliki route mutation pada MVP dan tidak dapat ditimpa import berikutnya.

## Authorization

- `EMPLOYEE`: hanya membaca payslip miliknya sendiri yang sudah published.
- `FOUNDATION_BOARD`: tidak mendapat akses personal payslip dan tidak mendapat import/publish capability.
- `SUPER_ADMIN`: memiliki explicit system-administration capability untuk import/review/publish, tetapi tidak dianggap employee dan tidak mendapat employee self-view.
- `EMPLOYEE` dengan role tambahan dapat mengakses import/publish hanya bila assignment aktif memuat permission `payslips.import` atau `payslips.publish`.

Backend selalu me-resolve `employee_id` self-service dari account session. Client tidak dapat memilih employee ID untuk membaca payslip.

## Privacy and audit

- Semua payslip response menggunakan `Cache-Control: private, no-store` atau `no-store`.
- Sensitive employee read dicatat sebagai `payslip.read`.
- Preview, commit, dan publish dicatat sebagai audit event.
- Audit payload hanya memuat identifier, period, dan summary count yang diperlukan; `lines` tidak disalin ke audit payload.
- Application logging tidak boleh memasukkan uploaded CSV atau `lines` payslip.

## Foundation Board boundary

Board tetap aggregate-first dan read-only. PAYSLIP-001 tidak menambahkan payroll total, salary trend, personal payslip drill-down, atau payslip mutation ke `/board`. Keberadaan dataset payslip tidak cukup untuk menyimpulkan metrik payroll.

## Acceptance criteria

- PAYSLIP-001-A: invalid employee reference gagal validation dan tidak dapat di-commit.
- PAYSLIP-001-B: preview dan draft tidak terlihat employee.
- PAYSLIP-001-C: employee hanya dapat membaca published payslip miliknya sendiri.
- PAYSLIP-001-D: mengetahui UUID payslip employee lain tetap menghasilkan not found.
- PAYSLIP-001-E: employee tidak memiliki mutation route terhadap payslip.
- PAYSLIP-001-F: Foundation Board tidak dapat membaca personal payslip atau menjalankan import/publish.
- PAYSLIP-001-G: Super Admin tidak memperoleh employee self-view hanya karena privilege administratif.
- PAYSLIP-001-H: import/publish authorization ditegakkan server-side.
- PAYSLIP-001-I: sensitive read, preview, commit, dan publish diaudit tanpa menyalin isi `lines` ke audit payload.
- PAYSLIP-001-J: tidak ada payroll calculation engine atau derived payroll value pada MVP.
