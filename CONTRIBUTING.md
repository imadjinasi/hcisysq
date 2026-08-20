# Contributing to HCIS YSQ

## Sebelum mulai

1. Baca `AGENTS.md`.
2. Temukan specification ID di `docs/product/feature-parity.yaml` atau workflow terkait.
3. Pastikan requirement dan acceptance criteria cukup jelas.
4. Buat branch dari `main`.

## Penamaan branch

```text
feature/<spec-id>-ringkas
fix/<spec-id>-ringkas
docs/<topik>
chore/<topik>
```

Contoh:

```text
feature/leave-001-submit-request
```

## Commit

Gunakan pesan yang menjelaskan tujuan:

```text
feat(leave): add request submission validation
fix(auth): reject inactive employee sessions
docs(architecture): record storage adapter decision
```

## Pull request

Pull request wajib menjelaskan:

- specification ID;
- masalah dan outcome;
- perubahan perilaku;
- perubahan database/API;
- risiko keamanan dan privasi;
- test yang dijalankan;
- screenshot dengan data sintetis bila UI berubah;
- rollback/recovery plan.

## Data development

Dilarang menggunakan data production. Seeder dan fixture harus sintetis, reproducible, dan tidak menyerupai individu nyata secara sengaja.
