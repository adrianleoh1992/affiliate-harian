/* Pilihan periode cepat: kemarin / 3 / 7 / 30 hari / semua.

   Yang diuji bukan sekadar tombolnya ada, melainkan bahwa ia benar-benar
   mempersempit data yang dianalisis, dihitung mundur dari hari terakhir yang
   PUNYA DATA (bukan hari ini), dan memperingatkan saat jendelanya terlalu
   pendek untuk matang. */
const { chromium } = require('playwright');
const D = process.env.CSV_DIR || require('os').homedir() + '/Downloads/';
const EXE = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://127.0.0.1:8899/index.html';
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
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

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
  await p.waitForTimeout(700);

  p.once('dialog', async d => await d.accept('BBA Utama'));
  await p.click('#btnShopeeAdd');
  await p.waitForTimeout(700);
  await p.setInputFiles('#files', F);
  await p.waitForSelector('#main:not(.hidden)', { timeout: 120000 });
  await p.waitForTimeout(2500);
  // Preset harus terlihat TANPA membuka panel Pengaturan: filter periode adalah
  // kontrol yang paling sering dipakai, jadi ia berdiri sendiri di luar panel.
  const upfront = await p.evaluate(() => {
    const wrap = document.getElementById('rangePresets');
    const settings = document.getElementById('settingsCard');
    const r = wrap.getBoundingClientRect();
    return {
      insideSettings: settings.contains(wrap),
      settingsOpen: settings.open,
      visible: r.width > 0 && r.height > 0,
    };
  });
  check('preset di luar panel Pengaturan', !upfront.insideSettings);
  check('terlihat tanpa membuka panel', upfront.visible && !upfront.settingsOpen);

  const full = await p.evaluate(() => ({
    start: document.getElementById('dateStart').value,
    end: document.getElementById('dateEnd').value,
    orders: RESULT.kpi.orders,
  }));
  console.log(`=== PENUH ===\n  ${full.start} — ${full.end} · ${full.orders} order`);

  console.log('\n=== PRESET MEMPERSEMPIT PERIODE ===');
  const press = async d => {
    await p.click(`#rangePresets .seg-btn[data-days="${d}"]`);
    await p.waitForTimeout(1800);
    return p.evaluate(() => ({
      start: document.getElementById('dateStart').value,
      end: document.getElementById('dateEnd').value,
      orders: RESULT.kpi.orders,
      note: document.getElementById('rangeNote').textContent,
      active: [...document.querySelectorAll('#rangePresets .seg-btn')]
        .filter(e => e.classList.contains('active')).map(e => e.textContent),
    }));
  };

  const r7 = await press(7);
  check('7 hari memberi tepat 7 hari', days(r7.start, r7.end) === 7, `${r7.start} — ${r7.end}`);
  check('berakhir di hari terakhir yang ADA DATANYA, bukan hari ini',
    r7.end === full.end, r7.end);
  check('order berkurang dari periode penuh', r7.orders < full.orders,
    `${full.orders} -> ${r7.orders} order`);
  check('hanya satu preset aktif', r7.active.length === 1, r7.active.join(','));

  const r14 = await press(14);
  check('14 hari memberi tepat 14 hari', days(r14.start, r14.end) === 14, `${r14.start} — ${r14.end}`);
  check('14 hari di antara 7 dan penuh', r14.orders > r7.orders && r14.orders < full.orders,
    `${r7.orders} < ${r14.orders} < ${full.orders} order`);

  const r30 = await press(30);
  check('30 hari lebih panjang dari 14 hari', days(r30.start, r30.end) > days(r14.start, r14.end),
    `${days(r30.start, r30.end)} vs ${days(r14.start, r14.end)} hari`);
  check('30 hari punya lebih banyak order', r30.orders > r14.orders,
    `${r14.orders} -> ${r30.orders} order`);

  const r3 = await press(3);
  check('3 hari memberi tepat 3 hari', days(r3.start, r3.end) === 3, `${r3.start} — ${r3.end}`);
  const r1 = await press(1);
  check('kemarin memberi satu hari', days(r1.start, r1.end) === 1, r1.start);

  console.log('\n=== PERINGATAN KEMATANGAN ===');
  // Lag atribusi 3 hari: jendela 1 dan 3 hari seluruhnya belum matang, jadi
  // ROAS-nya menyesatkan dan itu harus dikatakan, bukan didiamkan.
  check('jendela pendek diberi peringatan', /belum matang/.test(r1.note), r1.note.slice(0, 90));
  check('peringatan ditandai merah',
    await p.$eval('#rangeNote', e => e.className.includes('bad')));
  check('periode panjang tidak salah diperingatkan',
    !/seluruh periode/.test(r30.note), r30.note.slice(0, 80));

  console.log('\n=== SEMUA & KEMBALI MANUAL ===');
  const rAll = await press('all');
  check('Semua mengembalikan periode penuh',
    rAll.start === full.start && rAll.end === full.end && rAll.orders === full.orders,
    `${rAll.start} — ${rAll.end} · ${rAll.orders} order`);

  // Tanggal manual ada di dalam panel Pengaturan yang tertutup; buka dulu.
  await p.evaluate(() => document.getElementById('settingsCard').open = true);
  await p.waitForTimeout(400);
  await p.fill('#dateStart', '2026-08-01');
  await p.dispatchEvent('#dateStart', 'change');
  await p.waitForTimeout(1200);
  const afterManual = await p.$$eval('#rangePresets .seg-btn',
    els => els.filter(e => e.classList.contains('active')).length);
  check('mengetik tanggal sendiri melepas preset', afterManual === 0);

  console.log('\n=== PRESET DI RIWAYAT TERSIMPAN ===');
  await p.click('#rangePresets .seg-btn[data-days="all"]');
  await p.waitForTimeout(1500);
  await p.click('#btnSaveAll');
  await p.waitForTimeout(4000);
  await p.click('.tab[data-tab="tersimpan"]');
  // Tab ini memuat dari IndexedDB lalu menggambar chart; menekan preset sebelum
  // render pertama selesai membuat rentang tanggalnya masih kosong.
  await p.waitForFunction(() => document.getElementById('dsStart').value !== '', { timeout: 30000 });
  await p.waitForTimeout(1200);

  const rowsBefore = await p.$$eval('#tblStored tbody tr', e => e.length);
  await p.click('#storedPresets .seg-btn[data-days="7"]');
  await p.waitForTimeout(2500);
  const stored7 = await p.evaluate(() => ({
    start: document.getElementById('dsStart').value,
    end: document.getElementById('dsEnd').value,
    rows: document.querySelectorAll('#tblStored tbody tr').length,
    note: document.getElementById('storedRangeNote').textContent,
  }));
  check('riwayat 7 hari memberi 7 hari', days(stored7.start, stored7.end) === 7,
    `${stored7.start} — ${stored7.end}`);
  check('baris riwayat ikut menyusut', stored7.rows < rowsBefore,
    `${rowsBefore} -> ${stored7.rows} baris`);
  check('riwayat memberi keterangan periode', stored7.note.length > 0, stored7.note.slice(0, 70));

  console.log('\n=== MOBILE 390px ===');
  // Enam preset mudah meluber di ponsel; ini pernah terjadi saat 14 hari
  // ditambahkan, jadi dikunci di sini.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(1200);
  const mob = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#rangePresets .seg-btn')];
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      count: btns.length,
      minH: Math.min(...btns.map(b => Math.round(b.getBoundingClientRect().height))),
    };
  });
  check('tanpa overflow horizontal', !mob.overflow);
  check('semua preset hadir di ponsel', mob.count === 6, mob.count + ' tombol');
  check('target sentuh >= 44px', mob.minH >= 44, mob.minH + 'px');
  await p.setViewportSize({ width: 1500, height: 1000 });
  await p.waitForTimeout(700);

  console.log('\n=== CONSOLE ===');
  check('nol error', errs.length === 0, errs.slice(0, 3).join(' | ') || 'bersih');

  console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LOLOS');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
