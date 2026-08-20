# Legacy Data Mapping

**Status:** DISCOVERY

Dokumen ini mendefinisikan cara memetakan data dari implementasi HCIS sebelumnya tanpa menganggap schema lama sebagai desain target.

## Prinsip

- Simpan ID sumber dan mapping ke ID target.
- Migrasi dapat dijalankan ulang tanpa membuat duplikasi.
- Transformasi deterministik dan versioned.
- Record yang gagal tidak boleh hilang diam-diam.
- Rekonsiliasi domain lebih penting daripada sekadar row count.
- Data sensitif tidak digunakan pada development tanpa sanitasi dan persetujuan.

## Mapping register

| Legacy concept | Target concept | Status | Catatan |
|---|---|---|---|
| Employee auth model | Employee + identity link | discovery | Employee tetap principal domain; identity provider dipisahkan. |
| Role/permission | Role, permission, assignment | discovery | Normalisasi role lama dan mapping permission granular. |
| Unit/position | Organization entities | discovery | Validasi hierarchy dan historical assignment. |
| Direct manager | Reporting relationship | discovery | Tentukan effective dates dan conflict resolution. |
| Leave request | Leave aggregate + approval snapshot | discovery | Rekonsiliasi status dan balance impact. |
| Attendance | Attendance events/request | discovery | Verifikasi timezone, GPS/photo metadata, dan retention. |
| Payroll/payslip | Payroll period/result/document | discovery | Critical reconciliation per employee-period. |
| Loan/installment | Loan aggregate + schedule/payment | discovery | Critical financial reconciliation. |
| Activity log | Audit event | discovery | Tidak semua legacy log otomatis memenuhi audit schema baru. |
| Attachments | Secured object references | discovery | Migrasi file dan checksum; jangan menyimpan public URL permanen. |

## Required migration metadata

Setiap target record hasil migrasi harus dapat ditelusuri melalui metadata terkontrol:

- source system;
- source entity;
- source ID;
- migration run ID;
- transform version;
- migrated timestamp;
- checksum/fingerprint bila sesuai.

Metadata ini tidak selalu ditampilkan ke pengguna.

## Discovery checklist

- Export schema dan constraint tanpa secret.
- Inventaris row count per entity dan state.
- Temukan orphan, duplicate, invalid enum, dan inconsistent dates.
- Petakan timezone dan date semantics.
- Petakan soft-delete/archive behavior.
- Verifikasi file attachment dan missing objects.
- Definisikan source-of-truth untuk balance dan nominal.
- Catat field yang tidak akan dimigrasikan beserta alasan.

## Reconciliation examples

- Jumlah employee per status dan unit.
- Jumlah request per type, period, dan state.
- Leave balance per employee dan leave type.
- Payroll gross/net/deduction per period.
- Loan outstanding principal dan installment count.
- Attachment count dan checksum.

## Open questions

- Apakah history organisasi lengkap tersedia?
- Field mana yang memiliki makna berubah sepanjang waktu?
- Apakah legacy ID perlu terlihat pada UI support?
- Berapa lama legacy read-only dipertahankan?