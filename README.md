# Affiliate Harian

Aplikasi browser untuk mengolah laporan Shopee Affiliate dan Meta Ads, menyimpan
agregat harian per akun, serta berbagi data melalui workspace Supabase opsional.
Pilih repo ini untuk alur kerja tim yang memerlukan **Kirim/Ambil data antarperangkat**
dan pengelolaan akses `owner`, `editor`, atau `viewer`.

## Pilih repo sesuai tugas

Kedua aplikasi memiliki penyimpanan harian dan deduplikasi. Klaim lama bahwa
`affiliate-dashboard` selalu mulai dari nol atau menggandakan unggahan identik
bukan gambaran `main` saat ini.

| Kebutuhan | Repo yang dipilih |
|---|---|
| Analisis lokal, penyimpanan harian, backup/restore harian lengkap, dan laporan PDF lokal | [affiliate-dashboard](https://github.com/adrianleoh1992/affiliate-dashboard) |
| Analisis harian per akun dengan workspace tim dan sinkronisasi Supabase | **affiliate-harian** (repo ini) |
| Memperbaiki login, panel Cloud, push/pull, atau kebijakan akses database | Repo ini: [cloud-ui.js](cloud-ui.js), [cloud-sync.js](cloud-sync.js), [supabase-schema.sql](supabase-schema.sql) |

### Fitur pada `main` yang diperiksa

Pemeriksaan dokumentasi 2 Oktober 2026 menggunakan
[Harian `f0a6104`](https://github.com/adrianleoh1992/affiliate-harian/commit/f0a6104065ee963923abd1f3b7932228d4155e2b)
dan [Dashboard `caa7be4`](https://github.com/adrianleoh1992/affiliate-dashboard/commit/caa7be44f27c332e37c6544063a1077041f4a110).
Ini perbandingan implementasi pada commit tersebut, bukan janji kesamaan fitur
atau hasil hitung pada semua versi berikutnya.

| Kemampuan | Harian | Dashboard |
|---|---|---|
| Agregat harian per akun di IndexedDB | Ada | Ada |
| Dedup file/baris dan jejak unggahan | Ada | Ada |
| Riwayat dari agregat tersimpan | Tren dan pilihan sumber analisis | Tampilan riwayat harian |
| Ekspor/impor snapshot analisis | Ada | Ada |
| Ekspor data harian | JSON per akun; bukan backup/restore lengkap | Backup/restore harian lengkap |
| Workspace Supabase, panel Cloud, skema RLS | Ada, opsional | Tidak ada pada commit yang diperiksa |
| Dependensi browser saat halaman dimuat | PapaParse, Chart.js, dan font dari CDN | Aset lokal yang disertakan repo |

Tidak ada keputusan penggabungan atau penghentian repo dalam perbandingan ini.

## Mulai cepat

Gunakan Python 3 dan browser modern yang mendukung IndexedDB. Untuk checkout baru:

```bash
git clone https://github.com/adrianleoh1992/affiliate-harian.git
cd affiliate-harian
python3 -m http.server 8899
```

Buka [http://localhost:8899/index.html](http://localhost:8899/index.html).
`index.html` adalah entrypoint; aplikasi statis ini tidak memerlukan build atau
`npm install`. Jika Node/npm tersedia, `npm run serve` menjalankan server yang sama.
Gunakan host dan port yang sama pada kunjungan berikutnya agar penyimpanan browser
berasal dari origin yang sama. Halaman memuat library dan font dari CDN, jadi
pemuatan pertama membutuhkan koneksi internet.

1. Buat atau pilih **Akun Shopee** dan **Akun Iklan** di kartu Akun.
2. Unggah CSV **Affiliate Commission Report**, **Meta Ads Report**, dan
   **Website Click Report** milik akun yang dipilih.
3. Periksa **Rencana simpan**, termasuk akun, periode, baris baru, dan duplikat.
4. Tekan **Simpan ke Riwayat** untuk menulis data harian. Unggah saja belum menyimpan
   data harian; **Simpan Snapshot** adalah tindakan terpisah untuk hasil analisis.
5. Pilih **Analisis Semua Data Tersimpan** untuk memakai riwayat tanpa mengunggah
   ulang CSV lama. Atur periode dan PPN sesuai sumber data Anda.

Pemilihan akun dilakukan pengguna; jangan menganggap aplikasi selalu dapat
menentukan akun pemilik dari CSV. `Nama Toko` pada laporan affiliate adalah toko
penjual, bukan identitas akun Shopee Anda.

## Contoh tugas

- “Periksa tren akun Shopee ini dari seluruh data tersimpan selama 30 hari dan
  jelaskan tag yang perlu ditinjau sebelum mengubah anggaran.”
- “Bandingkan klik Meta dengan klik Shopee pada periode yang sama, lalu periksa
  kecocokan nama iklan dan tag yang lemah.”
- “Simpan laporan periode terbaru setelah memeriksa rencana simpan, lalu kirim akun
  aktif ke workspace tim yang sudah dikonfigurasi.”
- “Perbaiki dokumentasi alur Cloud tanpa mengubah skema, kredensial, atau data tim.”

Aplikasi menyediakan analisis dan ekspor; aplikasi tidak menjalankan perubahan
anggaran iklan dari contoh tugas tersebut.

## Hasil dan penyimpanan

| Hasil | Tempat / format |
|---|---|
| Keputusan, per ad unit, kebocoran klik, harian, perkembangan, peluang, rincian, matching | Tab analisis browser |
| Data Tersimpan dan Unggahan | Agregat harian serta log di IndexedDB, terpisah per akun |
| Cloud | Panel workspace, login, dan pengiriman/pengambilan manual |
| **Export CSV** | `keputusan-…csv`, hasil keputusan per tag |
| **Ekspor Akun** | `harian-…json`, akun, agregat, dan log unggahan |
| Ekspor/impor pada Riwayat | `riwayat-…json`, snapshot analisis |

Ada **11 tab**, termasuk Cloud. Data harian menyimpan agregat, bukan arsip seluruh
transaksi mentah. Detail produk/toko dan analisis yang memerlukan baris mentah tidak
selalu dapat direkonstruksi dari agregat.

Ekspor akun pada `main` tidak menyertakan seluruh hash baris dan belum memiliki UI
restore data harian. Jangan menyamakannya dengan backup/restore lengkap atau dengan
impor snapshot. Simpan CSV sumber secara aman di luar repo; menghapus data situs
atau mengganti profil browser dapat menghilangkan salinan lokal.

### Dedup dan rencana simpan

[daily-agg.js](daily-agg.js) dan [daily-store.js](daily-store.js) menangani hash file,
hash seluruh baris, kunci harian per akun, dan log unggahan. Hash seluruh baris
membedakan baris transaksi yang sah meskipun sebagian kolomnya sama. Rencana simpan
membantu meninjau perubahan sebelum penulisan. Ketepatan akun, periode, dan format
laporan tetap perlu diperiksa pengguna.

## Sinkronisasi tim dan privasi

Lihat [SUPABASE.md](SUPABASE.md) untuk konfigurasi dan operasi tim.
`main` menyertakan konfigurasi project publik di `supabase-defaults.js`; karena itu
panel Cloud dapat langsung menampilkan login email. Konfigurasi browser yang sudah
tersimpan mengambil prioritas atas konfigurasi bawaan. Akses data tetap bergantung
pada login, keanggotaan workspace, dan kebijakan RLS yang terpasang di database.

Pengiriman melalui **Kirim Akun Aktif ke Cloud** dan pengambilan melalui **Ambil**
dilakukan manual. Notifikasi realtime hanya memberi tahu ada pembaruan. Pembacaan
analisis memakai IndexedDB lokal sehingga tidak memerlukan Supabase pada setiap
perhitungan; ini tidak berarti aplikasi dijamin bisa dimuat sepenuhnya offline.

CSV diproses di browser. Sinkronisasi mengirim agregat **beserta metadata**: nama
akun, tag/nama ad unit, rincian sumber/wilayah klik, nama file unggahan, log unggahan,
dan hash dedup. Payload sinkronisasi tidak mengirim seluruh baris CSV mentah.
Login juga mengirim email ke Supabase. CDN menerima permintaan library/font, dan SDK
Supabase dimuat saat Cloud digunakan atau sesi login dipulihkan. Jadi klaim “tidak
ada data yang dikirim ke mana pun” tidak berlaku untuk aplikasi ini.

Jangan memasukkan CSV klien, hasil ekspor, token sesi, password database, atau
`service_role` key ke repo, issue, atau PR. Anon key adalah konfigurasi klien publik;
keamanan akses harus diuji pada RLS, bukan diasumsikan dari keberadaan key tersebut.

## Peta file dan sumber acuan

| File | Tanggung jawab |
|---|---|
| [index.html](index.html), [styles.css](styles.css), [styles-daily.css](styles-daily.css) | Entrypoint dan tampilan |
| [engine.js](engine.js), [app.js](app.js) | Analisis dan UI hasil/snapshot/ekspor CSV |
| [daily-agg.js](daily-agg.js), [daily-store.js](daily-store.js) | Agregasi, dedup, IndexedDB |
| [daily-layer.js](daily-layer.js) | Akun, rencana simpan, data harian, ekspor akun |
| [source-layer.js](source-layer.js), [range-presets.js](range-presets.js) | Sumber analisis, PPN per akun, periode cepat |
| [cloud-sync.js](cloud-sync.js), [cloud-ui.js](cloud-ui.js) | Supabase dan panel Cloud |
| [supabase-schema.sql](supabase-schema.sql), [sql-test](sql-test) | Skema, kebijakan akses, uji isolasi |
| [package.json](package.json), [AGENTS.md](AGENTS.md) | Perintah proyek dan panduan kontributor/agen |

Sumber kanonis aplikasi ini adalah
[adrianleoh1992/affiliate-harian](https://github.com/adrianleoh1992/affiliate-harian).
Gunakan isi branch/commit yang benar-benar dipakai; PR yang belum digabung bukan
bagian dari `main`. Kemiripan nama file dengan Dashboard tidak menjamin keduanya
saling menggantikan atau memakai format backup yang kompatibel.

## Pengujian

Uji mesin dengan fixture sintetis, tanpa data klien atau dependensi npm tambahan:

```bash
node engine.test.js
git diff --check
```

Kedua perintah diverifikasi pada checkout dokumentasi ini. Uji lain yang tersedia:

| Perintah | Prasyarat / cakupan |
|---|---|
| `npm test` | Menjalankan `daily-agg.test.js` lalu `engine.test.js`; uji agregasi memakai tiga CSV privat di path absolut dalam file uji |
| `node klik-tag.test.js` | Normalisasi tag; bagian CSV asli dilewati jika fixture tidak tersedia. Mendukung `CSV_DIR`, `AFF_CSV`, `CLK_CSV`, `ADS_CSV` |
| `node rehydrate.test.js` / `node ppn.test.js` | Tiga CSV yang ditentukan file uji di `~/Downloads` |
| `node e2e.test.js` | Server lokal, Playwright, Chrome, dan tiga CSV yang ditentukan file uji |
| `node source-ppn.test.js` / `node range-presets.test.js` | Prasyarat browser/CSV yang sama |
| `node cloud-live.test.js` | Playwright, Chrome, server lokal, CDN dan project Supabase aktif; menghubungi layanan nyata |
| `bash sql-test/run.sh` | PostgreSQL lokal (`initdb`, `pg_ctl`, `psql`); membuat/menghapus cluster sementara `/tmp/pgtest-aharian`, memakai port `55432` |

Uji browser mendukung `URL` dan `CHROME`; uji browser dengan CSV mendukung `CSV_DIR`
(dengan `/` di akhir). Playwright tidak dideklarasikan dalam `package.json`.
`npm test` bukan smoke test mandiri untuk checkout baru, dan tidak ada script
`build` atau `lint`. Jangan mengunggah fixture privat agar uji bisa dijalankan;
catat uji yang dilewati beserta prasyaratnya. Hasil historis dari dataset lain bukan
bukti semua uji lulus pada checkout saat ini.

---

Adrian Leo Hadipradata · Berlima Digital
