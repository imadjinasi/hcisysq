# UI and Design Guidelines

**Status:** DRAFT

## Peran Lovable

Lovable digunakan untuk mengeksplorasi arah visual, application shell, design tokens, reusable components, responsive layout, dan prototype flow dengan mock data.

GitHub tetap menjadi source of truth. Hasil Lovable harus melalui review dan dirapikan sebelum dianggap production-ready.

## Layar pilot

1. Login/recovery.
2. Dashboard pegawai.
3. Employee table untuk admin.
4. Leave request form dan preview.
5. Approval task detail/timeline.
6. Empty, loading, error, forbidden, offline/slow, dan mobile states.

## Design tokens

Minimal definisikan:

- typography scale;
- spacing scale;
- radius;
- elevation;
- semantic colors;
- focus ring;
- breakpoints;
- motion duration;
- density untuk table/form.

Jangan hardcode warna/status per halaman. Gunakan semantic tokens seperti `status-success`, `status-warning`, dan `status-danger` dengan label/icon yang jelas.

## Interaction principles

- Primary action tunggal dan jelas.
- Destructive action membutuhkan confirmation sesuai risiko.
- Validation error dekat dengan field dan ringkasan tersedia untuk accessibility.
- Tabel besar mendukung filter, sort, pagination, sticky context, dan keyboard use.
- Approval view menampilkan requester, request summary, policy context, history, dan decision consequence.
- Jangan menampilkan data restricted yang tidak diperlukan untuk keputusan.

## Accessibility

- Target minimum WCAG 2.1 AA.
- Keyboard navigation dan visible focus.
- Semantic HTML dan label form.
- Status tidak disampaikan hanya dengan warna.
- Dialog mengelola focus dengan benar.
- Touch target memadai pada mobile.
- Reduced motion dihormati.

## Responsive strategy

- Mobile untuk employee self-service dan quick approval.
- Desktop untuk administration, import, reconciliation, dan reporting.
- Jangan sekadar mengecilkan tabel desktop; gunakan card/detail pattern bila lebih sesuai.

## Mock data

Semua prototype memakai data sintetis. Dilarang mengunggah screenshot/data pegawai production ke Lovable atau tool AI lain.