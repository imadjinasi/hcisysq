# Account Activation

**Status:** ACCEPTED  
**Specification:** AUTH-002 — Invited Account Activation

Dokumen ini menetapkan aktivasi account `EMPLOYEE` dan `FOUNDATION_BOARD` untuk MVP Human Capital Information System Yayasan Sabilul Qur'an.

## Tujuan

- Account non-Super Admin yang sudah disiapkan dapat benar-benar dipakai untuk login.
- Tidak membuka registrasi publik.
- Tidak meminta pengguna memilih role atau jenis account saat login/aktivasi.
- Token aktivasi tidak disimpan dalam bentuk plaintext.
- Aktivasi tidak mengubah role/scope yang sudah ditetapkan Super Admin.

## Model account

### EMPLOYEE

1. Super Admin menyiapkan account dari employee aktif dengan email login yang telah dikonfirmasi.
2. Account dibuat sebagai `invited`.
3. Super Admin menerbitkan link aktivasi sekali pakai.
4. Pegawai membuka link, membuat password, lalu account menjadi `active`.
5. Setelah login, principal `EMPLOYEE` masuk ke `/app`.

Employee yang sudah tidak aktif tidak boleh menyelesaikan aktivasi account baru.

### FOUNDATION_BOARD

1. Super Admin membuat account Organ Yayasan dengan email login.
2. Account dibuat sebagai `invited` tanpa employee palsu.
3. Aktivasi menggunakan alur token yang sama.
4. Setelah login, principal `FOUNDATION_BOARD` masuk ke `/board`.

Akun ini tetap read-only sesuai `AUTH-001` kecuali permission lain secara eksplisit ditetapkan pada milestone berikutnya.

## Token aktivasi

- Token adalah opaque random value dengan entropy minimal 256 bit.
- Database hanya menyimpan SHA-256 token.
- Plaintext token hanya dikembalikan pada respons penerbitan kepada Super Admin dan tidak masuk audit/log/database.
- Masa berlaku token: **24 jam**.
- Hanya satu token aktif per account. Penerbitan token baru mencabut token aktif sebelumnya.
- Token hanya dapat digunakan sekali.
- Token invalid, expired, revoked, atau consumed menghasilkan respons generik `ACTIVATION_LINK_INVALID`.
- Endpoint aktivasi menggunakan `Cache-Control: no-store`.

Sampai adapter email resmi tersedia, UI Super Admin menampilkan link aktivasi satu kali agar dapat disampaikan melalui kanal internal yang sesuai. Sistem tidak mengklaim telah mengirim email.

## Password

- Panjang minimal 12 karakter dan maksimal 128 karakter.
- Password di-hash dengan primitive yang sama dengan autentikasi yang sudah ada (`scrypt`).
- Tidak ada aturan komposisi karakter yang memaksa pola tertentu.
- Password tidak pernah ditulis ke log, audit payload, atau notifikasi.

## Penyelesaian aktivasi

Penyelesaian harus atomik:

1. lock token + account;
2. validasi token masih aktif dan belum expired;
3. validasi account masih `invited`;
4. untuk `EMPLOYEE`, validasi employee masih `active`;
5. simpan password hash dan `password_changed_at`;
6. ubah status account menjadi `active`;
7. tandai token `consumed_at`;
8. revoke sesi lama account bila ada;
9. tulis audit event tanpa token/password.

Aktivasi tidak otomatis membuat role tambahan dan tidak mengubah reporting line.

## MFA

- `SUPER_ADMIN` tetap wajib MFA.
- `EMPLOYEE` dan `FOUNDATION_BOARD` pada MVP dapat login dengan password setelah aktivasi tanpa MFA.
- Kewajiban MFA untuk role sensitif non-Super Admin harus menjadi keputusan keamanan terpisah; tidak diinferensikan diam-diam dari role.

## API MVP

Admin, wajib principal `SUPER_ADMIN`:

- `POST /admin/access/employee-accounts`
- `POST /admin/access/board-accounts`
- `POST /admin/access/accounts/:accountId/activation`

Public capability route:

- `GET /auth/activation/:token`
- `POST /auth/activation/:token`

Respons penerbitan admin berisi `activationPath` dan `expiresAt`. Frontend membentuk absolute URL dari origin saat ini; backend tidak menyimpan hostname production.

## UX

Di detail pegawai/account:

- `Siapkan account pegawai`
- setelah account invited: `Buat link aktivasi`
- setelah token dibuat: tampilkan link + `Salin link`
- jelaskan masa berlaku 24 jam
- jangan tampilkan token kembali setelah halaman direload; Super Admin dapat membuat token baru jika diperlukan.

Di halaman aktivasi:

1. validasi link;
2. tampilkan email tujuan secara tersamarkan dan jenis akses dalam bahasa pengguna;
3. pengguna membuat dan mengonfirmasi password;
4. setelah sukses arahkan ke halaman login;
5. setelah login backend menentukan `/app` atau `/board`.

## Route lintas principal

Pengguna yang sudah login tetapi membuka area principal lain tidak di-redirect diam-diam ke dashboard miliknya. UI menampilkan halaman **404 / Halaman tidak tersedia**. Backend tetap menjadi sumber otoritatif authorization.

## Audit minimum

- `employee.account.prepared`
- `board.account.prepared`
- `account.activation.issued`
- `auth.activation.completed`
- perubahan status account yang sudah ada tetap diaudit.

Audit tidak boleh memuat token aktivasi, password, password hash, TOTP secret, atau recovery code.

## Acceptance criteria

- Account `EMPLOYEE` invited dapat diaktivasi dan login ke `/app`.
- Account `FOUNDATION_BOARD` invited dapat diaktivasi dan login ke `/board`.
- Token hanya sekali pakai, hashed at rest, dan expire 24 jam.
- Reissue mencabut token lama.
- Employee nonaktif tidak dapat menyelesaikan aktivasi.
- Super Admin tetap wajib MFA.
- Tidak ada registrasi publik atau pilihan role pada login.
- Cross-principal route menampilkan 404, bukan silent redirect.
