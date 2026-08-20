# ADR-0002: Use Ports and Adapters for External Infrastructure

- **Status:** ACCEPTED
- **Date:** 2026-08-20

## Context

HCIS harus dapat berjalan pada managed environment sekarang dan dipindahkan ke VPS atau provider lain kemudian. Vendor-specific calls yang tersebar di business logic akan membuat perpindahan mahal dan berisiko.

## Decision

Domain/application layer bergantung pada interface/port. Implementasi database, storage, queue, email, WhatsApp, identity provider, dan document rendering ditempatkan pada adapter.

Contoh capability:

```text
EmployeeRepository
ApprovalRepository
ObjectStorage
JobQueue
MailSender
WhatsAppSender
IdentityProvider
DocumentRenderer
Clock
AuditSink
```

Environment memilih adapter melalui konfigurasi yang divalidasi saat startup.

## Constraints

- Port harus mewakili kebutuhan domain, bukan menyalin seluruh SDK vendor.
- Jangan membuat abstraction hipotetis tanpa use case nyata.
- Provider-specific metadata tetap berada di infrastructure layer.
- Contract test diperlukan untuk adapter kritis.
- Satu environment menggunakan satu adapter aktif per capability kecuali failover didesain eksplisit.

## Consequences

- Perpindahan provider lebih terkontrol.
- Test domain dapat memakai in-memory fake.
- Ada biaya tambahan untuk interface dan contract tests.
- Fitur vendor khusus perlu keputusan eksplisit agar tidak bocor ke domain.