/* ── Sumber analisis & PPN per akun ─────────────────────────────────────────
   Dua hal yang ditambahkan di sini, keduanya di atas dashboard tanpa
   mengubahnya:

   1. Analisis bisa berjalan dari SELURUH data tersimpan, bukan hanya dari CSV
      yang baru diunggah. Riwayat berbulan-bulan jadi bisa dilihat rinci per
      hari tanpa mengunggah ulang file lama.

   2. PPN diatur per akun iklan. Entitas penagih Meta berbeda memungut tarif
      berbeda, dan memakai satu tarif untuk semua akan salah menghitung biaya —
      cukup untuk membalik vonis sebuah tag.
*/
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = window.Engine.escapeHtml;
  const nf = n => Math.round(n || 0).toLocaleString('id-ID');
  const LS_PPN = 'aharian_ppn_acct_v1';

  window.__ppnByAccount = (() => {
    try { return JSON.parse(localStorage.getItem(LS_PPN) || '{}'); } catch (e) { return {}; }
  })();
  const savePpn = () => localStorage.setItem(LS_PPN, JSON.stringify(window.__ppnByAccount));

  /* ── PPN per akun ─────────────────────────────────────────────────────── */
  window.renderPpnAccounts = accounts => {
    const wrap = $('ppnAccounts'), rows = $('ppnRows');
    if (!wrap || !rows) return;
    if (!accounts.length) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    const def = parseFloat(($('ppn') || {}).value) || 0;
    rows.innerHTML = accounts.map(a => {
      const custom = window.__ppnByAccount[a.name];
      const has = custom !== undefined && custom !== null && custom !== '';
      return `<div class="ppn-row">
        <span class="ppn-name" title="${esc(a.name)}">${esc(a.name)}</span>
        <span class="ppn-spend">Rp${nf(a.spend)}</span>
        <span class="ppn-input">
          <input type="number" min="0" step="0.5" data-ppn-acct="${esc(a.name)}"
                 value="${has ? esc(String(custom)) : ''}" placeholder="${def}">
          <span class="ppn-pct">%</span>
        </span>
      </div>`;
    }).join('');
    rows.querySelectorAll('[data-ppn-acct]').forEach(inp => {
      inp.onchange = () => {
        const name = inp.dataset.ppnAcct, v = inp.value.trim();
        // Kosong berarti "pakai default", bukan nol — membedakan keduanya
        // penting karena 0% adalah tarif yang sah.
        if (v === '') delete window.__ppnByAccount[name];
        else window.__ppnByAccount[name] = parseFloat(v) || 0;
        savePpn();
        if (typeof window.recalc === 'function') window.recalc();
      };
    });
  };

  /* ── Sumber data: file baru vs seluruh riwayat tersimpan ──────────────── */
  let MODE = 'upload';

  function setNote(msg, kind) {
    const n = $('srcNote');
    if (n) { n.textContent = msg || ''; n.className = 'src-note ' + (kind || ''); }
  }

  function setActive(mode) {
    MODE = mode;
    ['srcUpload', 'srcStored'].forEach(id => {
      const b = $(id);
      if (!b) return;
      const on = b.dataset.src === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  async function analyzeStored() {
    const store = window.__dailyStore;
    const acct = window.__activeAccount && window.__activeAccount();
    if (!store) return setNote('Penyimpanan belum siap', 'bad');
    if (!acct) return setNote('Pilih akun Shopee dulu', 'bad');

    setNote('Memuat data tersimpan...');
    const A = window.DailyAgg;
    const [aff, ads, clk] = await Promise.all([
      store.range(acct.id, 'affiliate'),
      store.range(acct.id, 'ads'),
      store.range(acct.id, 'clicks'),
    ]);
    if (!aff.length) {
      setActive('upload');
      return setNote('Belum ada data tersimpan untuk akun ini', 'bad');
    }

    // Agregat dikembalikan ke bentuk baris yang dimengerti engine, sehingga
    // seluruh tab analisis bekerja apa adanya tanpa jalur kode kedua.
    const data = {
      affiliate: A.rehydrateAffiliate(aff),
      ads: A.rehydrateAds(ads),
      clicks: A.rehydrateClicks(clk),
      tagMap: (typeof window.map === 'function' ? window.map() : {}),
    };

    const dates = aff.map(r => r.date).sort();
    const ds = $('dateStart'), de = $('dateEnd');
    if (ds) ds.value = dates[0];
    if (de) de.value = dates[dates.length - 1];

    window.__setDataset(data);

    const days = new Set(dates).size;
    setNote(`${days} hari · ${dates[0]} — ${dates[dates.length - 1]} · ${nf(aff.length)} baris tersimpan`, 'ok');
    // Rincian produk/toko/kategori memang tidak ada di agregat harian; katakan
    // terus terang alih-alih membiarkan tab-nya tampak rusak.
    const det = $('detailsNote');
    if (det) det.textContent = 'Mode data tersimpan: rincian produk, toko, dan kategori tidak tersedia karena tidak ikut disimpan.';
  }

  function bind() {
    const up = $('srcUpload'), st = $('srcStored');
    if (up) up.onclick = () => {
      setActive('upload');
      setNote('');
      if (window.__uploadData && window.__uploadData.affiliate && window.__uploadData.affiliate.length) {
        window.__setDataset(window.__uploadData);
        setNote('Menganalisis file yang diunggah', 'ok');
      } else {
        setNote('Unggah CSV untuk menganalisis file baru');
      }
    };
    if (st) st.onclick = () => { setActive('stored'); analyzeStored(); };
  }

  // Simpan salinan data unggahan supaya bisa dikembalikan setelah menengok
  // riwayat, tanpa memaksa pengguna mengunggah ulang.
  const origOnData = window.onDashboardData;
  window.onDashboardData = payload => {
    window.__uploadData = payload.data;
    setActive('upload');
    if (typeof origOnData === 'function') origOnData(payload);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
