# HCIS YSQ MVP

**Status:** ACCEPTED  
**Updated:** 2026-08-20

## Tujuan

MVP harus membuktikan bahwa HCIS baru memiliki employee master, fondasi akses, dan approval yang stabil, dapat dijalankan lokal dari satu repository canonical, dan sudah memberikan nilai self-service dasar kepada pegawai.

MVP tidak mengejar feature parity penuh dengan legacy HCIS.

## Outcome MVP

### 1. Backend dan employee master foundation

- API TypeScript dapat dijalankan lokal.
- PostgreSQL lokal tersedia melalui Docker untuk development/test.
- Migration dapat dijalankan pada database bersih.
- Employee master menggunakan UUID internal dan NIP sebagai natural key import/upsert.
- HC/Admin dapat melakukan preview -> confirm import employee dari XLSX.
- Import hanya mengambil allowlisted fields dan tidak otomatis membuat account.
- Unit dan position dasar dapat dibentuk dari import; reporting line ditetapkan terpisah.
- Detail aturan import mengikuti `docs/domain/employee-import.md`.

### 2. Identity dan access foundation

- Satu login surface untuk semua account type.
- Account type: `EMPLOYEE`, `FOUNDATION_BOARD`, dan `SUPER_ADMIN`.
- Employee aktif selalu memperoleh base employee self-service access setelah account aktif.
- Role tambahan bersifat additive dan memiliki scope.
- Organ Yayasan memiliki panel statistik/report read-only.
- Super Admin digunakan untuk administrasi akses dan audit, bukan sebagai jabatan organisasi.

### 3. Employee workspace

- Login prototype/foundation UI.
- App shell responsive.
- Dashboard pegawai.
- Ringkasan kehadiran.
- Ringkasan saldo cuti.
- Pengajuan milik pegawai.
- Payslip read-only.
- Management navigation muncul hanya sebagai lapisan tambahan untuk pegawai yang memiliki kewenangan.

### 4. Leave vertical slice

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

### 5. Payslip read-only melalui import

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

### 6. Foundation Board panel

Panel Organ Yayasan bersifat read-only dan berfokus pada statistik serta report agregat. Detail sensitif tidak otomatis terbuka hanya karena account type ini.

### 7. Super Admin minimum

- user/account access overview;
- role assignment;
- scope assignment;
- audit log;
- recovery administratif.

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
4. employee XLSX import preview/commit memiliki automated test dan tidak menyimpan ignored sensitive fields;
5. employee dapat menyelesaikan leave flow end-to-end dengan synthetic data;
6. approval chain stabil terhadap perubahan organisasi setelah request dibuat;
7. role/scope memiliki authorization test;
8. payslip import dan read-only employee access memiliki test;
9. Foundation Board tidak dapat melakukan mutation;
10. audit event tersedia untuk operasi sensitif;
11. tidak ada secret atau real employee/payroll data di repository/test fixture.
