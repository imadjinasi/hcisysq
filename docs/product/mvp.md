# HCIS YSQ MVP

**Status:** ACCEPTED  
**Updated:** 2026-08-20

## Tujuan

MVP harus membuktikan bahwa HCIS baru memiliki fondasi akses dan approval yang stabil, dapat dijalankan lokal dari satu repository canonical, dan sudah memberikan nilai self-service dasar kepada pegawai.

MVP tidak mengejar feature parity penuh dengan legacy HCIS.

## Outcome MVP

### 1. Identity dan access foundation

- Satu login surface untuk semua account type.
- Account type: `EMPLOYEE`, `FOUNDATION_BOARD`, dan `SUPER_ADMIN`.
- Employee aktif selalu memperoleh base employee self-service access.
- Role tambahan bersifat additive dan memiliki scope.
- Organ Yayasan memiliki panel statistik/report read-only.
- Super Admin digunakan untuk administrasi akses dan audit, bukan sebagai jabatan organisasi.

### 2. Employee workspace

- Login prototype/foundation UI.
- App shell responsive.
- Dashboard pegawai.
- Ringkasan kehadiran.
- Ringkasan saldo cuti.
- Pengajuan milik pegawai.
- Payslip read-only.
- Management navigation muncul hanya sebagai lapisan tambahan untuk pegawai yang memiliki kewenangan.

### 3. Leave vertical slice

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

### 4. Payslip read-only melalui import

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

### 5. Foundation Board panel

Panel Organ Yayasan bersifat read-only dan berfokus pada statistik serta report agregat. Detail sensitif tidak otomatis terbuka hanya karena account type ini.

### 6. Super Admin minimum

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
3. employee dapat menyelesaikan leave flow end-to-end dengan synthetic data;
4. approval chain stabil terhadap perubahan organisasi setelah request dibuat;
5. role/scope memiliki authorization test;
6. payslip import dan read-only employee access memiliki test;
7. Foundation Board tidak dapat melakukan mutation;
8. audit event tersedia untuk operasi sensitif;
9. tidak ada secret atau real employee/payroll data di repository/test fixture.
