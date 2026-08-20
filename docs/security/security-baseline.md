# Security Baseline

**Status:** DRAFT  
**Specification:** SEC-001

HCIS memproses data identitas, kepegawaian, absensi, payroll, pinjaman, performance, dan dokumen. Baseline ini berlaku sejak development, bukan hanya menjelang production.

## Data classification

| Class | Contoh | Kontrol minimum |
|---|---|---|
| Public | Informasi yang memang dipublikasikan | Integrity dan publication approval. |
| Internal | Pengumuman internal, struktur umum | Auth dan scope organisasi. |
| Confidential | Profil pegawai, attendance, leave | Least privilege, audit, encryption in transit. |
| Restricted | Payroll, rekening, pinjaman, performance, dokumen identitas | Permission granular, masked display, audit kuat, retention, export control. |
| Secret | Password, token, key, credential | Secret manager/environment; tidak pernah masuk repo/log. |

## Authentication

- Gunakan mekanisme password hashing modern bila password lokal digunakan.
- Session cookie secure, HTTP-only, dan SameSite sesuai flow.
- Session dirotasi setelah login/perubahan privilege.
- Account inactive/resigned ditolak pada middleware/policy terpusat.
- Rate limit login, recovery, verification, dan endpoint sensitif.
- Recovery flow tidak membocorkan keberadaan akun.

## Authorization

- Deny by default.
- Policy mengecek actor, action, resource, dan scope.
- Jangan mengandalkan hiding button sebagai authorization.
- Download/preview attachment wajib melalui authorization.
- Export dan bulk action membutuhkan permission terpisah.
- Break-glass access harus terbatas, beralasan, dan diaudit.

## Data protection

- TLS untuk seluruh traffic production.
- Database dan object storage tidak dibuka publik.
- Encrypt sensitive backup dan batasi retention.
- Mask data restricted pada UI/log/support tools.
- Signed URL berumur pendek bila digunakan.
- Jangan menyimpan permanent public URL untuk dokumen pegawai.

## Audit

Event sensitif minimal mencatat:

- actor ID dan actor type;
- action/event;
- target type dan ID;
- timestamp dan correlation ID;
- source context yang aman;
- before/after subset yang tidak membocorkan secret;
- reason untuk override/reassignment/export.

Audit log harus tahan modifikasi oleh pengguna biasa dan memiliki retention policy.

## Application security

- Server-side validation authoritative.
- Parameterized query/ORM aman.
- Output encoding dan Content Security Policy yang realistis.
- CSRF protection untuk cookie-based session.
- File upload allowlist, size limit, content inspection, random storage key, dan no execute.
- SSRF protection pada URL fetch/integration.
- Idempotency dan replay protection untuk webhook/job sensitif.
- Dependency update dan vulnerability scanning.

## AI-assisted development

- Jangan memasukkan data production atau secret ke prompt.
- Gunakan synthetic fixtures.
- Review diff AI untuk authorization bypass, mass assignment, insecure direct object reference, logging, dan destructive migration.
- AI-generated security configuration tidak dianggap benar sebelum diuji.

## Operational controls

- Per-environment secrets.
- Least-privilege database user.
- Backup off-site dan restore drill.
- Centralized alert untuk failed jobs, auth anomaly, disk, memory, dan error rate.
- Incident response owner dan credential rotation procedure.

## Security review triggers

Review tambahan wajib untuk:

- auth/session;
- role/permission/policy;
- payroll/loan/reimbursement;
- bulk import/export;
- attachment/document;
- migration;
- webhook/integration;
- audit retention;
- public/candidate endpoints.