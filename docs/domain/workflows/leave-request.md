# Leave Request Workflow

**Status:** DRAFT  
**Specifications:** LEAVE-001, LEAVE-002, APR-001

## Actors

- Employee sebagai requester.
- Direct manager/current approver.
- Human Capital approver bila policy mengharuskan.
- Administrator dengan permission koreksi khusus.

## Preconditions

- Employee aktif.
- Leave type aktif dan tersedia untuk employee.
- Kalender kerja dan timezone organisasi terkonfigurasi.
- Approval chain dapat dibentuk.

## Input awal

- leave type;
- start date;
- end date;
- partial-day indicator bila didukung;
- reason;
- attachment bila diwajibkan;
- contact/delegation information bila policy meminta.

## Invariants

- Start date tidak boleh setelah end date.
- Request tidak boleh overlap dengan leave/attendance event yang dilarang.
- Working-day calculation memakai policy dan kalender yang sama di preview maupun submit.
- Balance tidak boleh negatif kecuali policy leave type secara eksplisit mengizinkan.
- Requester hanya dapat mengubah draft atau membatalkan pada state yang diizinkan.
- Approval tidak boleh dilakukan actor yang tidak memiliki active step.

## States

```text
draft
  -> submitted
submitted
  -> in_review
in_review
  -> approved
  -> rejected
  -> cancelled
approved
  -> cancellation_requested  # bila pembatalan pasca-approval didukung
```

State tambahan harus melalui ADR/spec update.

## Submit flow

1. API memvalidasi schema dan idempotency key.
2. Domain memuat employee, leave type, calendar, balance, dan conflicting requests.
3. Sistem menghitung working days dan balance impact.
4. Approval chain dibentuk dan disnapshot sesuai policy.
5. Request, balance reservation bila digunakan, first approval step, dan audit event disimpan dalam transaksi.
6. Notification job dipublikasikan setelah commit.
7. Response mengembalikan status, calculation summary, dan next action.

## Authorization

- Employee hanya melihat request milik sendiri kecuali permission tambahan.
- Approver hanya melihat data yang diperlukan untuk keputusan.
- Human Capital/admin melihat scope sesuai permission, bukan otomatis semua data.
- Attachment memakai authorization yang sama dengan request induk.

## Notifications

- Requester menerima konfirmasi submit.
- Current approver menerima task baru.
- Requester menerima hasil approval/rejection/cancellation.
- Notification tidak boleh memuat data sensitif berlebih pada push/WhatsApp.

## Audit events

```text
leave.request.created
leave.request.submitted
leave.request.approved_step
leave.request.rejected
leave.request.cancelled
leave.request.reassigned
leave.balance.adjusted
```

## Failure behavior

- Calendar/configuration missing: submit gagal dengan error yang dapat ditindaklanjuti; tidak membuat request parsial.
- Notification provider down: request tetap committed, job di-retry, error tercatat.
- Concurrent submit: idempotency mencegah duplikasi.
- Concurrent balance use: transaction/locking mencegah overspend.

## Acceptance criteria awal

- LEAVE-001-A: employee aktif dapat preview jumlah hari kerja.
- LEAVE-001-B: submit menghasilkan satu request dan satu chain walau request diulang dengan idempotency key yang sama.
- LEAVE-001-C: tanggal terbalik ditolak.
- LEAVE-001-D: overlap yang dilarang ditolak dengan field-level error.
- LEAVE-001-E: saldo tidak cukup ditolak tanpa perubahan data.
- LEAVE-001-F: approver yang sah dapat menyetujui dan audit event tercatat.
- LEAVE-001-G: actor lain mendapat forbidden tanpa membocorkan detail request.
- LEAVE-001-H: notification failure tidak menggagalkan submit/approval.
- LEAVE-001-I: mobile UI menampilkan status dan next action secara jelas.

## Open questions

- Leave type dan entitlement yang berlaku.
- Kebijakan half-day.
- Aturan backdated/future-dated request.
- Apakah balance di-reserve saat submit atau dipotong saat final approval.
- Approval chain per unit/posisi.
- Prosedur pembatalan setelah approved.
- Batas dan format attachment medis.