# Approval Engine

**Status:** DRAFT  
**Specification:** APR-001

## Tujuan

Menyediakan pola approval konsisten untuk leave, attendance clarification, reimbursement, loan, overtime, dan request lain tanpa menggandakan aturan state machine di setiap modul.

## Actors

- Requester.
- Current approver.
- Domain administrator dengan permission khusus.
- System scheduler untuk escalation/expiry yang terdokumentasi.

## Invariants

- Requester tidak boleh menyetujui step miliknya sendiri kecuali kebijakan domain secara eksplisit mengizinkan.
- Hanya current approver atau delegate yang valid dapat memutuskan step.
- Step yang sudah final tidak dapat diputuskan ulang.
- Urutan step konsisten dengan snapshot hierarchy/policy pada saat request dibuat, kecuali ada prosedur reassignment resmi.
- Keputusan bisnis dan audit event dibuat secara atomik.
- Notification failure tidak membatalkan keputusan yang sudah committed.

## State request generik

```text
draft
  -> submitted
submitted
  -> in_review
in_review
  -> approved
  -> rejected
  -> cancelled
approved/rejected/cancelled
  -> terminal
```

Modul dapat menambah state domain, tetapi harus didokumentasikan.

## State approval step

```text
pending -> approved
pending -> rejected
pending -> skipped
pending -> reassigned
```

## Required data

- request type dan request ID;
- requester ID;
- snapshot relevant organization context;
- ordered steps;
- approver principal dan alasan pemilihan;
- decision timestamp;
- decision note sesuai policy;
- version/concurrency token;
- audit correlation ID.

## Concurrency

Dua approver/request tidak boleh memenangkan transition yang sama. Implementasi harus menggunakan transaction dan optimistic/pessimistic locking yang sesuai.

## Reassignment

Reassignment hanya boleh dilakukan dengan permission khusus, alasan wajib, actor tercatat, dan notifikasi kepada approver lama/baru bila relevan.

## Acceptance criteria awal

- APR-001-A: actor tanpa tugas aktif mendapat forbidden.
- APR-001-B: double-submit keputusan menghasilkan satu hasil final.
- APR-001-C: rejection reason wajib pada domain yang mengharuskannya.
- APR-001-D: setiap keputusan menghasilkan audit event.
- APR-001-E: notification dapat di-retry tanpa mengulang transition.
- APR-001-F: perubahan hierarchy setelah submit tidak diam-diam mengubah chain tanpa kebijakan.

## Open questions

- Apakah chain memakai snapshot penuh atau resolusi dinamis per step?
- Apakah delegation diperlukan pada release awal?
- Domain mana yang mengizinkan auto-approval atau expiry?
- Siapa yang boleh melakukan emergency reassignment?