# Dokumentasi HCIS YSQ

Dokumentasi ini adalah spesifikasi kerja, bukan arsip pasif. Perubahan perilaku harus mengubah dokumen dan test yang terkait.

## Urutan membaca

1. `product/vision.md`
2. `product/mvp.md`
3. `product/scope.md`
4. `product/feature-parity.yaml`
5. `domain/glossary.md`
6. `domain/access-model.md`
7. `domain/roles-permissions.md`
8. specification/workflow modul yang akan dikerjakan, termasuk `domain/employee-import.md` untuk EMP-004
9. `architecture/system-context.md`
10. ADR yang relevan
11. `api/openapi.yaml`
12. security dan testing guidance

Untuk frontend, baca juga:

- `design/brand-guideline.md`
- `design/ui-guidelines.md`
- `design/ui-foundation.md`

## Status dokumen

- `DRAFT` — isi awal, belum disetujui.
- `DISCOVERY` — sedang diekstrak dan dibandingkan dengan implementasi sebelumnya.
- `PROPOSED` — keputusan diajukan, belum menjadi aturan wajib.
- `ACCEPTED` — menjadi acuan implementasi.
- `ACTIVE` — foundation/direction yang sedang berlaku.
- `SUPERSEDED` — digantikan dokumen/ADR lain.

## Konvensi specification ID

```text
AUTH-###
EMP-###
ORG-###
ATT-###
LEAVE-###
APR-###
PAY-###
LOAN-###
PERF-###
TRAIN-###
DOC-###
REIMB-###
NOTIF-###
MIG-###
SEC-###
```

ID tidak boleh digunakan ulang untuk perilaku berbeda.

## Definition of ready

Sebuah item siap diimplementasikan ketika minimal memiliki:

- actor;
- tujuan pengguna;
- precondition;
- input dan validasi;
- happy path;
- failure/forbidden behavior;
- permission;
- audit event;
- notification behavior bila ada;
- acceptance criteria;
- dependency dan migration impact.

## Pemeliharaan

Dokumentasi tidak boleh dibiarkan tertinggal dari implementasi. Pull request yang mengubah perilaku tanpa memperbarui spesifikasi dianggap belum selesai.
