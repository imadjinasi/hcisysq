# Access Model

**Status:** ACCEPTED  
**Specifications:** AUTH-001, AUTH-010, SEC-001

Dokumen ini menetapkan model akses target HCIS YSQ. Nama role pada legacy HCIS hanya menjadi bahan discovery dan tidak boleh otomatis dibawa ke implementasi baru.

## Keputusan utama

- Satu halaman login untuk semua pengguna.
- Tidak ada registrasi publik dan tidak ada pilihan role pada halaman login.
- Google sign-in menjadi jalur utama; email + password dapat menjadi fallback.
- Setelah autentikasi, backend menentukan jenis akun, permission, scope, dan tujuan awal pengguna.
- Jenis akun, role, permission, dan scope adalah konsep yang berbeda.

## Jenis akun

### `EMPLOYEE`

Akun yang terhubung ke employee aktif.

Semua employee aktif otomatis mendapat **base employee access** untuk self-service miliknya sendiri, misalnya profil, kehadiran, cuti, reimbursement, slip gaji, pinjaman, dan dokumen pribadi sesuai modul yang sudah tersedia.

Employee dapat menerima akses tambahan melalui role assignment.

Contoh:

```text
Ahmad
Account type: EMPLOYEE

Base employee access
+ Unit Manager / scope SMP
+ Reimbursement Approver / scope SMP
```

### `FOUNDATION_BOARD`

Akun Organ Yayasan yang tidak diperlakukan sebagai employee palsu.

Akses default:

- executive/governance dashboard;
- statistik SDM;
- laporan organisasi;
- ringkasan finansial yang memang diizinkan;
- export report bila memiliki permission.

Akses ini **read only**. Akun Organ Yayasan tidak otomatis dapat mengubah employee, melakukan approval, mengubah payroll, mengubah role, atau mengubah konfigurasi sistem.

Data sensitif harus menggunakan prinsip aggregate-first. Detail individu hanya tersedia bila ada permission eksplisit.

### `SUPER_ADMIN`

Akun administrasi teknis sistem.

Super Admin bukan representasi jabatan tertinggi di organisasi. Pimpinan Yayasan tidak otomatis menjadi Super Admin.

Kewenangan utama:

- role dan permission;
- role assignment;
- konfigurasi sistem;
- integrasi;
- audit log;
- recovery/reassignment administratif yang terdokumentasi.

Akses privileged harus diaudit dan MFA wajib ketika autentikasi production sudah diimplementasikan.

## Landing area

Setelah login berhasil:

```text
EMPLOYEE         -> /app
FOUNDATION_BOARD -> /board
SUPER_ADMIN      -> /admin
```

Ini adalah landing area, bukan mekanisme authorization. Setiap route tetap wajib melakukan permission check di backend.

## Employee access: base + tambahan

Base employee access berasal dari status employee aktif, bukan dari role `pegawai` yang harus ditempel manual ke setiap akun.

Akses tambahan menggunakan:

```text
ROLE + SCOPE
```

Contoh role tambahan:

- Unit Manager;
- HC;
- Finance;
- Management;
- Approver khusus.

Role adalah kumpulan permission. Role tidak boleh dibentuk dari kombinasi nama seperti `pegawai-kepala-unit-finance`.

## Scope

Scope menjawab **akses ini berlaku untuk siapa**.

Baseline scope:

- `own` — data milik sendiri;
- `unit` — unit yang ditugaskan;
- `organization` — seluruh organisasi;
- explicit/custom scope hanya bila kebutuhan nyata muncul.

Contoh:

```text
Role: Unit Manager
Scope: SMP

employees.read.unit
leave.approve
attendance.read.unit
```

Role menjawab "boleh melakukan apa". Scope menjawab "kepada siapa / area mana".

## Assignment

Role assignment tambahan dapat berasal dari:

1. struktur/jabatan yang memiliki aturan otomatis yang terdokumentasi; atau
2. assignment manual oleh administrator berwenang.

Assignment manual dapat memiliki tanggal mulai, tanggal selesai, dan alasan, terutama untuk PLT atau kewenangan sementara.

## Account state

Gunakan state sederhana:

```text
invited
active
suspended
inactive
```

- `invited`: belum menyelesaikan aktivasi jika flow aktivasi digunakan;
- `active`: dapat login sesuai permission;
- `suspended`: akses ditutup sementara tanpa mengubah status kepegawaian;
- `inactive`: tidak boleh login, umumnya karena hubungan/mandat sudah berakhir.

Status employee dan status account tetap divalidasi terpisah.

## Login behavior

Flow target:

```text
/login
  -> Google atau email/password
  -> identitas terverifikasi
  -> account ditemukan dan active
  -> load account type + permissions + scopes
  -> redirect ke landing area
```

Tidak boleh ada dropdown "Masuk sebagai Pegawai / Admin / Pimpinan".

## Permission naming

Gunakan pola:

```text
<resource>.<action>[.<scope>]
```

Contoh:

```text
employees.read.own
employees.read.unit
employees.read.all
leave.submit
leave.approve
reports.read.organization
reports.export.organization
roles.manage
approvals.reassign
```

## Security invariants

- Authorization dimiliki backend; frontend hanya menyembunyikan/menampilkan UI berdasarkan capability yang diberikan backend.
- Navigasi administrasi Human Capital lintas organisasi hanya ditampilkan dari capability efektif yang sudah memperhitungkan role, `organization` scope, dan periode assignment; assignment role yang sama dengan `unit` scope tidak cukup.
- Mengetik URL secara manual tidak boleh melewati authorization.
- Tidak ada akses lintas unit hanya karena seseorang memiliki role yang sama di unit lain.
- Foundation Board bersifat read only kecuali dokumen target secara eksplisit diubah.
- Super Admin tidak otomatis memiliki employee self-service.
- Perubahan role, scope, account state, dan permission sensitif menghasilkan audit event.

## Acceptance criteria

- AUTH-010-A: employee aktif mendapat base employee self-service tanpa assignment role `pegawai` manual.
- AUTH-010-B: role tambahan bersifat additive dan dapat memiliki scope.
- AUTH-010-C: Foundation Board dapat membaca dashboard/report yang diizinkan tetapi tidak dapat melakukan mutation operasional.
- AUTH-010-D: Super Admin dapat mengelola akses sistem tetapi tidak dianggap sebagai pimpinan organisasi.
- AUTH-010-E: satu login page melayani seluruh jenis akun dan tidak menampilkan selector role.
- AUTH-010-F: route backend tetap menolak principal yang tidak memiliki permission walaupun UI/URL dapat diakses secara langsung.
- AUTH-010-G: assignment sementara menyimpan periode berlaku dan alasan bila digunakan.
- AUTH-010-H: UI tidak menampilkan capability atau navigasi administrasi organization-wide hanya dari `role_key`; scope dan periode assignment efektif harus ikut dipertimbangkan.
