/* Konfigurasi Supabase bawaan.
 *
 * Anon key SENGAJA ada di sini dan aman ikut ter-commit: dia identitas publik,
 * bukan rahasia. Yang menjaga data adalah Row Level Security di database —
 * sudah diuji, tanpa login anon key mengembalikan nol baris di semua tabel.
 *
 * Efeknya rekan tim tidak perlu menempel kredensial apa pun: buka aplikasi,
 * masuk dengan email, tempel kode undangan, selesai.
 *
 * Kalau perlu menunjuk ke project lain, tab Cloud > Ganti Koneksi menimpa
 * nilai ini lewat localStorage.
 */
window.SUPABASE_DEFAULTS = {
  url: "https://gjgjcgsnvyphncnnekfb.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqZ2pjZ3NudnlwaG5jbm5la2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0OTM1OTEsImV4cCI6MjEwMzA2OTU5MX0.Rr916vodDENpJX11CyGlNm0pAp2zM_vtukRH2fq3zTE",
};
