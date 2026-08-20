# HCIS YSQ

Human Capital Information System untuk Yayasan Sabilul Qur'an.

Repository ini adalah **source of truth canonical** untuk dokumentasi dan implementasi HCIS baru. Perilaku produk, aturan domain, kontrak API, keamanan, pengujian, dan strategi migrasi harus terdokumentasi sebelum implementasi dianggap selesai.

## Status

**MVP foundation / implementation.** Belum ada rilis production dari repository ini.

Implementasi HCIS sebelumnya diperlakukan sebagai referensi perilaku dan sumber discovery. Repository UI awal `imadjinasi/hcis-ysq-foundation` sekarang juga diperlakukan sebagai reference/archive; selected UI sudah dikonsolidasikan ke `apps/web`.

## Target MVP

MVP berfokus pada:

- identity dan access foundation;
- employee app shell/dashboard;
- leave end-to-end dengan approval chain snapshot;
- payslip read-only dari proses import;
- Foundation Board statistics/report read-only;
- Super Admin minimum untuk access/audit.

Reimbursement dan payroll calculation penuh berada setelah MVP. Detail ada di [`docs/product/mvp.md`](docs/product/mvp.md).

## Prinsip utama

- GitHub repository ini adalah source of truth kode dan dokumentasi.
- Dokumentasi produk dan domain memandu implementasi.
- UI tidak menjadi tempat aturan payroll, approval, permission, atau saldo cuti.
- Integrasi database, storage, antrean, email, dan WhatsApp menggunakan adapter.
- Semua contoh, fixture, dan screenshot development wajib menggunakan data sintetis.
- Perubahan perilaku wajib disertai pembaruan dokumentasi dan automated test.
- HCIS dibangun sebagai modular monolith terlebih dahulu.

## Struktur

```text
apps/
  web/        canonical React frontend
  api/        HTTP API dan application layer (next)
  worker/     background jobs dan scheduled processing (later)
packages/
  domain/     aturan bisnis murni
  contracts/  schema/OpenAPI helpers/API client
  config/     validasi environment
  ui/         shared UI package bila reuse lintas app sudah nyata
docs/         spesifikasi dan keputusan
infra/        deployment profiles
```

Saat ini `apps/web` sudah tersedia. Folder lain dibuat ketika slice terkait mulai diimplementasikan.

## Frontend lokal

```bash
npm install
npm run dev:web
```

Quality gates:

```bash
npm run typecheck:web
npm run lint:web
npm run build:web
```

Lockfile dan hasil quality gate pertama harus diverifikasi dari environment lokal/CI yang memiliki akses dependency registry.

## Peta dokumentasi

- [`AGENTS.md`](AGENTS.md) — aturan kerja wajib untuk manusia dan coding agent.
- [`docs/product/mvp.md`](docs/product/mvp.md) — target MVP.
- [`docs/README.md`](docs/README.md) — indeks dokumentasi.
- [`docs/product/feature-parity.yaml`](docs/product/feature-parity.yaml) — inventaris fitur dan status parity.
- [`docs/domain/`](docs/domain/) — glossary, access, role, permission, dan workflow.
- [`docs/design/`](docs/design/) — brand dan UI direction.
- [`docs/api/openapi.yaml`](docs/api/openapi.yaml) — kontrak API awal.
- [`docs/security/security-baseline.md`](docs/security/security-baseline.md) — baseline keamanan.
- [`docs/testing/`](docs/testing/) — strategi test dan definition of done.
- [`docs/development/ai-assisted-workflow.md`](docs/development/ai-assisted-workflow.md) — implementation + Codex Local verification workflow.

## Catatan keamanan

Repository saat ini bersifat publik. Jangan pernah memasukkan credential, `.env`, database dump, foto absensi, dokumen pegawai, slip gaji production, data payroll production, atau contoh yang dapat mengidentifikasi individu.
