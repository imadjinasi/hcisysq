# HCIS YSQ

Human Capital Information System untuk Yayasan Sabilul Qur'an.

Repository ini dibangun dengan pendekatan **documentation-first**. Perilaku produk, aturan domain, kontrak API, keamanan, pengujian, dan strategi migrasi harus terdokumentasi sebelum implementasi dianggap selesai.

## Status

**Foundation / discovery.** Belum ada rilis production dari repository ini.

Implementasi HCIS sebelumnya diperlakukan sebagai **referensi perilaku dan sumber discovery**, bukan sebagai kode yang harus disalin mentah. Perilaku lama yang terbukti salah, tidak aman, atau tidak sesuai kebutuhan boleh diperbaiki melalui keputusan terdokumentasi.

## Prinsip utama

- GitHub adalah source of truth kode dan dokumentasi.
- Dokumentasi produk dan domain memandu implementasi.
- UI tidak menjadi tempat aturan payroll, approval, permission, atau saldo cuti.
- Integrasi database, storage, antrean, email, dan WhatsApp menggunakan adapter agar deployment dapat berpindah environment.
- Semua contoh, fixture, dan screenshot development wajib menggunakan data sintetis.
- Perubahan perilaku wajib disertai pembaruan dokumentasi dan automated test.
- HCIS dibangun sebagai modular monolith terlebih dahulu; microservices bukan target awal.

## Peta dokumentasi

- [`AGENTS.md`](AGENTS.md) — aturan kerja wajib untuk manusia dan coding agent.
- [`docs/README.md`](docs/README.md) — indeks dan urutan membaca dokumentasi.
- [`docs/product/vision.md`](docs/product/vision.md) — tujuan produk dan outcome.
- [`docs/product/scope.md`](docs/product/scope.md) — cakupan dan tahapan implementasi.
- [`docs/product/feature-parity.yaml`](docs/product/feature-parity.yaml) — inventaris fitur dan status parity.
- [`docs/domain/`](docs/domain/) — glossary, role, permission, dan workflow.
- [`docs/architecture/`](docs/architecture/) — konteks sistem dan ADR.
- [`docs/api/openapi.yaml`](docs/api/openapi.yaml) — kontrak API awal.
- [`docs/migration/strategy.md`](docs/migration/strategy.md) — strategi migrasi dari implementasi sebelumnya.
- [`docs/security/security-baseline.md`](docs/security/security-baseline.md) — baseline keamanan.
- [`docs/testing/`](docs/testing/) — strategi test dan definition of done.
- [`docs/development/ai-assisted-workflow.md`](docs/development/ai-assisted-workflow.md) — alur Lovable, Codex, dan review manusia.

## Struktur target

```text
apps/
  web/        frontend dan UI
  api/        HTTP API dan application layer
  worker/     background jobs dan scheduled processing
packages/
  domain/     aturan bisnis murni
  contracts/  schema, OpenAPI helpers, dan API client
  config/     validasi environment
  ui/         design tokens dan reusable components
docs/         spesifikasi dan keputusan
infra/        deployment profiles
```

Struktur tersebut adalah target; folder kode dibuat ketika keputusan stack dan vertical slice pertama telah disetujui.

## Alur perubahan

1. Tetapkan atau perbarui specification ID di `docs/`.
2. Implementasikan perubahan pada branch terpisah.
3. Tambahkan test dan bukti verifikasi.
4. Buka pull request menggunakan template repository.
5. Merge hanya setelah quality gate terpenuhi.

## Catatan keamanan

Repository saat ini bersifat publik. Jangan pernah memasukkan credential, `.env`, database dump, foto absensi, dokumen pegawai, slip gaji, data payroll, atau contoh yang dapat mengidentifikasi individu.