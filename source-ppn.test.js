/* Dua fitur baru diuji di browser sungguhan:
   1. Analisis seluruh data tersimpan — bukan hanya tren, tapi semua tab.
   2. PPN per akun iklan, tersimpan lintas reload.
*/
const { chromium } = require('playwright');
const D = require('os').homedir() + '/Downloads/';
const EXE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://127.0.0.1:8899/index.html';
const F = [
  D + 'AffiliateCommissionReport_202608222201.csv',
  D + 'AW-Adrian-Ads-Jul-23-2026-Aug-21-2026.csv',
  D + 'WebsiteClickReport202608222201.csv',
];

let fail = 0;
const check = (l, ok, d) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${d ? ' — ' + d : ''}`);
  if (!ok) fail++;
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });

  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.evaluate(() => new Promise(r => {
    const q = indexedDB.deleteDatabase('affiliate_daily');
    q.onsuccess = q.onerror = q.onblocked = () => r();
  }));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(800);

  p.once('dialog', async d => await d.accept('BBA Utama'));
  await p.click('#btnShopeeAdd');
  await p.waitForTimeout(700);

  console.log('=== UNGGAH & SIMPAN ===');
  await p.setInputFiles('#files', F);
  await p.waitForSelector('#main:not(.hidden)', { timeout: 120000 });
  await p.waitForSelector('#ingestPlan:not(.hidden)', { timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.click('#btnSaveAll');
  await p.waitForSelector('#savedNote:not(.hidden)', { timeout: 60000 });
  await p.waitForTimeout(1500);

  const fromFile = await p.evaluate(() => ({
    comm: RESULT.kpi.commEff, spend: RESULT.kpi.spend, orders: RESULT.kpi.orders,
    roas: +RESULT.kpi.roasEff.toFixed(3),
    verdicts: RESULT.tags.filter(t => t.spend > 0).map(t => t.tag + ':' + t.status).join(' '),
    rows: document.querySelectorAll('#tblMain tbody tr').length,
  }));
  console.log('  dari file: ' + Math.round(fromFile.comm).toLocaleString('id-ID')
    + ' · ROAS ' + fromFile.roas + ' · ' + fromFile.orders + ' order');

  console.log('\n=== PPN PER AKUN ===');
  // Panel ada di dalam <details> Pengaturan Analisis yang tertutup secara
  // bawaan; input di dalamnya tidak terlihat sampai panel dibuka.
  await p.evaluate(() => {
    const d = document.getElementById('settingsCard');
    if (d) d.open = true;
  });
  await p.waitForTimeout(600);
  const ppnUi = await p.evaluate(() => {
    const w = document.getElementById('ppnAccounts');
    return {
      visible: w && !w.classList.contains('hidden'),
      count: document.querySelectorAll('[data-ppn-acct]').length,
      names: [...document.querySelectorAll('.ppn-name')].map(e => e.textContent).slice(0, 3),
    };
  });
  check('panel PPN muncul', ppnUi.visible);
  check('akun iklan terdaftar', ppnUi.count === 6, ppnUi.count + ' akun');
  console.log('  akun: ' + ppnUi.names.join(', '));

  // Set akun terbesar jadi 0%, sisanya biarkan default.
  const firstName = await p.$eval('[data-ppn-acct]', e => e.dataset.ppnAcct);
  await p.fill(`[data-ppn-acct="${firstName}"]`, '0');
  await p.dispatchEvent(`[data-ppn-acct="${firstName}"]`, 'change');
  await p.waitForTimeout(2500);

  const afterPpn = await p.evaluate(() => ({
    spend: RESULT.kpi.spend,
    peek: document.getElementById('settingsPeek').textContent,
    applied: RESULT.options.ppnByAccount,
  }));
  check('biaya turun setelah PPN 0', afterPpn.spend < fromFile.spend,
    'Rp' + Math.round(fromFile.spend).toLocaleString('id-ID') + ' -> Rp' + Math.round(afterPpn.spend).toLocaleString('id-ID'));
  check('tarif khusus terpakai', afterPpn.applied[firstName] === 0);
  check('ringkasan menyebut akun khusus', /akun khusus/.test(afterPpn.peek), afterPpn.peek.slice(0, 80));

  // Kembalikan ke default agar perbandingan mode berikutnya adil.
  await p.fill(`[data-ppn-acct="${firstName}"]`, '');
  await p.dispatchEvent(`[data-ppn-acct="${firstName}"]`, 'change');
  await p.waitForTimeout(2000);

  console.log('\n=== MODE: SEMUA DATA TERSIMPAN ===');
  await p.click('#srcStored');
  await p.waitForTimeout(4000);
  const stored = await p.evaluate(() => ({
    comm: RESULT.kpi.commEff, spend: RESULT.kpi.spend, orders: RESULT.kpi.orders,
    roas: +RESULT.kpi.roasEff.toFixed(3),
    verdicts: RESULT.tags.filter(t => t.spend > 0).map(t => t.tag + ':' + t.status).join(' '),
    rows: document.querySelectorAll('#tblMain tbody tr').length,
    note: document.getElementById('srcNote').textContent,
    daily: document.querySelectorAll('#tblDaily tbody tr').length,
    units: document.querySelectorAll('#tblUnit tbody tr').length,
  }));
  console.log('  ' + stored.note);
  console.log('  tersimpan: ' + Math.round(stored.comm).toLocaleString('id-ID')
    + ' · ROAS ' + stored.roas + ' · ' + stored.orders + ' order');

  const near = (a, b, tol) => Math.abs(a - b) <= Math.abs(b) * tol;
  check('komisi sama dengan dari file', near(stored.comm, fromFile.comm, 0.005),
    Math.round(Math.abs(stored.comm - fromFile.comm)) + ' selisih');
  check('biaya sama', near(stored.spend, fromFile.spend, 0.005));
  check('pesanan sama', stored.orders === fromFile.orders);
  check('ROAS sama', Math.abs(stored.roas - fromFile.roas) < 0.005);
  check('vonis identik', stored.verdicts === fromFile.verdicts);
  check('tabel vonis terisi', stored.rows > 0, stored.rows + ' baris');
  check('tabel harian terisi', stored.daily > 0, stored.daily + ' hari');
  check('tabel per ad unit terisi', stored.units > 0, stored.units + ' unit');

  console.log('\n=== KEMBALI KE FILE BARU ===');
  await p.click('#srcUpload');
  await p.waitForTimeout(2500);
  const back = await p.evaluate(() => ({
    comm: RESULT.kpi.commEff, note: document.getElementById('srcNote').textContent,
  }));
  check('kembali ke data unggahan', near(back.comm, fromFile.comm, 0.005), back.note);

  console.log('\n=== PPN BERTAHAN SETELAH RELOAD ===');
  await p.fill(`[data-ppn-acct="${firstName}"]`, '5');
  await p.dispatchEvent(`[data-ppn-acct="${firstName}"]`, 'change');
  await p.waitForTimeout(2000);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const persisted = await p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('aharian_ppn_acct_v1') || '{}'); }
    catch (e) { return {}; }
  });
  check('tarif tersimpan lintas reload', persisted[firstName] === 5,
    JSON.stringify(persisted).slice(0, 70));

  const real = errs.filter(e => !/favicon/i.test(e));
  console.log('\n=== CONSOLE ===');
  check('nol error', real.length === 0, real.slice(0, 3).join(' | ') || 'bersih');

  await b.close();
  console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LOLOS');
  process.exit(fail ? 1 : 0);
})();
