# Product Scope

**Status:** DRAFT

## Prinsip sequencing

HCIS dibangun melalui vertical slice, bukan membuat seluruh halaman lebih dahulu. Setiap slice harus mencakup UI, API, domain rule, permission, audit, test, dan operasional minimum yang relevan.

MVP rinci mengikuti `docs/product/mvp.md`.

## Foundation

- API/runtime configuration dan health check.
- PostgreSQL local/CI foundation dan migration runner.
- Employee master + controlled XLSX import.
- Struktur organisasi, unit, posisi, dan hubungan atasan.
- Identity dan session.
- Role, permission, scope, dan policy.
- Audit trail.
- Notification abstraction.
- File/storage abstraction.
- Logging, backup, dan restore runbook.

## Foundation slice 0: employee master

```text
Start API + PostgreSQL
  -> upload synthetic employee workbook
  -> preview validation
  -> confirm import
  -> upsert employee by NIP
  -> normalize unit + position references
  -> review import history
```

Import employee precedes leave implementation because leave/approval depends on reliable employee, organization, and reporting data.

## Vertical slice pertama: leave

```text
Login
  -> profil pegawai
  -> ajukan cuti
  -> validasi saldo dan bentrok tanggal
  -> approval chain di-resolve dan di-snapshot
  -> approval atasan
  -> audit log
```

Slice ini dipilih karena menguji identity, hierarchy, role/scope, approval, state transition, dan audit tanpa risiko finansial setinggi payroll calculation.

## MVP tambahan: payslip read-only

MVP menyertakan payslip **read-only** yang berasal dari proses import. HCIS belum menghitung payroll pada tahap ini.

```text
HC/Finance import payslip dataset
  -> validasi
  -> review/publish
  -> employee melihat payslip miliknya
```

Reimbursement tidak termasuk MVP.

## Modul target setelah MVP

- Attendance dengan jadwal, lokasi, dan bukti yang disetujui.
- Reimbursement.
- Payroll calculation, rekonsiliasi, dan payslip penuh.
- Employee loan dan cicilan.
- Performance review.
- Training dan learning record.
- Surat kepegawaian dan peringatan.
- Kalender kerja dan hari libur.
- Announcement, reminder, email, dan WhatsApp notification.
- Data change request.
- Recruitment/careers bila lolos discovery dan prioritas produk.
- Reporting sesuai role.

## Di luar scope awal

- Native mobile app terpisah.
- Real-time chat internal.
- General ledger dan accounting lengkap.
- Biometric device management yang vendor-specific tanpa adapter.
- Data warehouse terpisah.
- Multi-tenant komersial.

## Release gates

### Foundation ready

- API dan PostgreSQL local dapat dijalankan dari clone bersih.
- Migration clean-database lulus.
- Employee import preview/commit lulus test dengan fixture sintetis.
- Identity, permission, audit, dan environment configuration memiliki test sebelum pilot.
- CI menjalankan lint, typecheck, test, build, dan security checks dasar.

### MVP ready

- Leave vertical slice lulus acceptance test end-to-end.
- Approval snapshot behavior dan role/scope memiliki automated test.
- Payslip import + read-only access lulus acceptance test dengan synthetic data.
- Foundation Board read-only boundary teruji.
- Canonical repository dapat di-setup lokal dari clone bersih.

### Pilot ready

- Staging menggunakan data sintetis/tersanitasi.
- Backup dan restore diuji.
- Observability minimum aktif.
- Pilot user dan rollback procedure disetujui.

### Production ready

- Migrasi rehearsal berhasil dan dapat direkonsiliasi.
- Security review selesai.
- Operational runbook tersedia.
- Legacy freeze dan cutover plan disetujui.
- Sistem lama tetap read-only selama periode verifikasi yang ditetapkan.
