/* Regresi: tag laporan klik berformat berlapis "NamaTag-bba---" sementara laporan
   komisi hanya menulis "NamaTag". Kalau normalisasi tag kembali cuma memangkas
   tanda hubung di ekor, seluruh kolom klik jadi nol dan aplikasi terlihat "tidak
   mendeteksi klik" tanpa pesan error apa pun.

   Test ini membuktikan PERILAKU (klik benar-benar masuk ke hasil engine memakai
   CSV asli), bukan sekadar keberadaan fungsi. */

const fs = require('fs');
const path = require('path');
const os = require('os');

const D = process.env.CSV_DIR || os.homedir() + '/Downloads/';
const AFF = process.env.AFF_CSV || 'AffiliateCommissionReport_202608241446.csv';
const CLK = process.env.CLK_CSV || 'WebsiteClickReport202608241445.csv';
const ADS = process.env.ADS_CSV || 'AW-Cahya-Ads-17-Aug-2026-23-Aug-2026.csv';

let pass = 0, fail = 0;
function ok(nama, syarat, detail) {
  if (syarat) { console.log('  PASS  ' + nama + (detail ? ' — ' + detail : '')); pass++; }
  else { console.log('  FAIL  ' + nama + (detail ? ' — ' + detail : '')); fail++; }
}

// engine.js ditulis untuk browser: muat sebagai teks lalu jalankan di sandbox.
const src = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
const sandbox = { window: {}, console, module: { exports: {} } };
sandbox.globalThis = sandbox;
require('vm').createContext(sandbox);
require('vm').runInContext(src, sandbox);
const E = sandbox.window.Engine || sandbox.module.exports;

/* Parser CSV kecil yang menghormati tanda kutip — nama produk Shopee penuh koma.
   engine.js tidak mengekspor parser, jadi test membawa miliknya sendiri. */
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    head.forEach((h, i) => o[h] = (r[i] !== undefined ? r[i] : '').trim());
    return o;
  });
}

console.log('===== KLIK TAG BERLAPIS =====');

// 1. Normalisasi: bentuk berlapis harus menyusut ke segmen pertama.
ok('tag berlapis dipotong di hubung pertama',
   E.cleanTag('DressSusana-bba---') === 'DressSusana',
   'DressSusana-bba--- -> ' + E.cleanTag('DressSusana-bba---'));

ok('tag polos tidak berubah',
   E.cleanTag('DressSusana') === 'DressSusana');

ok('beda kapitalisasi dipertahankan apa adanya',
   E.cleanTag('TopCD-bba---') === 'TopCD',
   'TopCD-bba--- -> ' + E.cleanTag('TopCD-bba---'));

ok('nilai kosong aman', E.cleanTag('') === '' && E.cleanTag(null) === '');

// 2. Perilaku sebenarnya: jalankan engine atas CSV asli dan hitung klik terpetakan.
const affAda = fs.existsSync(D + AFF), clkAda = fs.existsSync(D + CLK);
if (!affAda || !clkAda) {
  console.log('  SKIP  CSV asli tidak ada di ' + D + ' — lewati uji end-to-end');
} else {
  const aff = parseCSV(fs.readFileSync(D + AFF, 'utf8'));
  const clk = parseCSV(fs.readFileSync(D + CLK, 'utf8'));
  const ads = fs.existsSync(D + ADS) ? parseCSV(fs.readFileSync(D + ADS, 'utf8')) : [];
  const res = E.analyze({ affiliate: aff, ads: ads, clicks: clk }, {});

  const totalBarisKlik = clk.length;
  const terpetakan = res.tags.reduce((s, t) => s + ((t.leak && t.leak.shopeeClicks) || 0), 0);

  ok('klik terbaca dari CSV', totalBarisKlik > 0, totalBarisKlik + ' baris');
  ok('klik terpetakan ke tag, bukan nol', terpetakan > 0, terpetakan + ' klik');

  // Ambang: sebelum perbaikan angkanya 0. Setelah perbaikan ~99,5%.
  const rasio = terpetakan / totalBarisKlik;
  ok('mayoritas klik cocok dengan tag komisi', rasio > 0.9,
     (rasio * 100).toFixed(1) + '% dari ' + totalBarisKlik);

  const adaTagBerklik = res.tags.filter(t => ((t.leak && t.leak.shopeeClicks) || 0) > 0).length;
  ok('lebih dari satu tag punya klik', adaTagBerklik > 1, adaTagBerklik + ' tag');
}

console.log(pass + ' lulus, ' + fail + ' gagal');
process.exit(fail ? 1 : 0);
