/* Analisis penuh dari data TERSIMPAN, bukan hanya tren.
   Pertanyaan yang dijawab: kalau CSV asli sudah tidak ada, apakah agregat
   harian masih cukup untuk menghasilkan vonis yang sama? */
const fs = require('fs');
const E = require('./engine.js');
const A = require('./daily-agg.js');

function parseCSV(t) {
  const rows = []; let row = [], cell = '', q = false;
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const h = rows.shift().map(x => x.trim());
  return rows.filter(r => r.length > 1).map(r => {
    const o = {}; h.forEach((k, i) => o[k] = (r[i] || '').trim()); return o;
  });
}

const D = require('os').homedir() + '/Downloads/';
const aff = parseCSV(fs.readFileSync(D + 'AffiliateCommissionReport_202608222201.csv', 'utf8'));
const ads = parseCSV(fs.readFileSync(D + 'AW-Adrian-Ads-Jul-23-2026-Aug-21-2026.csv', 'utf8'));
const clk = parseCSV(fs.readFileSync(D + 'WebsiteClickReport202608222201.csv', 'utf8'));

const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
const pct = (a, b) => b === 0 ? 0 : Math.abs(a - b) / b * 100;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
};

console.log('=== SUMBER ASLI ===');
const orig = E.analyze({ affiliate: aff, ads, clicks: clk, tagMap: {} }, { ppn: 11 });
console.log('  komisi efektif :', rp(orig.kpi.commEff));
console.log('  biaya iklan    :', rp(orig.kpi.spend));
console.log('  pesanan        :', orig.kpi.orders.toLocaleString('id-ID'));
console.log('  ROAS gabungan  :', orig.kpi.roasEff.toFixed(3));

console.log('\n=== SIMPAN LALU ANALISIS ULANG DARI SIMPANAN ===');
const sAff = A.aggregateAffiliate(aff);
const sAds = A.aggregateAds(ads);
const sClk = A.aggregateClicks(clk);
console.log(`  tersimpan: ${sAff.length} baris affiliate · ${sAds.length} ads · ${sClk.length} klik`);
console.log(`  (dari ${aff.length.toLocaleString('id-ID')} · ${ads.length} · ${clk.length.toLocaleString('id-ID')} baris mentah)`);

const rehy = E.analyze({
  affiliate: A.rehydrateAffiliate(sAff),
  ads: A.rehydrateAds(sAds),
  clicks: A.rehydrateClicks(sClk),
  tagMap: {},
}, { ppn: 11 });

console.log('\n=== PERBANDINGAN ===');
const rows = [
  ['komisi efektif', orig.kpi.commEff, rehy.kpi.commEff, 0.5],
  ['biaya iklan', orig.kpi.spend, rehy.kpi.spend, 0.01],
  ['pesanan', orig.kpi.orders, rehy.kpi.orders, 0.01],
  ['GMV', orig.kpi.gmv, rehy.kpi.gmv, 0.01],
  ['klik', orig.kpi.clicks, rehy.kpi.clicks, 0.01],
  ['ROAS gabungan', orig.kpi.roasEff, rehy.kpi.roasEff, 0.5],
  ['ROAS berbayar', orig.kpi.paidRoas, rehy.kpi.paidRoas, 1.0],
];
for (const [label, a, b, tol] of rows) {
  const d = pct(b, a);
  const fmt = v => label.includes('ROAS') ? v.toFixed(3)
    : (label === 'pesanan' || label === 'klik') ? Math.round(v).toLocaleString('id-ID') : rp(v);
  check(`${label}`, d <= tol, `${fmt(a)} vs ${fmt(b)} (beda ${d.toFixed(2)}%)`);
}

console.log('\n=== VONIS PER TAG ===');
const vo = orig.tags.filter(t => t.spend > 0).sort((a, b) => b.spend - a.spend);
const vr = new Map(rehy.tags.map(t => [t.tag, t]));
let sama = 0;
for (const t of vo) {
  const r = vr.get(t.tag);
  const cocok = r && r.status === t.status;
  if (cocok) sama++;
  console.log(`  ${cocok ? 'sama ' : 'BEDA '} ${t.tag.padEnd(26)} ${t.status.padEnd(8)} -> ${r ? r.status : '(hilang)'}`);
}
check('semua vonis identik', sama === vo.length, `${sama}/${vo.length}`);

console.log('\n=== YANG MEMANG HILANG (tidak disimpan) ===');
console.log('  produk   :', orig.breakdown.product ? orig.breakdown.product.length : 0,
  '->', rehy.breakdown.product ? rehy.breakdown.product.length : 0);
console.log('  toko     :', orig.breakdown.shop.length, '->', rehy.breakdown.shop.length);
console.log('  kategori :', orig.breakdown.category.length, '->', rehy.breakdown.category.length);
console.log('  (nomor pesanan, nama produk, toko, kategori sengaja tidak disimpan)');

console.log('\n=== PPN PER AKUN TETAP JALAN DARI SIMPANAN ===');
const zero = {};
rehy.adAccounts.forEach(a => zero[a.name] = 0);
const rz = E.analyze({
  affiliate: A.rehydrateAffiliate(sAff),
  ads: A.rehydrateAds(sAds),
  clicks: A.rehydrateClicks(sClk),
  tagMap: {},
}, { ppn: 11, ppnByAccount: zero });
console.log('  akun terdeteksi:', rehy.adAccounts.length);
rehy.adAccounts.slice(0, 3).forEach(a => console.log(`    ${a.name.slice(0, 34).padEnd(36)} ${rp(a.spend)}`));
check('PPN 0 menurunkan biaya', rz.kpi.spend < rehy.kpi.spend,
  `${rp(rehy.kpi.spend)} -> ${rp(rz.kpi.spend)}`);

console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LOLOS');
process.exit(fail ? 1 : 0);
