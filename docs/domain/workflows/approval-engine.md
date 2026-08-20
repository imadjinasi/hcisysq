# Approval Engine

**Status:** ACCEPTED  
**Specification:** APR-001

## Tujuan

Menyediakan pola approval yang sederhana dan konsisten untuk leave, attendance clarification, reimbursement, loan, overtime, dokumen, dan request lain tanpa menggandakan logika chain di setiap modul.

Prinsip utama:

> **Resolve chain sekali saat submit, simpan sebagai snapshot, lalu jalankan step demi step.**

Hierarchy atau role yang berubah setelah request dikirim tidak boleh diam-diam mengubah approval yang sedang berjalan.

## Scope release awal

Release awal sengaja sederhana:

- approval sequential;
- satu approver efektif per step;
- tidak ada parallel approval/quorum;
- tidak ada delegation generik;
- tidak ada auto-approval atau expiry generik;
- reassignment hanya melalui prosedur resmi.

Fitur yang lebih kompleks hanya boleh ditambahkan bila ada kebutuhan domain nyata dan spesifikasi baru.

## Actors

- Requester.
- Current approver.
- Domain administrator dengan permission `approvals.reassign` atau permission khusus modul.
- System untuk menjalankan transisi, audit, dan notifikasi.

## Resolver approver

Workflow template tidak menyimpan nama orang sebagai default. Ia menyimpan cara menemukan approver.

Resolver awal yang didukung:

```text
DIRECT_MANAGER
UNIT_ROLE(role_key)
ORG_ROLE(role_key)
SPECIFIC_PERSON(user_id)
```

Contoh template cuti:

```text
Step 1 -> DIRECT_MANAGER
Step 2 -> ORG_ROLE(HC)
```

Ketika Ahmad submit, resolver dapat menghasilkan:

```text
Step 1 -> Budi
Step 2 -> Siti
```

Hasil tersebut disimpan sebagai snapshot untuk request Ahmad.

## Submit lifecycle

Saat request di-submit:

1. validasi request domain;
2. ambil organization context yang relevan;
3. pilih workflow template yang berlaku;
4. resolve seluruh step menjadi approver konkret;
5. validasi chain;
6. simpan ordered approval steps sebagai snapshot;
7. tandai step pertama sebagai current/pending;
8. commit request + chain + audit event secara atomik;
9. kirim notification setelah commit.

Jika resolver wajib tidak menemukan approver yang valid, request **tidak boleh masuk ke chain setengah jadi**. Submit gagal dengan configuration error yang actionable untuk administrator.

## Chain validation

### No self-approval

Requester tidak boleh menjadi approver request miliknya sendiri.

Jika resolver menghasilkan requester, workflow harus menggunakan fallback yang memang terdokumentasi. Bila tidak ada fallback, submission gagal sebagai configuration error.

### Duplicate approver

Orang yang sama tidak perlu menyetujui request dua kali pada chain sequential yang sama.

Jika orang yang sama ter-resolve pada beberapa step berturut/berikutnya, duplicate step di-deduplicate kecuali sebuah domain secara eksplisit mensyaratkan keputusan berbeda.

### Active approver

Approver baru harus active dan memiliki capability yang dibutuhkan pada saat chain dibuat.

## Snapshot rule

Setelah chain tersimpan:

- perubahan atasan;
- perubahan unit;
- perubahan jabatan;
- perubahan role;

**tidak** mengubah chain request yang sudah submitted.

Request hanya berubah melalui aksi approval/rejection/cancel atau reassignment resmi.

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

Modul dapat menambah state domain bila didokumentasikan.

## State approval step

```text
waiting
pending -> approved
pending -> rejected
pending -> reassigned
waiting -> pending
```

`waiting` berarti step sudah menjadi bagian snapshot tetapi belum menjadi step aktif.

## Decision behavior

Hanya current approver yang valid dapat memutuskan current step.

### Approve

- current step -> `approved`;
- step berikutnya -> `pending`;
- jika tidak ada step berikutnya, request -> `approved`.

### Reject

- current step -> `rejected`;
- request -> `rejected`;
- step berikutnya tidak dijalankan.

### Cancel

Requester hanya dapat cancel pada state yang memang diizinkan domain. Cancel tidak boleh menghapus history step.

## Reassignment

Jika approver pada snapshot tidak lagi dapat menjalankan tugasnya, administrator berwenang dapat melakukan reassignment.

Reassignment wajib menyimpan:

- step yang diubah;
- approver lama;
- approver baru;
- actor yang melakukan perubahan;
- alasan;
- timestamp;
- audit correlation ID.

Reassignment tidak menghitung ulang seluruh chain.

## Required data

Minimal simpan:

- request type dan request ID;
- requester ID;
- organization context snapshot yang dibutuhkan;
- workflow/template version;
- ordered steps;
- resolver type dan resolver parameter;
- resolved approver principal;
- state setiap step;
- decision timestamp;
- decision note/reason bila diperlukan;
- version/concurrency token;
- audit correlation ID.

## Concurrency

Dua aksi tidak boleh memenangkan transition yang sama.

Decision harus memakai transaction dan locking/version check sehingga double-click, retry client, atau request paralel hanya menghasilkan satu transition final.

## Notifications

Notification bukan sumber kebenaran approval.

- keputusan committed lebih dulu;
- notifikasi dikirim sesudah commit;
- kegagalan notification dapat di-retry;
- retry notification tidak boleh mengulang decision.

## Contoh

### Cuti

```text
Employee
  -> DIRECT_MANAGER
  -> ORG_ROLE(HC)
```

### Reimbursement sederhana

```text
Employee
  -> DIRECT_MANAGER
  -> ORG_ROLE(FINANCE)
```

Jika nanti nominal tertentu membutuhkan approval Management, aturan tersebut menjadi workflow variant yang dipilih saat submit, lalu tetap disnapshot.

## Audit minimum

Audit event dibuat untuk:

- chain created;
- step approved;
- step rejected;
- request cancelled;
- step reassigned;
- configuration failure yang relevan untuk operasi.

## Acceptance criteria

- APR-001-A: chain lengkap di-resolve dan disimpan ketika request berhasil submit.
- APR-001-B: perubahan hierarchy setelah submit tidak mengubah chain existing.
- APR-001-C: requester tidak dapat self-approve.
- APR-001-D: duplicate approver tidak menghasilkan approval berulang tanpa alasan domain eksplisit.
- APR-001-E: resolver wajib yang gagal membuat submit gagal secara jelas, bukan menciptakan request macet.
- APR-001-F: actor tanpa current task mendapat forbidden.
- APR-001-G: double-submit decision hanya menghasilkan satu transition final.
- APR-001-H: reassignment membutuhkan permission, actor, approver lama/baru, dan alasan.
- APR-001-I: setiap decision dan reassignment menghasilkan audit event.
- APR-001-J: notification dapat di-retry tanpa mengulang transition.

## Deferred

Tidak termasuk release awal kecuali ada spesifikasi terpisah:

- parallel approval;
- quorum/N-of-M;
- delegation umum;
- generic escalation timer;
- generic expiry;
- generic auto-approval;
- visual workflow builder.
