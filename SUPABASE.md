# Menghubungkan ke Supabase

Panduan untuk tim Berlima: data dibagi dalam **workspace**. Sinkronisasi memakai
pengiriman dan pengambilan manual; notifikasi realtime tidak mengambil data secara
otomatis. Analisis memakai IndexedDB lokal. Lihat [README.md](README.md) untuk
quickstart dan kebutuhan CDN saat memuat aplikasi.

Pada `main` yang diperiksa (`f0a6104`, 2 Oktober 2026),
[supabase-defaults.js](supabase-defaults.js) sudah memuat URL project dan anon key
publik. Pengguna project bawaan dapat mulai dari login pada langkah 5; langkah 1–4
untuk pengelola yang menyiapkan project sendiri. Keberadaan konfigurasi di repo
bukan bukti project cloud sedang aktif atau skema produksinya sudah sesuai.
Konfigurasi browser yang tersimpan mengambil prioritas atas bawaan repo.

---

## 1. Buat project Supabase

1. Buka [supabase.com](https://supabase.com) → **Start your project** → masuk dengan GitHub
2. **New project**
   - Name: `affiliate-harian`
   - Database Password: buat yang kuat, **simpan di password manager**
   - Region: **Southeast Asia (Singapore)** — paling dekat dari Indonesia
3. Tunggu sekitar 2 menit sampai project siap

## 2. Jalankan skema

1. Di dashboard Supabase, buka **SQL Editor** → **New query**
2. Salin seluruh isi `supabase-schema.sql` dari repo ini, tempel, **Run**
3. Di bagian bawah harus muncul 8 baris dengan `rowsecurity = true`

Kalau ada baris yang `false`, RLS tidak aktif dan data bisa terbaca siapa pun yang
punya anon key. Jangan lanjut sebelum semuanya `true`.

## 3. Ambil kredensial

**Project Settings** → **API**:

| Yang dicari | Dipakai untuk |
|---|---|
| Project URL | `https://xxxx.supabase.co` |
| anon public key | key yang dimasukkan ke aplikasi |

Jangan pernah memakai `service_role` key di browser. Key itu melewati semua RLS.

Anon key **aman** disimpan di browser: dia hanya identitas publik, dan RLS di
database yang menentukan siapa boleh melihat apa.

## 4. Atur email login

**Authentication** → **Providers** → pastikan **Email** aktif.

Untuk pemakaian tim kecil, SMTP bawaan Supabase sudah cukup (dibatasi beberapa email
per jam). Kalau anggota tim bertambah dan email mulai tersendat, pasang SMTP sendiri
di **Project Settings → Authentication → SMTP Settings**.

**Authentication** → **URL Configuration** → tambahkan domain Vercel Anda ke
**Redirect URLs**, misalnya `https://affiliate-harian.vercel.app`. Tanpa ini, link
masuk akan menolak mengarahkan kembali ke aplikasi.

## 5. Hubungkan aplikasi

1. Buka aplikasi → tab **Cloud**. Pada checkout dengan konfigurasi bawaan,
   panel langsung menampilkan login email.
2. Bila tidak ada konfigurasi efektif, panel menampilkan Project URL dan anon key
   → **Simpan Koneksi**. Bila sudah dikonfigurasi, langkah ini tidak muncul.
3. Masukkan email → **Kirim Link Masuk**.
4. Buka email, klik link, kembali ke aplikasi.
5. **Buat workspace** atau gabung ke workspace yang disiapkan tim.

Untuk deployment dengan project sendiri, pengelola perlu memastikan konfigurasi
klien menunjuk ke project yang dimaksud. `CloudSync.cfg()` memakai nilai browser
lebih dahulu, lalu `supabase-defaults.js`. Menghapus konfigurasi browser kembali
memakai bawaan; tombol **Ganti Koneksi** belum menjadi jaminan pemilih project
kosong pada checkout yang memiliki defaults. Jangan memasukkan `service_role`,
password database, atau token akses ke konfigurasi klien.

## 6. Undang tim

Setelah workspace dibuat, kode undangan muncul di tab Cloud. Bagikan ke rekan.

Mereka: buka aplikasi → tab Cloud → pastikan project yang dipakai sama → masuk
dengan email masing-masing → tempel kode undangan → **Gabung**. Pada konfigurasi
bawaan, input URL/key tidak diperlukan.

### Peran

| Peran | Boleh |
|---|---|
| `owner` | kelola anggota, hapus data |
| `editor` | unggah dan ubah data |
| `viewer` | hanya melihat |

Anggota yang bergabung lewat kode undangan otomatis jadi `editor`. Untuk mengubah
peran, jalankan di SQL Editor:

```sql
update workspace_members set role = 'viewer'
where workspace_id = '<id-workspace>'
  and user_id = (select id from auth.users where email = 'nama@berlima.id');
```

---

## Cara kerja sinkronisasi

**Kirim** — unggah CSV seperti biasa, simpan ke riwayat, lalu tab Cloud →
**Kirim Akun Aktif ke Cloud**.

**Ambil** — di perangkat atau akun lain, tab Cloud → **Ambil** pada akun yang
diinginkan.

Pembacaan analisis memakai IndexedDB lokal; Cloud adalah salinan bersama. Kegagalan
Supabase tidak menghapus salinan lokal. Pemuatan aplikasi tetap memakai library/font
dari CDN, sehingga ini bukan jaminan dukungan offline penuh.

### Dedup ikut tersinkron

Hash file dan hash baris ikut dikirim. Tanpa itu, rekan tim yang mengunggah file
yang sama di perangkat lain akan dianggap mengunggah file baru, dan komisi akan
menggandakan — persis masalah yang membuat proyek ini dibangun.

---

## Ketersediaan dan backup

Periksa [harga dan batas paket Supabase](https://supabase.com/pricing) serta
[panduan backup database](https://supabase.com/docs/guides/platform/backups) saat
menyiapkan project. Saat tautan diperiksa pada 2 Oktober 2026, paket Free mencantumkan
pause setelah satu minggu tanpa aktivitas dan tidak menyertakan backup otomatis.
Pilih rencana pemulihan sesuai kebutuhan data tim; sinkronisasi bukan pengganti
backup yang diuji.

Repo sudah memiliki [.github/workflows/keepalive.yml](.github/workflows/keepalive.yml)
untuk ping terjadwal, dengan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` dari GitHub Actions
secrets. Ini bukan backup, uji login, atau jaminan layanan selalu tersedia. Perubahan
dokumentasi tidak mengaktifkan workflow, mengatur secrets, atau mengubah project.

Ekspor **Akun** di aplikasi hanya mencakup akun, agregat, dan log unggahan. Ekspor ini
belum menyertakan seluruh hash baris atau UI restore data harian. Simpan laporan
sumber dan siapkan backup database yang sesuai sebelum mengandalkan pemulihan.

---

## Privasi

Payload [cloud-sync.js](cloud-sync.js) mencakup agregat harian serta metadata:
nama akun, tag/nama ad unit, rincian wilayah/sumber klik, nama file dan log unggahan,
dan hash dedup. Pengiriman CSV mentah lengkap tidak menjadi bagian dari payload
sinkronisasi. Nama akun, tag, iklan, dan file tetap dapat mengandung informasi
bisnis; tinjau sebelum dikirim ke workspace.

Login mengirim email ke Supabase dan menyimpan sesi di browser. SDK Supabase dimuat
saat panel Cloud digunakan atau sesi dipulihkan; library/font aplikasi juga dimuat
dari CDN. Karena itu, jangan mengartikan pemrosesan CSV lokal sebagai nol permintaan
jaringan. Jangan commit CSV, ekspor JSON, token sesi, atau kredensial privat.

---

## Kalau ada masalah

**"Belum masuk" padahal sudah klik link** — link magic hanya berlaku di perangkat
yang sama dengan yang meminta. Minta ulang dari perangkat yang dipakai.

**"new row violates row-level security policy"** — Anda belum jadi anggota workspace,
atau peran Anda `viewer`. Cek di **Table Editor → workspace_members**.

**Tidak bisa terhubung sama sekali** — kemungkinan besar project ter-pause. Buka
dashboard Supabase, tekan **Restore**.

**Data rekan tidak muncul** — pastikan kalian berada di workspace yang sama, lalu
tekan **Ambil**. Sinkronisasi tidak otomatis; realtime hanya memberi tahu ada
perubahan.
