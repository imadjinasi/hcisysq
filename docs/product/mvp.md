# HCIS YSQ MVP

**Status:** ACCEPTED  
**Updated:** 2026-08-20

## Tujuan

MVP harus membuktikan bahwa HCIS baru memiliki employee master, fondasi akses, dan approval yang stabil, dapat dijalankan lokal dari satu repository canonical, dan sudah memberikan nilai self-service dasar kepada pegawai.

MVP tidak mengejar feature parity penuh dengan legacy HCIS.

## Outcome MVP

### 1. Backend dan real access bootstrap

- API TypeScript dapat dijalankan lokal dan pada VPS verification environment.
- PostgreSQL tersedia melalui Docker untuk development/test/runtime verification.
- Migration dapat dijalankan pada database bersih maupun deployment yang sudah memiliki migration sebelumnya.
- Satu login surface digunakan untuk semua account type dan tidak menampilkan selector role.
- Account type: `EMPLOYEE`, `FOUNDATION_BOARD`, dan `SUPER_ADMIN`.
- Account dan employee record tetap entitas terpisah.
- Super Admin pertama dibootstrap melalui jalur one-time yang fail-closed, bukan public registration.
- Super Admin production menggunakan password ter-hash, MFA, server-side session, secure HttpOnly cookie, dan audit event.
- Landing area mengikuti access model: employee `/app`, Foundation Board `/board`, Super Admin `/admin`.
- Mengetik URL secara langsung tidak boleh memberi principal akses ke area principal lain.
- Detail bootstrap mengikuti `docs/security/super-admin-bootstrap.md` dan model akses mengikuti `docs/domain/access-model.md`.

### 2. Employee master + import foundation

Tahap ini dimulai setelah boundary Super Admin nyata sudah dapat diverifikasi.

- Employee master menggunakan UUID internal dan NIP sebagai natural key import/upsert.
- HC/Admin yang berwenang dapat melakukan preview -> confirm import employee dari XLSX.
- HTTP/admin import harus berada di belakang authorization backend; upload tidak boleh menjadi surface publik anonim.
- Import hanya mengambil allowlisted fields dan tidak otomatis membuat account.
- Unit dan position dasar dapat dibentuk dari import; reporting line ditetapkan terpisah.
- Detail aturan import mengikuti `docs/domain/employee-import.md`.

### 3. Identity dan access foundation lengkap

- Employee aktif selalu memperoleh base employee self-service access setelah account aktif.
- Role tambahan bersifat additive dan memiliki scope.
- Organ Yayasan memiliki panel statistik/report read-only.
- Super Admin digunakan untuk administrasi akses dan audit, bukan sebagai jabatan organisasi.
- Google sign-in, invitation, role assignment, dan scope management dikembangkan di atas account/session foundation yang sama; bootstrap Super Admin bukan sistem auth terpisah.

### 4. Employee workspace

- Login real menggantikan mock login sebelum real employee data digunakan.
- App shell responsive.
- Dashboard pegawai.
- Ringkasan kehadiran.
- Ringkasan saldo cuti.
- Pengajuan milik pegawai.
- Payslip read-only.
- Management navigation muncul hanya sebagai lapisan tambahan untuk pegawai yang memiliki kewenangan.

### 5. Leave vertical slice

Flow minimum:

```text
Employee
  -> preview cuti
  -> submit
  -> approval chain di-resolve sekali
  -> snapshot chain disimpan
  -> approver approve/reject
  -> request selesai
  -> audit trail tersedia
```

Approval wajib mengikuti `docs/domain/workflows/approval-engine.md`.

### 6. Payslip read-only melalui import

Untuk MVP, HCIS **tidak menghitung payroll**.

Data payslip dimasukkan melalui proses import yang terkontrol. Employee hanya dapat melihat data payslip miliknya sendiri.

Minimum scope:

- import dataset payslip;
- validasi format dan employee reference;
- hasil import dapat direview sebelum publish;
- employee melihat periode payslip yang sudah dipublish;
- data read-only bagi employee;
- akses ke payslip diaudit;
- tidak ada payroll calculation engine pada MVP.

### 7. Foundation Board panel

Panel Organ Yayasan bersifat read-only dan berfokus pada statistik serta report agregat. Detail sensitif tidak otomatis terbuka hanya karena account type ini.

### 8. Super Admin minimum

- user/account access overview;
- role assignment;
- scope assignment;
- audit log;
- recovery administratif.

## Urutan implementasi saat ini

```text
Backend Foundation
  -> Real Super Admin Auth
  -> Employee Master + Import
  -> Organization / Unit / Position
  -> Account + Role + Scope lengkap
  -> Reporting Line / Direct Manager
  -> Leave + Approval Snapshot
  -> Payslip Import
```

## Di luar MVP

- Reimbursement.
- Payroll calculation dan payroll reconciliation penuh.
- Loan/cicilan.
- Performance review penuh.
- LMS/training penuh.
- Recruitment.
- WhatsApp/email production integration.
- GPS/photo attendance production flow.
- Legacy data cutover.
- Production deployment dan real employee data.

## Definition of MVP complete

MVP dianggap selesai ketika:

1. repository canonical dapat di-setup lokal dari clone bersih;
2. lint, typecheck, automated test, dan build lulus;
3. clean PostgreSQL dapat dimigrasikan dan di-seed dengan synthetic data;
4. real Super Admin authentication memiliki password hashing, mandatory MFA, server-side session, secure cookie, route isolation, dan audit coverage;
5. employee XLSX import preview/commit memiliki automated test dan tidak menyimpan ignored sensitive fields;
6. employee dapat menyelesaikan leave flow end-to-end dengan synthetic data;
7. approval chain stabil terhadap perubahan organisasi setelah request dibuat;
8. role/scope memiliki authorization test;
9. payslip import dan read-only employee access memiliki test;
10. Foundation Board tidak dapat melakukan mutation;
11. audit event tersedia untuk operasi sensitif;
12. tidak ada secret atau real employee/payroll data di repository/test fixture.
