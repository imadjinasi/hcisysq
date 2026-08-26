# Employee Admin Surface

**Status:** ACCEPTED  
**Specifications:** EMP-001, EMP-004, AUTH-010, SEC-001  
**Milestone:** Admin Employee Master + Import vertical slice

## Goal

Menyediakan permukaan administrasi pegawai yang benar-benar dapat dipakai oleh `SUPER_ADMIN` sebelum modul organisasi, account assignment, reporting line, dan leave dibangun lebih lanjut.

Milestone ini sengaja lebih besar daripada satu halaman agar satu alur operasional dapat diuji end-to-end:

```text
Super Admin login
  -> daftar pegawai
  -> search/filter/pagination
  -> upload XLSX
  -> preview valid/warning/error
  -> confirm commit
  -> employee master ter-upsert berdasarkan NIP
  -> unit/jabatan referensi terbentuk
  -> riwayat import + actor audit tersedia
```

## Routes

Frontend:

- `/admin` — overview administrasi;
- `/admin/employees` — daftar employee master;
- `/admin/employees/import` — preview dan commit XLSX;
- `/admin/employees/imports` — riwayat import.

Backend, seluruhnya `SUPER_ADMIN` only:

- `GET /admin/employees`;
- `GET /admin/employee-imports`;
- `POST /admin/employee-imports/preview`;
- `GET /admin/employee-imports/:importId`;
- `POST /admin/employee-imports/:importId/commit`.

Public URL tetap menggunakan namespace `/api/*` melalui web proxy, sehingga browser memanggil `/api/admin/...`.

## Employee list

Daftar employee mendukung:

- search NIP, nama, atau email;
- filter status;
- filter unit;
- filter jabatan;
- pagination;
- summary jumlah active/inactive/resigned;
- kolom NIP, nama, status, unit, jabatan, email, dan TMT.

Employee list read-only pada milestone ini. Editing manual employee sengaja ditunda sampai validation dan ownership rules ditetapkan.

## Import

- Hanya `.xlsx`.
- Sheet sumber tetap `Master Data SDM YSQ`.
- Upload tidak langsung mengubah employee master.
- Server hanya menyimpan hasil normalisasi allowlisted fields, bukan raw workbook.
- Preview menyimpan checksum, row count, insert/update/warning/error count, row issues, waktu, dan actor.
- Commit ditolak bila preview memiliki error.
- Commit menggunakan NIP sebagai natural key upsert.
- Import tidak membuat account pengguna.
- Unit dan position dapat dibentuk dari nilai referensi hasil import.
- Raw file tidak disimpan permanen oleh aplikasi.

## Authorization and audit

- Semua endpoint milestone ini memerlukan session aktif dengan principal type `SUPER_ADMIN`.
- Frontend route guard bukan authorization utama; backend tetap memverifikasi session pada setiap request.
- `employee_import_jobs` menyimpan account pembuat preview dan account yang melakukan commit.
- Session, login, dan MFA tetap mengikuti baseline auth yang sudah diterima.

## Manual Employee Master lifecycle correction

`SUPER_ADMIN` dapat mengubah status lifecycle employee menjadi `active`, `inactive`, atau `resigned` melalui Employee Master dengan alasan wajib dan audit before/after. Perubahan status tidak membuat `ended_on`, tidak mengubah email login account, dan tidak mengaktifkan account.

Field tanggal Employee Master memakai kontrak canonical `YYYY-MM-DD`. Nilai tanggal legacy yang dibaca API sebagai timestamp dinormalisasi hanya untuk kontrol tanggal browser, tanpa mengubah hari atau mengosongkan field terkait. Bila payload tetap tidak valid, API mengembalikan `INVALID_EMPLOYEE_EDIT` beserta field yang perlu diperbaiki; error database tetap tidak membocorkan detail internal.

## Data safety

Repository, tests, dan contoh hanya menggunakan data sintetis. Workbook pegawai asli tidak boleh dimasukkan ke repository, test fixture, log, screenshot, atau prompt.

Deployment saat ini tetap diperlakukan sebagai development/pilot sampai production readiness dan cutover disetujui. Import workbook asli baru dilakukan setelah smoke test dengan workbook sintetis lolos.

## Acceptance criteria

- EMP-001-A: Super Admin dapat melihat daftar employee master dengan search/filter/pagination.
- EMP-001-B: principal non-Super Admin ditolak backend walaupun mengetik URL admin secara manual.
- EMP-004-A: `.xlsx` dapat dipreview tanpa mengubah employee master.
- EMP-004-B: preview menunjukkan insert/update/warning/error summary dan row issues.
- EMP-004-C: import dengan error tidak dapat di-commit.
- EMP-004-D: commit upsert employee berdasarkan NIP dan tidak membuat account.
- EMP-004-E: riwayat import menyimpan checksum, counts, timestamp, status, dan actor.
- EMP-004-F: raw workbook tidak disimpan permanen.
- EMP-004-G: UI memiliki loading, empty, error, forbidden/session-expired, dan responsive states.
