# Panduan kontributor dan agen

## Ruang kerja dan sumber acuan

Repo ini adalah aplikasi statis Affiliate Harian. Baca [README.md](README.md) untuk
pemilihan repo dan batas fitur, serta [SUPABASE.md](SUPABASE.md) sebelum menyentuh
Cloud. `index.html` adalah entrypoint. Gunakan `package.json` dan file uji di branch
aktif sebagai acuan perintah; jangan mengasumsikan fitur dari PR sudah ada di `main`.

Untuk pekerjaan dokumentasi, batasi perubahan pada dokumen yang diminta. Gunakan
branch/checkout terpisah, periksa `git status --short`, dan pertahankan perubahan
pengguna. Jangan mengganti kode, media, lisensi, workflow, skema database, atau
konfigurasi layanan hanya untuk menyesuaikan contoh dokumentasi.

## Perintah yang tersedia

Dari root repo, server lokal tanpa instalasi paket:

```bash
python3 -m http.server 8899
```

Buka `http://localhost:8899/index.html`. `npm run serve` adalah alias dalam
`package.json`. Tidak ada langkah build atau script lint.

Pemeriksaan dasar yang tidak memerlukan CSV klien:

```bash
node engine.test.js
git diff --check
```

Untuk cek sintaks JavaScript bila kode terkait diubah:

```bash
node --check engine.js
node --check daily-agg.js
node --check daily-store.js
node --check cloud-sync.js
```

`npm test` menjalankan `daily-agg.test.js` lebih dahulu; file itu memerlukan CSV
privat di path absolut yang tertulis dalam file uji. Uji `rehydrate` dan `ppn` juga
memerlukan CSV privat. Jangan membuat fixture berisi data klien di repo atau
menyatakan suite lengkap lulus bila hanya `engine.test.js` yang dijalankan.

Uji browser (`e2e`, `source-ppn`, `range-presets`) memerlukan server, Playwright,
Chrome, dan CSV sesuai file uji. Gunakan profil browser uji; test membersihkan
localStorage/IndexedDB pada konteksnya. Playwright tidak tercantum sebagai dependency
proyek. Jangan memasang paket secara global. `cloud-live.test.js` menghubungi
project Supabase nyata; bukan pemeriksaan offline.

`bash sql-test/run.sh` adalah uji PostgreSQL lokal. Periksa prasyarat dan isi script
sebelum menjalankan: script menghapus `/tmp/pgtest-aharian` dan log terkait, membuat
cluster uji, serta memakai port `55432`. Jangan jalankan jika lokasi/port tersebut
dipakai proses lain. Jangan arahkan uji ini ke database produksi.

## Menjaga data dan dokumentasi

- Jangan commit CSV/XLSX klien, backup JSON, tangkapan layar berisi data privat,
  token sesi, password, `service_role` key, atau isi file `.env`/kredensial lokal.
  `.gitignore` bukan jaminan semua jenis ekspor diabaikan.
- Repo ini publik. Jangan menambahkan inventaris repo privat, nama aset privat,
  isi percakapan privat, atau tautan yang mengungkap project privat.
- Anon key bawaan adalah konfigurasi klien publik. Jangan menyalin nilainya ke
  laporan, log, atau dokumentasi; jangan mengubah project tujuan tanpa permintaan.
- Bedakan analisis lokal, permintaan CDN, dan pengiriman Cloud. Payload Cloud
  mencakup metadata/hash/log selain agregat; jangan menjanjikan nol koneksi jaringan.
- Bedakan JSON ekspor akun, JSON snapshot, dan backup/restore harian. Jangan
  menjanjikan kompatibilitas lintas repo atau pemulihan lengkap yang belum tersedia.
- Untuk koreksi dokumentasi, cek tautan relatif, nama tombol, script npm, serta
  file sumber terkait. Laporkan perintah yang benar-benar dijalankan, hasilnya,
  dan prasyarat uji yang belum terpenuhi.
