# Definition of Done

Sebuah fitur belum selesai hanya karena tampil di browser.

## Product and documentation

- Specification ID tersedia.
- Acceptance criteria terpenuhi.
- Glossary dan workflow diperbarui.
- OpenAPI diperbarui bila contract berubah.
- ADR dibuat bila keputusan arsitektur signifikan.
- Open questions yang menghalangi release diselesaikan.

## Implementation

- Domain rule berada pada boundary yang benar.
- Authorization diterapkan server-side.
- Error semantics konsisten.
- Idempotency/concurrency dipertimbangkan.
- Audit event tersedia untuk aksi sensitif.
- Notification dipisahkan dari transaction decision dan dapat di-retry.
- Configuration divalidasi saat startup.

## Test

- Unit test untuk rule penting.
- Integration test untuk transaction/repository/adapter.
- Authorization negative tests.
- Contract test atau OpenAPI validation.
- End-to-end happy path dan critical failure path.
- Migration test bila schema berubah.
- Accessibility/responsive checks untuk UI.
- Test memakai data sintetis.

## Security and privacy

- Tidak ada secret atau data pribadi pada diff/log/screenshot.
- Input, upload, export, dan object access diperiksa.
- Permission scope diperiksa.
- Security review dilakukan bila termasuk trigger pada baseline.

## Operations

- Health/readiness behavior benar.
- Log dan metric cukup untuk diagnosis.
- Failed-job/retry behavior diuji bila relevan.
- Rollback atau recovery plan tersedia.
- Resource impact dipertimbangkan untuk PDF, Excel, import, dan batch.

## Evidence pada PR

- Daftar command test dan hasil.
- Screenshot/video dengan synthetic data untuk perubahan UI.
- Contoh request/response untuk API.
- Migration/rollback note.
- Known limitation yang tidak disembunyikan.