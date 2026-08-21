# ATT-001 — Kehadiran Harian

## Tujuan

Menyediakan fondasi kehadiran yang dapat dipakai sekarang tanpa menunggu integrasi mesin fingerprint, tetapi tetap aman untuk dikembangkan menjadi integrasi otomatis di milestone berikutnya.

Milestone ini sengaja hanya mencatat fakta kehadiran harian. Sistem belum menyimpulkan keterlambatan, pulang cepat, mangkir, lembur, kekurangan jam kerja, atau potongan payroll karena aturan jadwal kerja dan toleransinya belum ditetapkan sebagai kebijakan sistem.

## Prinsip domain

1. Rekaman kehadiran adalah fakta waktu, bukan keputusan disiplin atau payroll.
2. Satu pegawai memiliki paling banyak satu rekaman kanonik untuk satu tanggal kerja.
3. Rekaman dapat memiliki jam masuk saja, jam keluar saja, atau keduanya.
4. Jika kedua waktu tersedia, jam keluar tidak boleh lebih awal dari jam masuk.
5. `attendance_date` adalah tanggal kerja yang menjadi bucket rekaman. Timestamp dapat melewati tengah malam agar model tidak mengunci sistem pada pola kerja siang saja.
6. Semua timestamp disimpan sebagai `timestamptz`; antarmuka menampilkan waktu dengan zona `Asia/Jakarta`.
7. Tidak adanya rekaman tidak otomatis berarti pegawai tidak hadir. Kesimpulan absensi memerlukan jadwal kerja dan proses resolusi kehadiran.
8. Koreksi manual selalu diaudit dengan before/after snapshot. Audit tidak menyimpan kredensial atau data rahasia.
9. Milestone ini tidak menghapus atau menggantikan `attendance_resolution_cases`. Modul resolusi tetap merupakan alur downstream untuk ketidakhadiran yang benar-benar telah ditetapkan perlu penyelesaian.

## Sumber rekaman

`attendance_daily_records.source` pada milestone ini mendukung:

- `manual` — dimasukkan atau dikoreksi oleh Super Admin melalui HCIS.
- `integration` — disediakan sebagai kontrak schema untuk integrasi sumber otomatis berikutnya.

Endpoint tulis pada ATT-001 hanya membuat sumber `manual`. Belum ada public/service ingestion endpoint untuk `integration`.

## Model data

### attendance_daily_records

Kunci primer: `(employee_id, attendance_date)`.

Field utama:

- `employee_id`
- `attendance_date`
- `check_in_at`
- `check_out_at`
- `source`
- `source_reference`
- `note`
- `created_by_account_id`
- `updated_by_account_id`
- `created_at`
- `updated_at`

Rekaman wajib memiliki minimal salah satu dari `check_in_at` atau `check_out_at`.

### attendance_daily_audit_events

Riwayat immutable untuk setiap operasi manual:

- `created`
- `updated`
- `deleted`

Audit menyimpan employee id, tanggal kerja, actor account id, snapshot `before_record`, snapshot `after_record`, dan waktu kejadian.

## Akses

### Employee

Employee aktif dapat membaca rekaman miliknya sendiri melalui:

- `GET /attendance/me`

Query:

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`

Rentang maksimum 62 hari. Default adalah 30 hari terakhir sampai hari ini.

Response tidak menyertakan rekaman pegawai lain.

### Super Admin

Super Admin dapat:

- membaca rekaman per pegawai;
- membuat atau mengoreksi satu rekaman tanggal kerja;
- menghapus rekaman manual jika memang salah input.

Endpoint:

- `GET /admin/attendance/employees/:employeeId`
- `PUT /admin/attendance/employees/:employeeId/:attendanceDate`
- `DELETE /admin/attendance/employees/:employeeId/:attendanceDate`

Penghapusan hanya menghapus rekaman kanonik. Audit historis tetap dipertahankan.

## Validasi tulis

Body PUT:

```json
{
  "checkInAt": "2026-08-21T07:02:00+07:00",
  "checkOutAt": "2026-08-21T16:11:00+07:00",
  "note": "Koreksi berdasarkan catatan operasional"
}
```

Ketentuan:

- timestamp harus ISO-8601 dengan offset/zona yang dapat diparse;
- salah satu timestamp wajib ada;
- jika dua timestamp ada, `checkOutAt >= checkInAt`;
- catatan maksimum 1000 karakter;
- employee harus ditemukan;
- perubahan manual tidak pernah mengubah status employee, leave request, atau payroll.

## UX Employee

Menu **Kehadiran** membuka `/app/attendance`.

Halaman menampilkan:

- rekaman hari ini bila ada;
- jam masuk dan jam keluar dalam waktu Jakarta;
- riwayat rekaman terbaru;
- pesan eksplisit bila belum ada rekaman;
- penjelasan bahwa belum ada kesimpulan telat/absen karena jadwal kerja belum dihubungkan.

Tidak ada tombol check-in mandiri pada milestone ini.

## UX Super Admin

Menu **Kehadiran** membuka `/admin/attendance`.

Super Admin dapat:

1. memilih pegawai aktif;
2. memilih tanggal kerja;
3. mengisi jam masuk/jam keluar;
4. menambahkan catatan opsional;
5. menyimpan koreksi manual;
6. melihat rekaman terbaru pegawai tersebut;
7. menghapus rekaman yang salah dengan konfirmasi browser.

Input waktu menggunakan waktu lokal browser, lalu dikirim sebagai timestamp ber-offset.

## Batas eksplisit ATT-001

Belum termasuk:

- sinkronisasi mesin fingerprint;
- integrasi RuangHadir atau provider lain;
- shift/jadwal kerja;
- toleransi keterlambatan;
- status telat/pulang cepat/absen;
- perhitungan jam kerja atau lembur;
- auto-create attendance resolution dari missing punch;
- pengaruh ke payroll;
- employee self check-in berbasis GPS/foto.

Semua hal di atas membutuhkan policy/kontrak tersendiri agar HCIS tidak membuat keputusan HR dari asumsi teknis.

## Acceptance criteria

1. Migration dapat dijalankan ulang tanpa merusak schema yang sudah ada.
2. Employee hanya dapat membaca kehadirannya sendiri.
3. Super Admin dapat create/update/delete rekaman harian dan setiap perubahan mempunyai audit immutable.
4. Invalid date range, invalid timestamp, atau checkout sebelum check-in ditolak backend.
5. Employee page tidak menyimpulkan telat/absen dari tidak adanya data.
6. UI tetap jujur saat data kosong.
7. Tidak ada data sintetis yang otomatis ditulis saat deploy.
8. Tidak ada perubahan pada data employee/leave existing saat migration.
