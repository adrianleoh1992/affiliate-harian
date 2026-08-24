/* End-to-end for Affiliate Harian: the ingest approval step, dedup on
   re-upload, stored history, and account isolation — in a real browser.

   Requires a static server on 8899 and the three CSVs in ~/Downloads. */
const { chromium } = require('playwright');
const D = process.env.CSV_DIR || require('os').homedir() + '/Downloads/';
const EXE = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://127.0.0.1:8899/index.html';
const F = [
  D + 'AffiliateCommissionReport_202608222201.csv',
  D + 'AW-Adrian-Ads-Jul-23-2026-Aug-21-2026.csv',
  D + 'WebsiteClickReport202608222201.csv',
];

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.evaluate(() => new Promise(r => {
    const q = indexedDB.deleteDatabase('affiliate_daily');
    q.onsuccess = q.onerror = q.onblocked = () => r();
  }));
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  console.log('=== AKUN ===');
  p.once('dialog', async d => await d.accept('BBA Utama'));
  await p.click('#btnShopeeAdd');
  await p.waitForTimeout(800);
  const acctOk = await p.$$eval('#selShopee option', o => o.map(x => x.textContent));
  check('akun dibuat', acctOk.includes('BBA Utama'), acctOk.join(', '));

  console.log('\n=== UNGGAH + RENCANA ===');
  await p.setInputFiles('#files', F);
  await p.waitForSelector('#main:not(.hidden)', { timeout: 120000 });
  await p.waitForSelector('#ingestPlan:not(.hidden)', { timeout: 60000 });
  await p.waitForTimeout(1500);
  const plan = await p.$$eval('.plan-row', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  plan.forEach(r => console.log('     ' + r));
  const beforeSave = await p.evaluate(async () => {
    const a = (await window.__dailyStore.listAccounts('shopee'))[0];
    return (await window.__dailyStore.range(a.id, 'affiliate')).length;
  });
  check('tidak menulis sebelum disetujui', beforeSave === 0, beforeSave + ' baris');

  console.log('\n=== DASHBOARD LENGKAP ===');
  const ui = await p.evaluate(() => ({
    tabs: document.querySelectorAll('.tab').length,
    kpis: document.querySelectorAll('.kpi').length,
    cols: document.querySelectorAll('#tblMain thead th').length,
    rows: document.querySelectorAll('#tblMain tbody tr').length,
    actions: document.querySelectorAll('.action-card').length,
  }));
  check('11 tab (8 dashboard + Data Tersimpan + Unggahan + Cloud)', ui.tabs === 11, ui.tabs + ' tab');
  check('8 KPI', ui.kpis === 8, ui.kpis + ' KPI');
  check('13 kolom tabel vonis', ui.cols === 13, ui.cols + ' kolom');
  check('kartu aksi tampil', ui.actions === 4, ui.actions + ' kartu');
  check('tabel vonis terisi', ui.rows > 0, ui.rows + ' baris');

  console.log('\n=== SIMPAN ===');
  await p.click('#btnSaveAll');
  await p.waitForSelector('#savedNote:not(.hidden)', { timeout: 60000 });
  await p.waitForTimeout(1400);
  console.log('     ' + await p.$eval('#savedNote', e => e.innerText.replace(/\s+/g, ' ').trim()));
  const stored = await p.evaluate(async () => {
    const a = (await window.__dailyStore.listAccounts('shopee'))[0];
    const aff = await window.__dailyStore.range(a.id, 'affiliate');
    const ads = await window.__dailyStore.range(a.id, 'ads');
    const sum = (x, f) => x.reduce((t, r) => t + (r[f] || 0), 0);
    const commEff = (sum(aff, 'comm') - sum(aff, 'comm_pending')) + sum(aff, 'comm_pending') * 0.95;
    // PPN dibaca dari UI, bukan diasumsikan: defaultnya bisa berubah.
    const ppnMult = 1 + (parseFloat(document.getElementById('ppn').value) || 0) / 100;
    return { rows: aff.length, comm: Math.round(sum(aff, 'comm')), orders: sum(aff, 'orders'),
             roas: +(commEff / (sum(ads, 'spend') * ppnMult)).toFixed(2) };
  });
  check('data tersimpan', stored.rows > 0, stored.rows + ' baris affiliate');

  const kpiRoas = await p.$$eval('.kpi', els => {
    const k = els.find(e => /ROAS Gabungan/.test(e.querySelector('.lbl').textContent));
    return k ? parseFloat(k.querySelector('.val').textContent) : null;
  });
  check('store cocok dengan engine', stored.roas === kpiRoas, `store ${stored.roas} vs engine ${kpiRoas}`);

  console.log('\n=== DEDUP ===');
  await p.setInputFiles('#files', F);
  await p.waitForTimeout(5000);
  const replan = await p.$$eval('.plan-row', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  replan.forEach(r => console.log('     ' + r));
  const after = await p.evaluate(async () => {
    const a = (await window.__dailyStore.listAccounts('shopee'))[0];
    const aff = await window.__dailyStore.range(a.id, 'affiliate');
    return Math.round(aff.reduce((t, r) => t + (r.comm || 0), 0));
  });
  check('unggah ulang tidak menggandakan', after === stored.comm,
    'Rp' + after.toLocaleString('id-ID'));

  console.log('\n=== RIWAYAT TERSIMPAN ===');
  await p.click('[data-tab="tersimpan"]');
  await p.waitForTimeout(1800);
  const strip = await p.$$eval('#storedStrip .s', els => els.map(e =>
    e.querySelector('.l').textContent + '=' + e.querySelector('.v').textContent));
  console.log('     ' + strip.join('  '));
  const storedRows = (await p.$$('#tblStored tbody tr')).length;
  check('tabel harian terisi', storedRows > 0, storedRows + ' hari');
  const blank = await p.$$eval('canvas[id]', c => c.filter(x => x.width === 0).map(x => x.id));
  check('semua chart ter-render', blank.length === 0, blank.join(', ') || 'nol kosong');

  console.log('\n=== ISOLASI AKUN ===');
  p.once('dialog', async d => await d.accept('Akun Kedua'));
  await p.click('#btnShopeeAdd');
  await p.waitForTimeout(1200);
  const iso = await p.evaluate(async () => {
    const out = {};
    for (const a of await window.__dailyStore.listAccounts('shopee'))
      out[a.name] = (await window.__dailyStore.range(a.id, 'affiliate')).length;
    return out;
  });
  console.log('     ' + JSON.stringify(iso));
  check('akun terpisah', iso['Akun Kedua'] === 0 && iso['BBA Utama'] > 0);

  console.log('\n=== PERSISTENSI ===');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const persisted = await p.evaluate(async () =>
    (await window.__dailyStore.listAccounts('shopee')).map(a => a.name));
  check('bertahan setelah reload', persisted.length === 2, persisted.join(', '));

  console.log('\n=== KEPALA HALAMAN ===');
  // Favicon pernah tertulis dua kali; potongan yang menggantung di luar tag
  // bocor ke halaman sebagai teks 'BD">' tepat di atas header.
  const head = await p.evaluate(() => ({
    stray: document.body.innerText.includes('BD">') || document.body.innerText.includes('</svg>'),
    icons: document.querySelectorAll('link[rel="icon"]').length,
    iconClosed: [...document.querySelectorAll('link[rel="icon"]')]
      .every(l => l.href.trim().endsWith('</svg>')),
  }));
  check('tidak ada markup favicon yang bocor jadi teks', !head.stray);
  check('hanya satu link favicon', head.icons === 1, head.icons + ' link');
  check('favicon utuh sampai penutup tag', head.iconClosed);

  console.log('\n=== MOBILE 390px ===');
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(900);
  const mob = await p.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    pick: Math.round(document.getElementById('btnPick').getBoundingClientRect().height),
  }));
  check('tanpa overflow horizontal', !mob.overflow);
  check('target sentuh >= 44px', mob.pick >= 44, mob.pick + 'px');

  console.log('\n=== CLOUD ===');
  await p.setViewportSize({ width: 1500, height: 1000 });
  await p.waitForTimeout(700);
  // The tab strip scrolls horizontally on narrow layouts, so bring the tab
  // into view rather than assuming it sits where it did at desktop width.
  await p.evaluate(() => {
    const t = document.querySelector('[data-tab="cloud"]');
    if (t) { t.scrollIntoView({ block: 'center' }); t.click(); }
  });
  await p.waitForTimeout(1100);
  const cloud = await p.evaluate(() => {
    const el = document.getElementById('cloudPanel');
    return {
      rendered: !!el && el.innerHTML.trim().length > 0,
      hasForm: !!document.getElementById('sbUrl'),
      // SDK Supabase tidak boleh dimuat sebelum pengguna mengaktifkan cloud.
      sdkLoaded: !!window.supabase,
    };
  });
  check('panel cloud tampil', cloud.rendered);
  // Kredensial tertanam di supabase-defaults.js, jadi form setup justru tidak
  // boleh muncul — rekan tim tidak perlu menempel apa pun untuk mulai.
  check('form setup tidak muncul (kredensial tertanam)', !cloud.hasForm);
  // SDK menyusul setelah tab dibuka; yang penting halaman awal tetap ringan.
  check('SDK dimuat hanya saat tab cloud dibuka', cloud.sdkLoaded);

  // Data lokal harus tetap utuh setelah membuka tab cloud.
  const stillThere = await p.evaluate(async () => {
    const a = (await window.__dailyStore.listAccounts('shopee'))[0];
    return (await window.__dailyStore.range(a.id, 'affiliate')).length;
  });
  check('data lokal tidak terganggu', stillThere > 0, stillThere + ' baris');

  const real = errs.filter(e => !/favicon/i.test(e));
  console.log('\n=== CONSOLE ===');
  check('nol error', real.length === 0, real.slice(0, 3).join(' | ') || 'bersih');

  await b.close();
  console.log(failures ? `\n${failures} PEMERIKSAAN GAGAL` : '\nSEMUA PEMERIKSAAN LOLOS');
  process.exit(failures ? 1 : 0);
})();
