/* PPN berbeda per akun iklan: sebagian entitas penagih Meta memungut 11%,
   sebagian tidak. Uji ini memastikan tarif per akun benar-benar dipakai, dan
   yang lebih penting: tanpa konfigurasi apa pun, angkanya tidak berubah dari
   perilaku lama. */
const fs = require('fs');
const E = require('./engine.js');

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
const data = { affiliate: aff, ads, clicks: clk, tagMap: {} };

const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
};

console.log('=== AKUN IKLAN TERDETEKSI ===');
const base = E.analyze(data, { ppn: 11 });
base.adAccounts.forEach(a =>
  console.log(`  ${a.name.slice(0, 46).padEnd(48)} ${rp(a.spend).padStart(14)}  PPN ${a.ppn}%`));
check('akun terdaftar', base.adAccounts.length > 0, base.adAccounts.length + ' akun');
check('semua default 11%', base.adAccounts.every(a => a.ppn === 11));

console.log('\n=== KOMPATIBILITAS: tanpa ppnByAccount harus identik ===');
const legacySpend = 15842938; // hasil terverifikasi sebelum fitur ini ada
console.log('  spend    :', rp(base.kpi.spend));
console.log('  harusnya :', rp(legacySpend));
check('angka lama tidak berubah', Math.round(base.kpi.spend) === legacySpend);

console.log('\n=== PPN 0% UNTUK SEMUA AKUN ===');
const zero = {};
base.adAccounts.forEach(a => zero[a.name] = 0);
const r0 = E.analyze(data, { ppn: 11, ppnByAccount: zero });
const rawSpend = 14272917;
console.log('  spend    :', rp(r0.kpi.spend), '(tanpa PPN)');
check('sama dengan spend mentah', Math.round(r0.kpi.spend) === rawSpend,
  'selisih ' + rp(Math.abs(r0.kpi.spend - rawSpend)));
check('ROAS naik saat PPN 0', r0.kpi.roasEff > base.kpi.roasEff,
  base.kpi.roasEff.toFixed(3) + ' -> ' + r0.kpi.roasEff.toFixed(3));

console.log('\n=== TARIF CAMPURAN: satu akun 11%, sisanya 0% ===');
const first = base.adAccounts[0];
const mixed = {};
base.adAccounts.forEach((a, i) => mixed[a.name] = i === 0 ? 11 : 0);
const rm = E.analyze(data, { ppn: 11, ppnByAccount: mixed });
// Yang benar: spend mentah + 11% HANYA atas akun pertama.
const expected = rawSpend + first.spend * 0.11;
console.log('  akun 11% :', first.name.slice(0, 40), rp(first.spend));
console.log('  spend    :', rp(rm.kpi.spend));
console.log('  harusnya :', rp(expected));
check('tarif campuran dihitung per akun', Math.abs(rm.kpi.spend - expected) < 1,
  'selisih ' + rp(Math.abs(rm.kpi.spend - expected)));
check('di antara dua ekstrem', rm.kpi.spend > r0.kpi.spend && rm.kpi.spend < base.kpi.spend);

console.log('\n=== TARIF NON-STANDAR (12,5%) ===');
const odd = {};
base.adAccounts.forEach(a => odd[a.name] = 12.5);
const ro = E.analyze(data, { ppn: 11, ppnByAccount: odd });
check('pecahan desimal dihormati', Math.abs(ro.kpi.spend - rawSpend * 1.125) < 1,
  rp(ro.kpi.spend));

console.log('\n=== AKUN TIDAK DIKENAL PAKAI DEFAULT ===');
const partial = { 'Akun Yang Tidak Ada': 0 };
const rp2 = E.analyze(data, { ppn: 11, ppnByAccount: partial });
check('fallback ke tarif global', Math.round(rp2.kpi.spend) === legacySpend, rp(rp2.kpi.spend));

console.log('\n=== VONIS BISA BERUBAH KARENA PPN ===');
const vb = base.tags.filter(t => t.spend > 0).map(t => t.tag + ':' + t.status).join(' ');
const v0 = r0.tags.filter(t => t.spend > 0).map(t => t.tag + ':' + t.status).join(' ');
console.log('  PPN 11% :', vb);
console.log('  PPN  0% :', v0);
console.log('  ' + (vb === v0 ? 'vonis sama' : 'ADA VONIS BERUBAH — inilah kenapa tarif harus benar'));

console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LOLOS');
process.exit(fail ? 1 : 0);
