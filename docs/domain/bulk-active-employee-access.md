# Bulk Active Employee Access

**Status:** IMPLEMENTED — PRODUCTION OPERATION REQUIRES CONFIRMED SUPER ADMIN PREVIEW
**Specification:** ACCESS-ORG-001
**Related:** AUTH-002, AUTH-010, SEC-001, ORG-004

## Policy

Setiap pegawai dengan `employee.status = active` harus dapat memperoleh akses HCIS yang dapat digunakan. Penyiapan secara bulk menyelaraskan account dengan kebijakan tersebut tanpa mengubah syarat eligibility Organization Authority Resolver.

Account `invited` tetap belum eligible untuk workflow. Account baru menjadi `active` setelah pemilik account menyelesaikan activation flow dan membuat password sendiri. Operasi bulk tidak membuat password, tidak mengaktifkan account invited, tidak mengubah organization successor, dan tidak mengubah rollout `LEGACY`/`SHADOW`/`STRUCTURE`.

## Actor and permission

- Actor: `SUPER_ADMIN` yang terautentikasi.
- Permission boundary: kedua endpoint bulk memeriksa principal di backend.
- Employee, Foundation Board, dan request tanpa session ditolak sebelum preview atau mutation query dijalankan.
- Maksimum satu batch: 200 employee ID unik dan eksplisit.

## Preconditions and input

Input adalah daftar explicit `employeeIds` hasil pilihan administrator pada Account & Access. UI mendukung multi-select, memilih seluruh hasil filter saat ini, membersihkan pilihan, preview, dan konfirmasi.

Account baru hanya dapat disiapkan ketika:

- employee masih `active`;
- employee belum mempunyai account `EMPLOYEE`;
- email employee valid dan unik;
- email belum dipakai account lain.

Email tidak pernah dibuat atau ditebak oleh sistem.

## Preview categories

Preview tidak memutasi data dan mengklasifikasikan setiap employee sebagai:

- `ALREADY_ACTIVE`;
- `INVITATION_REQUIRED`;
- `ACCOUNT_PREPARATION_REQUIRED`;
- `SAFE_REACTIVATION`;
- `SKIPPED_EMPLOYEE_NOT_ACTIVE`;
- `SUSPENDED_UNCHANGED`;
- `REQUIRES_REVIEW`.

UI wajib menyebut `AKSES AKTIF` dan `MENUNGGU AKTIVASI` sebagai state yang berbeda.

## State transitions

| Employee/account before | Bulk behavior | Account after |
| --- | --- | --- |
| active employee + active account | no-op | active |
| active employee + invited account tanpa password | revoke active invitation token lama, issue token baru | invited |
| active employee + no account + unique valid email | prepare canonical `EMPLOYEE` account, issue invitation | invited |
| active employee + inactive account + existing credential | safe reactivation through canonical account update | active |
| active employee + inactive account tanpa credential | requires review | unchanged |
| active employee + suspended account | security decision preserved | suspended |
| inactive/resigned employee | skipped | unchanged |
| missing/invalid/duplicate/conflicting email/account | requires review | unchanged |

`invited -> active` hanya terjadi di AUTH-002 activation completion setelah employee memberikan password yang valid. Reissue selalu mencabut token aktif sebelumnya sehingga hanya satu token yang valid untuk satu account.

## Transaction and partial result behavior

- Setiap employee diproses dalam transaksi tersendiri agar account preparation, invitation rotation, status transition, dan audit item commit atau rollback bersama.
- Business validation yang diperkirakan menghasilkan per-item outcome dan tidak menghentikan item valid lain.
- Unique index account per employee dan case-insensitive email tetap menjadi concurrency guard terakhir.
- Retry/repeated bulk operation aman: active tetap no-op; invited mendapat satu token baru dan token lama dicabut; account tidak diduplikasi.
- API mengembalikan summary dan per-item result. Activation link hanya tersedia pada response issuance; UI menyembunyikan daftar secara default dan menyalin satu link pada satu waktu.

## Audit

Setiap item mencatat `bulkOperationId`, actor account, employee/account yang terdampak, action, previous status, resulting status, invitation-issued flag, reason code, dan timestamp melalui `access_audit_events`.

Semantic event yang sudah ada tetap dipertahankan:

- `employee.account.prepared`;
- `account.activation.issued`;
- `account.status.updated`.

Bulk menambah:

- `employee.access.bulk.item`;
- `employee.access.bulk.item.failed`;
- `employee.access.bulk.completed`.

Audit tidak menyimpan activation token/path, password, password hash, session secret, atau credential secret lain.

## API

```text
POST /admin/access/employee-accounts/bulk-preview
POST /admin/access/employee-accounts/bulk-prepare
```

Keduanya menerima:

```json
{ "employeeIds": ["uuid"] }
```

## Failure behavior

- input kosong, lebih dari 200, duplicate ID, atau ID non-UUID: `400` tanpa mutasi;
- actor bukan Super Admin: `401/403` tanpa preview/mutasi;
- employee tidak ditemukan: item `FAILED`;
- unique/concurrent conflict: item rollback lalu `FAILED`/review pada retry;
- missing/invalid/duplicate/conflicting email: `REQUIRES_REVIEW`;
- audit failure di dalam transaksi item: seluruh perubahan item rollback;
- account suspended: unchanged, tidak diaktifkan otomatis;
- notification/email adapter belum tersedia: issuance menghasilkan link berumur 24 jam mengikuti AUTH-002 dan administrator mendistribusikannya melalui kanal internal yang sesuai.

## Acceptance criteria

- ACCESS-ORG-001-A: Super Admin dapat multi-select dan select-all hasil filter maksimal 200 employee.
- ACCESS-ORG-001-B: preview membedakan already active, invitation, account preparation, safe reactivation, suspended, skipped, dan review.
- ACCESS-ORG-001-C: no-account hanya disiapkan dengan unique valid email.
- ACCESS-ORG-001-D: invited tetap invited sampai employee membuat password melalui activation completion.
- ACCESS-ORG-001-E: reissue mencabut token lama dan tidak meninggalkan dua token aktif.
- ACCESS-ORG-001-F: suspended tidak pernah otomatis aktif.
- ACCESS-ORG-001-G: inactive/resigned employee tidak mendapat account/invitation baru.
- ACCESS-ORG-001-H: setiap item dan summary bulk dapat diaudit tanpa credential secret.
- ACCESS-ORG-001-I: repeated operation tidak membuat duplicate account dan aman terhadap retry.
- ACCESS-ORG-001-J: Organization Authority Resolver, vacancy climb, Leave semantics, successor, published snapshot, dan rollout tidak berubah.
