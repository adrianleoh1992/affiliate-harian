# Menghubungkan ke Supabase

Panduan untuk tim Berlima: data dibagi dalam **workspace**, anggota melihat update
yang sama. Aplikasi tetap berjalan penuh tanpa langkah ini — cloud adalah tambahan,
bukan syarat.

Waktu yang dibutuhkan: sekitar 20 menit, sekali saja.

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

1. Buka aplikasi → tab **Cloud**
2. Masukkan Project URL dan anon key → **Simpan Koneksi**
3. Masukkan email → **Kirim Link Masuk**
4. Buka email, klik link, kembali ke aplikasi
5. **Buat workspace** — misalnya `Berlima Digital`

## 6. Undang tim

Setelah workspace dibuat, kode undangan muncul di tab Cloud. Bagikan ke rekan.

Mereka: buka aplikasi → tab Cloud → masukkan URL dan anon key yang sama → masuk
dengan email masing-masing → tempel kode undangan → **Gabung**.

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

IndexedDB tetap sumber kebenaran untuk membaca, jadi aplikasi tetap cepat dan bisa
dipakai offline. Cloud adalah salinan bersama.

### Dedup ikut tersinkron

Hash file dan hash baris ikut dikirim. Tanpa itu, rekan tim yang mengunggah file
yang sama di perangkat lain akan dianggap mengunggah file baru, dan komisi akan
menggandakan — persis masalah yang membuat proyek ini dibangun.

---

## Auto-pause: yang harus Anda tahu

Project Supabase gratis **berhenti otomatis setelah 7 hari tanpa aktivitas**. Kalau
itu terjadi, aplikasi tidak bisa terhubung sampai Anda menekan **Restore** di
dashboard Supabase.

Data tidak hilang, hanya tertidur. Tapi kalau ini mengganggu, ada dua jalan:

**A. Ping otomatis lewat GitHub Actions** (gratis)

Buat `.github/workflows/keepalive.yml`:

```yaml
name: Keep Supabase Alive
on:
  schedule:
    - cron: '0 2 * * 1,4'   # Senin & Kamis
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sS "${{ secrets.SUPABASE_URL }}/rest/v1/workspaces?limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

Lalu tambahkan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di
**Settings → Secrets and variables → Actions**.

**B. Upgrade ke Pro** ($25/bulan) — pausing hilang sepenuhnya, plus backup harian.

Untuk data operasional yang dipakai mengambil keputusan belanja iklan, backup harian
itu alasan yang lebih kuat daripada auto-pause. Free tier **tidak punya backup sama
sekali**.

---

## Batas free tier

| | Free |
|---|---|
| Database | 500 MB |
| Egress | 5 GB/bulan |
| Pengguna aktif | 50.000/bulan |
| Project aktif | 2 |
| Backup | **tidak ada** |
| Auto-pause | 7 hari |

Data agregat harian sekitar **1,4 MB per akun per tahun**, jadi 500 MB muat ratusan
akun-tahun. Yang akan Anda tabrak lebih dulu adalah auto-pause, bukan kapasitas.

---

## Privasi

Yang dikirim ke Supabase hanya **agregat harian**: tanggal, tag, komisi, jumlah
pesanan, biaya iklan.

Yang **tidak pernah** dikirim: nomor pesanan, nama produk, nama toko, dan seluruh
baris CSV mentah. Semua itu diproses di browser lalu dilupakan.

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
