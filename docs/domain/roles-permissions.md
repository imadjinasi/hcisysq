# Roles and Permissions

**Status:** DISCOVERY

Dokumen ini adalah baseline awal dari bukti pada implementasi sebelumnya. Daftar role belum dianggap lengkap sampai route, policy, middleware, seeder, dan data production tersanitasi selesai diaudit.

## Prinsip

- Role bukan pengganti policy berbasis resource.
- Akses diberikan secara least privilege.
- Super admin tidak otomatis boleh melakukan self-service employee bila domain memang memisahkannya.
- Status akun aktif adalah precondition terpisah dari role.
- Akses data lintas unit harus eksplisit.
- Data payroll, pinjaman, performance, dan dokumen memiliki permission lebih granular.

## Role awal yang terobservasi

| Role | Tujuan awal | Catatan discovery |
|---|---|---|
| `super_admin` | Konfigurasi dan administrasi sistem | Terobservasi memiliki route khusus dan diblok dari sebagian self-service. |
| `admin` | Administrasi operasional terbatas | Scope final harus dipetakan per modul. |
| `pegawai` | Self-service pegawai | Akses ke data diri dan request milik sendiri. |
| `kepala_unit` | Pengelolaan/approval unit | Tidak otomatis boleh mengakses administrasi global. |
| `yayasan` | Akses pengurus yayasan | Ada beberapa varian role yayasan yang perlu dipetakan. |
| `ketua_yayasan` | Kewenangan sesuai mandat ketua | Permission final TBD. |
| `sekretaris_yayasan` | Kewenangan sesuai mandat sekretaris | Permission final TBD. |
| `bendahara_yayasan` | Kewenangan sesuai mandat bendahara | Permission finansial harus sangat granular. |
| `pengurus_yayasan` | Kewenangan pengurus | Permission final TBD. |

## Matriks kemampuan awal

Legenda: `O` own, `U` unit, `A` all sesuai permission, `-` tidak otomatis.

| Capability | Pegawai | Kepala Unit | Admin | Yayasan group | Super Admin |
|---|---:|---:|---:|---:|---:|
| Lihat profil sendiri | O | O | O | O | kebijakan khusus |
| Ajukan request sendiri | O | O | O | sesuai kebijakan | kebijakan khusus |
| Lihat task approval | jika ditunjuk | U | jika ditunjuk | jika ditunjuk | troubleshooting terkontrol |
| Kelola employee master | - | terbatas | sesuai permission | read/report sesuai mandat | A |
| Kelola role/permission | - | - | - | - | A |
| Lihat payroll detail | O | - | sesuai permission | agregat/detail sesuai mandat | break-glass atau permission khusus |
| Lihat audit log | own event terbatas | unit terbatas | sesuai permission | sesuai mandat | A |
| Konfigurasi sistem | - | - | terbatas | - | A |

Matriks ini bukan implementasi final. Setiap baris harus dipecah menjadi permission yang dapat diuji.

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
payroll.import
payslips.read.own
roles.manage
activity_logs.read
```

## Account state

Akun `inactive`, `resigned`, atau kondisi non-operasional lain tidak boleh mengakses route terlindungi kecuali flow pemulihan/penjelasan yang secara eksplisit diizinkan.

## Test minimum

Setiap capability harus memiliki test untuk:

- unauthenticated;
- wrong role/permission;
- inactive account;
- allowed own resource;
- forbidden other resource;
- unit boundary;
- audit event untuk aksi sensitif.
