# Affiliate Harian

Penyimpanan data harian per akun untuk affiliate Shopee yang beriklan di Meta Ads.

Berisi seluruh analisis keputusan dari [affiliate-dashboard](https://github.com/adrianleoh1992/affiliate-dashboard),
ditambah tiga hal yang tidak ada di sana:

- **Data tersimpan permanen per akun** — tidak hilang saat halaman ditutup
- **Deduplikasi berlapis** — file yang sama tidak pernah menggandakan angka
- **Tren lintas periode** — menumpuk dari waktu ke waktu tanpa mengunggah ulang CSV lama

Berjalan sepenuhnya di browser. Tidak ada server, tidak ada data yang dikirim ke mana pun.

## Kenapa proyek terpisah

Dashboard menghitung ulang dari nol setiap kali CSV diunggah. Kalau file yang sama masuk
dua kali, komisi menggandakan diam-diam — pada data uji, ROAS 1,95x terbaca **3,89x**.

Menyimpan data secara permanen menuntut deduplikasi yang benar-benar teruji. Karena itu
lapisan penyimpanan dikembangkan terpisah, bukan ditempelkan ke dashboard yang sudah
dipakai untuk mengambil keputusan.

## Cara pakai

1. Buka aplikasi
2. Buat akun Shopee dengan tombol **+** di kartu Akun
3. Unggah ketiga CSV
4. Periksa **rencana simpan** yang muncul, lalu tekan Simpan
5. Buka tab **Data Tersimpan** untuk melihat tren

Unggahan berikutnya cukup file periode terbaru — data lama sudah tersimpan.

## Rencana simpan sebelum menulis

Tidak ada satu baris pun masuk penyimpanan sebelum Anda melihat apa yang akan berubah:

```
Rencana simpan ke akun BBA Utama
  AFFILIATE   340 baru · 200 diperbarui · 1.408 duplikat dilewati   30 hari · 23 Jul — 21 Agu
  IKLAN       180 baru                                              30 hari
  KLIK         90 baru                                               7 hari
```

Ini penting karena **CSV tidak memuat identitas akun sama sekali** — Meta export tidak
punya kolom `Account name`, dan `Nama Toko` di laporan affiliate adalah toko penjual,
bukan akun Anda. Salah pilih akun akan mencampur data dua akun dan sulit dipisahkan
setelah tersimpan.

## Empat lapis anti-duplikasi

| Lapis | Menangkap |
|---|---|
| Hash file | File identik, meski namanya diubah |
| Hash baris | Periode tumpang tindih antar file berbeda |
| Kunci `(akun, tanggal, tag)` | Simpan ulang jadi perbarui, bukan baris baru |
| Log upload | Jejak apa yang pernah masuk, kapan, berapa |

### Kunci dedup harus hash seluruh baris

Kunci komposit yang tampak masuk akal justru berbahaya. Diuji pada CSV asli:

```
kunci order+produk+waktu+komisi → 1.408 baris dianggap duplikat
                                → 0 benar-benar identik
                                → 1.408 baris SAH akan terhapus
```

Penyebabnya satu pesanan bisa berisi beberapa produk berbeda harga:

```
baris 29: qty=1  nilai=17.999  Tertunda
baris 30: qty=1  nilai=35.999  Tertunda
baris 31: qty=1  nilai=17.287  Tertunda
```

Hash seluruh isi baris: 11.470 dari 11.470 unik, nol false positive.

## Yang disimpan

Agregat harian, bukan transaksi mentah.

| | CSV mentah | Agregat harian |
|---|---:|---:|
| Baris per bulan | 11.470 | 340 |
| Ukuran 30 hari | 23,1 MB | **123 KB** |
| Proyeksi 1 tahun | ~280 MB | **1,4 MB** |

Kompresi 192×. Tidak ada ID pesanan atau nama produk yang ikut tersimpan — cukup untuk
tren, ROAS harian, dan deteksi kebocoran. CSV mentah tetap diproses di browser lalu
dilupakan.

## Sepuluh tab

| Tab | Isi |
|---|---|
| Keputusan | Proyeksi dampak, kalibrasi lag, vonis per tag |
| Per Ad Unit | Satu baris per iklan Meta: CPM, impresi, reach, CTR, CPC ideal |
| Kebocoran Klik | Klik Meta vs Shopee, % masuk, biaya terbuang |
| Harian | Komisi vs biaya, ROAS harian, klik & konversi |
| Perkembangan | Tren antar snapshot manual |
| **Data Tersimpan** | Tren dari data tersimpan, menumpuk lintas periode |
| **Unggahan** | Jejak audit tiap file: baru, diperbarui, dilewati |
| Peluang | Kandidat iklan dari tag organik, konsentrasi anggaran |
| Rincian | Platform, kategori, jam terbaik, produk, toko |
| Matching | Nama iklan ke tag beserta keyakinan |

Dua tab bertanda tebal adalah tambahan; delapan sisanya identik dengan dashboard.

## Angka harus cocok dengan dashboard

Penyimpanan dan layar keputusan dihitung dari sumber berbeda — IndexedDB vs `engine.js`.
Uji mengunci keduanya agar tidak menyimpang, termasuk PPN 11% dan bobot komisi tertunda 0,95.

Uji ini pernah menangkap dua penyimpangan nyata: store menghitung 8.007 order sementara
engine 8.004 karena belum mengecualikan `Belum Dibayar`, dan riwayat menampilkan ROAS 1,96
sementara KPI 1,95 karena memakai komisi mentah.

## Struktur

```
index.html        halaman utama
styles.css        tema dasar (terang + gelap)
styles-daily.css  tambahan untuk kartu akun dan rencana simpan
engine.js         mesin keputusan, tanpa DOM — bisa diuji di Node
app.js            UI dashboard
daily-agg.js      agregasi + dedup, murni
daily-store.js    IndexedDB: akun, data harian, log upload
daily-layer.js    lapisan akun + penyimpanan di atas dashboard
```

`daily-layer.js` dimuat setelah `app.js` dan hanya menambah, tidak menggantikan —
sehingga seluruh metrik dashboard tetap utuh.

## Menjalankan uji

```bash
npm test                                    # agregasi + mesin keputusan
python3 -m http.server 8899                 # lalu di terminal lain:
node e2e.test.js                            # end-to-end di Chrome
```

Uji end-to-end memerlukan Playwright dan mengambil CSV dari `~/Downloads`.

## Hasil uji

```
tidak menulis sebelum disetujui   0 baris
dashboard lengkap                 10 tab · 8 KPI · 13 kolom · 4 kartu aksi
store cocok dengan engine         ROAS 1,95 = 1,95
unggah ulang                      tidak menggandakan, Rp31.028.615 tetap
riwayat tersimpan                 30 hari, semua chart ter-render
isolasi akun                      dua akun terpisah penuh
persistensi                       bertahan setelah reload
mobile 390px                      tanpa overflow, target sentuh 44px
console error                     0
```

## Privasi

Data transaksi tidak pernah meninggalkan browser. Tidak ada backend, tidak ada analytics.
Semua tersimpan di IndexedDB perangkat Anda, dan bisa diekspor ke JSON kapan saja.

File CSV di-ignore oleh git supaya data klien tidak ikut ter-commit.

---

Adrian Leo Hadipradata · Berlima Digital
