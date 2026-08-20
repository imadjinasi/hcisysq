# Domain Workflows

Setiap workflow adalah kontrak perilaku lintas UI, API, domain, notification, audit, dan test.

## Template wajib

```md
# <Workflow Name>

Status: DRAFT | ACCEPTED
Specification IDs: ...

## Actors
## Preconditions
## Inputs
## Invariants
## States
## Transitions
## Authorization
## Notifications
## Audit events
## Failure behavior
## Acceptance criteria
## Open questions
```

## Aturan state machine

- State disimpan secara eksplisit; jangan menurunkannya dari kombinasi field yang ambigu.
- Transition dilakukan melalui application service/use case, bukan update field bebas.
- Setiap transition memvalidasi actor, current state, input, dan invariant.
- Transition sensitif menghasilkan audit event dalam transaksi yang konsisten.
- Retry notification tidak boleh mengulangi keputusan bisnis.
- Idempotency diperlukan untuk submit/import/webhook yang berpotensi dikirim ulang.

## Workflow tersedia

- [`approval-engine.md`](approval-engine.md)
- [`leave-request.md`](leave-request.md)
