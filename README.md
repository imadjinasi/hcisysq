# HCIS YSQ

Human Capital Information System untuk Yayasan Sabilul Qur'an.

Repository ini adalah **source of truth canonical** untuk dokumentasi dan implementasi HCIS baru. Perilaku produk, aturan domain, kontrak API, keamanan, pengujian, dan strategi migrasi harus terdokumentasi sebelum implementasi dianggap selesai.

## Status

**MVP foundation / implementation.** Belum ada rilis production dari repository ini.

Implementasi HCIS sebelumnya diperlakukan sebagai referensi perilaku dan sumber discovery. Repository UI awal `imadjinasi/hcis-ysq-foundation` sekarang juga diperlakukan sebagai reference/archive; selected UI sudah dikonsolidasikan ke `apps/web`.

## Target MVP

MVP berfokus pada:

- backend + PostgreSQL local foundation;
- employee master dan controlled XLSX import;
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
  api/        Fastify API + application/infrastructure adapters
  worker/     background jobs dan scheduled processing (later)
packages/
  domain/     aturan bisnis murni bila reuse lintas modul sudah nyata
  contracts/  schema/OpenAPI helpers/API client
  config/     shared configuration bila diperlukan
  ui/         shared UI package bila reuse lintas app sudah nyata
docs/         spesifikasi dan keputusan
infra/        local/deployment profiles
```

## Frontend lokal

```bash
npm install
npm run dev:web
```

## Backend lokal

Copy contoh environment menjadi file lokal yang tidak di-commit, isi password lokal yang sama, lalu jalankan:

```bash
cp infra/.env.example infra/.env.local
cp apps/api/.env.example apps/api/.env.local
npm run db:up
npm run migrate:api
npm run dev:api
```

Employee master import bootstrap dijelaskan di [`docs/domain/employee-import.md`](docs/domain/employee-import.md) dan [`apps/api/README.md`](apps/api/README.md).

## Quality gates

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Lockfile harus diperbarui dan seluruh gate diverifikasi dari environment lokal/CI setelah dependency backend ditambahkan.

## Peta dokumentasi

- [`AGENTS.md`](AGENTS.md) — aturan kerja wajib untuk manusia dan coding agent.
- [`docs/product/mvp.md`](docs/product/mvp.md) — target MVP.
- [`docs/domain/employee-import.md`](docs/domain/employee-import.md) — employee master import.
- [`docs/README.md`](docs/README.md) — indeks dokumentasi.
- [`docs/product/feature-parity.yaml`](docs/product/feature-parity.yaml) — inventaris fitur dan status parity.
- [`docs/domain/`](docs/domain/) — glossary, access, role, permission, dan workflow.
- [`docs/design/`](docs/design/) — brand dan UI direction.
- [`docs/api/openapi.yaml`](docs/api/openapi.yaml) — kontrak HTTP; import employee belum diekspos via HTTP sampai authorization foundation tersedia.
- [`docs/security/security-baseline.md`](docs/security/security-baseline.md) — baseline keamanan.
- [`docs/testing/`](docs/testing/) — strategi test dan definition of done.
- [`docs/development/ai-assisted-workflow.md`](docs/development/ai-assisted-workflow.md) — implementation + Codex Local verification workflow.

## Catatan keamanan

Repository saat ini bersifat publik. Jangan pernah memasukkan credential, `.env`, database dump, master spreadsheet pegawai, foto absensi, dokumen pegawai, slip gaji production, data payroll production, atau contoh yang dapat mengidentifikasi individu.
