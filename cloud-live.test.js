/* Uji koneksi Supabase sungguhan dari browser: apakah aplikasi langsung
   terhubung ke project tanpa pengguna menempel kredensial, dan apakah layar
   login muncul dengan benar. Tidak melakukan login (butuh email nyata). */
const { chromium } = require('playwright');
const EXE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://127.0.0.1:8899/index.html';

let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
};

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(900);

  console.log('=== KONFIGURASI BAWAAN ===');
  const cfg = await p.evaluate(() => ({
    hasDefaults: !!window.SUPABASE_DEFAULTS,
    url: window.SUPABASE_DEFAULTS && window.SUPABASE_DEFAULTS.url,
    configured: window.CloudSync && CloudSync.configured(),
    usingDefaults: window.CloudSync && CloudSync.usingDefaults(),
    // SDK tidak boleh terunduh sebelum tab Cloud dibuka.
    sdkLoaded: !!window.supabase,
  }));
  check('defaults tertanam', cfg.hasDefaults, cfg.url);
  check('terhubung tanpa input pengguna', cfg.configured === true);
  check('menandai pakai bawaan', cfg.usingDefaults === true);
  check('SDK belum dimuat di awal', cfg.sdkLoaded === false);

  console.log('\n=== TAB CLOUD ===');
  await p.evaluate(() => {
    const t = document.querySelector('[data-tab="cloud"]');
    if (t) { t.scrollIntoView({ block: 'center' }); t.click(); }
  });
  // Memuat SDK dari CDN lalu menghubungi Supabase butuh waktu.
  await p.waitForTimeout(6000);

  const ui = await p.evaluate(() => {
    const el = document.getElementById('cloudPanel');
    return {
      text: (el ? el.innerText : '').slice(0, 300),
      hasEmail: !!document.getElementById('sbEmail'),
      hasSetupForm: !!document.getElementById('sbUrl'),
      sdkLoaded: !!window.supabase,
    };
  });
  check('SDK dimuat saat dipakai', ui.sdkLoaded === true);
  check('form setup TIDAK muncul', ui.hasSetupForm === false,
    ui.hasSetupForm ? 'masih minta kredensial' : 'kredensial sudah tertanam');
  check('layar login email muncul', ui.hasEmail === true);
  console.log('  panel: ' + ui.text.replace(/\n+/g, ' | ').slice(0, 160));

  console.log('\n=== KONEKSI KE SUPABASE ===');
  const live = await p.evaluate(async () => {
    try {
      const c = CloudSync.cfg();
      const r = await fetch(c.url + '/rest/v1/workspaces?select=id&limit=1', {
        headers: { apikey: c.key, Authorization: 'Bearer ' + c.key },
      });
      return { status: r.status, body: (await r.text()).slice(0, 80) };
    } catch (e) { return { error: e.message }; }
  });
  check('endpoint hidup', live.status === 200, 'HTTP ' + live.status);
  check('RLS memblokir tanpa login', live.body === '[]', live.body || live.error);

  console.log('\n=== DATA LOKAL TIDAK TERGANGGU ===');
  const local = await p.evaluate(async () => {
    const s = await DailyStore.open();
    return (await s.listAccounts('shopee')).length;
  });
  check('IndexedDB tetap bisa dibuka', local >= 0, local + ' akun');

  const real = errs.filter(e => !/favicon/i.test(e));
  console.log('\n=== CONSOLE ===');
  check('nol error', real.length === 0, real.slice(0, 3).join(' | ') || 'bersih');

  await b.close();
  console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LOLOS');
  process.exit(fail ? 1 : 0);
})();
