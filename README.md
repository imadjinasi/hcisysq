# HCIS YSQ

Human Capital Information System untuk Yayasan Sabilul Qur'an.

Repository ini dibangun dengan pendekatan **documentation-first**. Perilaku produk, aturan domain, kontrak API, keamanan, pengujian, dan strategi migrasi harus terdokumentasi sebelum implementasi dianggap selesai.

## Status

**Foundation / discovery.** Belum ada rilis production dari repository ini.

## Prinsip utama

- GitHub adalah source of truth kode dan dokumentasi.
- Implementasi HCIS sebelumnya menjadi referensi perilaku, bukan kode yang harus disalin mentah.
- Aturan bisnis tidak diletakkan di komponen UI.
- Integrasi database, storage, antrean, email, dan WhatsApp menggunakan adapter agar deployment dapat berpindah environment.
- Semua contoh dan fixture wajib menggunakan data sintetis.
- Perubahan perilaku wajib disertai perubahan dokumentasi dan automated test.

## Dokumen inti

Dokumentasi foundation dikembangkan di branch `foundation/docs-first`, meliputi:

- visi dan scope produk;
- katalog fitur dan target parity;
- glossary domain dan matriks akses;
- workflow utama;
- arsitektur dan keputusan teknis;
- kontrak API awal;
- strategi migrasi;
- keamanan dan definition of done.

## Kontribusi

Baca `AGENTS.md` sebelum mengubah repository. Gunakan pull request kecil, sertakan specification ID, bukti pengujian, dampak keamanan, dan pembaruan dokumentasi.