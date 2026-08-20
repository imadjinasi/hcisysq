# Dokumentasi HCIS YSQ

Dokumentasi ini adalah spesifikasi kerja, bukan arsip pasif. Perubahan perilaku harus mengubah dokumen dan test yang terkait.

## Urutan membaca

1. `product/vision.md`
2. `product/scope.md`
3. `product/feature-parity.yaml`
4. `domain/glossary.md`
5. `domain/access-model.md`
6. `domain/roles-permissions.md`
7. workflow modul yang akan dikerjakan
8. `architecture/system-context.md`
9. ADR yang relevan
10. `api/openapi.yaml`
11. security dan testing guidance

## Status dokumen

- `DRAFT` — isi awal, belum disetujui.
- `DISCOVERY` — sedang diekstrak dan dibandingkan dengan implementasi sebelumnya.
- `PROPOSED` — keputusan diajukan, belum menjadi aturan wajib.
- `ACCEPTED` — menjadi acuan implementasi.
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