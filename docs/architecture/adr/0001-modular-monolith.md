# ADR-0001: Start as a Modular Monolith

- **Status:** PROPOSED
- **Date:** 2026-08-20

## Context

HCIS memiliki banyak domain yang saling berhubungan: employee, organization, approval, attendance, leave, payroll, loan, performance, dan documents. Tim membutuhkan development cepat, dokumentasi kuat, deployment sederhana, dan kemampuan berpindah environment.

Microservices sejak awal akan menambah distributed transaction, network failure, versioned contract, observability, deployment, dan operational overhead sebelum beban tersebut terbukti perlu.

## Decision

Bangun HCIS sebagai modular monolith dengan process terpisah untuk web/API dan worker bila diperlukan. Setiap domain memiliki boundary internal dan dilarang mengakses internal modul lain secara sembarang.

## Consequences

### Positive

- Deployment dan local development lebih sederhana.
- Transaction lintas data yang benar-benar terkait tetap mudah.
- Resource footprint lebih rendah.
- Lebih mudah untuk Codex dan manusia memahami end-to-end behavior.

### Negative

- Boundary harus ditegakkan melalui struktur, test, dan review.
- Scaling per modul tidak independen.
- Refactor menjadi service terpisah membutuhkan contract yang jelas.

## Exit criteria

Sebuah modul baru boleh diekstrak bila ada bukti seperti:

- kebutuhan scaling yang berbeda secara signifikan;
- security/isolation requirement;
- independent release cadence yang nyata;
- workload berat yang mengganggu request path;
- ownership tim yang jelas;
- ADR baru dengan migration dan operational plan.