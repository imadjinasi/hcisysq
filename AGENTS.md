# HCIS YSQ Engineering Rules

Dokumen ini berlaku untuk manusia, Lovable, Codex, dan automation lain yang mengubah repository.

## 1. Source of truth

Urutan otoritas:

1. Keputusan produk dan domain di `docs/product/` dan `docs/domain/`.
2. Kontrak HTTP di `docs/api/openapi.yaml`.
3. ADR berstatus `Accepted` di `docs/architecture/adr/`.
4. Automated test.
5. Implementasi kode.
6. Implementasi HCIS sebelumnya sebagai referensi discovery.

Bila sumber-sumber tersebut bertentangan, jangan menebak. Buat atau perbarui ADR/specification dan jelaskan konflik pada pull request.

## 2. Documentation first

- Fitur baru harus mempunyai specification ID sebelum implementasi.
- Perubahan perilaku wajib memperbarui dokumentasi dalam pull request yang sama.
- Workflow harus menjelaskan actor, precondition, input, state, transition, permission, notification, audit event, dan failure behavior.
- Field dan istilah domain harus konsisten dengan `docs/domain/glossary.md`.
- Asumsi yang belum diverifikasi harus ditandai `DRAFT`, `DISCOVERY`, atau `TBD`.

## 3. Architecture boundaries

- Frontend tidak boleh memuat aturan payroll, approval, authorization, saldo cuti, atau keputusan bisnis lain.
- Frontend berkomunikasi melalui kontrak API; jangan mengakses tabel production secara langsung.
- Domain logic tidak boleh bergantung langsung pada HTTP framework, database client, object storage, queue, email, atau vendor SDK.
- Integrasi eksternal harus berada di adapter/infrastructure layer.
- Jangan memperkenalkan microservice tanpa ADR yang menjelaskan kebutuhan, failure mode, observability, dan biaya operasional.
- Jangan mendukung beberapa database relasional hanya demi fleksibilitas. Portabilitas dicapai melalui konfigurasi dan adapter, bukan duplikasi perilaku database.

## 4. Ownership penggunaan AI

### Lovable

Lovable digunakan untuk eksplorasi UI, design system, responsive states, dan prototype dengan mock data. Perubahan hasil Lovable harus direview sebelum menjadi source of truth.

Lovable tidak boleh menentukan aturan payroll, approval chain, permission, migrasi, atau keamanan production.

### Codex

Codex digunakan untuk discovery codebase lama, implementasi, refactor, migration, test, CI/CD, dan review. Codex wajib membaca dokumen yang relevan sebelum mengubah kode dan menyebut specification ID pada ringkasan perubahan.

### Manusia

Keputusan produk, akses data, nominal payroll, aturan legal/HR, dan cutover production tetap membutuhkan persetujuan manusia yang berwenang.

## 5. Quality gates

Sebelum merge:

- acceptance criteria terpenuhi;
- typecheck, lint, test, dan build lulus;
- setiap permission baru memiliki automated test;
- setiap state transition penting menghasilkan audit event;
- migration memiliki rollback atau recovery plan;
- kontrak API dan client tetap sinkron;
- error, loading, empty, forbidden, dan mobile state diperiksa;
- dokumentasi diperbarui;
- tidak ada secret atau data pribadi pada diff.

## 6. Security and privacy

- Gunakan data sintetis untuk development, prompt, test, screenshot, dan demo.
- Jangan commit `.env`, token, credential, database dump, dokumen pegawai, foto absensi, slip gaji, atau data payroll.
- Jangan log password, token, nomor identitas lengkap, rekening, nominal sensitif, atau isi dokumen.
- Terapkan least privilege pada role aplikasi, database, storage, dan deployment.
- Perubahan auth, permission, audit, payroll, atau data migration harus mendapat review tambahan.

## 7. Pull request discipline

- Satu pull request harus mempunyai tujuan yang jelas dan scope terkontrol.
- Sertakan specification ID, risiko, perubahan database, bukti test, dan langkah rollback.
- Jangan mencampur refactor besar dengan perubahan perilaku tanpa alasan kuat.
- Jangan menonaktifkan test untuk meloloskan perubahan.
- Jangan melakukan force push ke `main`.
