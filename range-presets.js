/* ── Pilihan periode cepat ───────────────────────────────────────────────────
   Kemarin / 3 / 7 / 30 hari, untuk analisis utama dan riwayat tersimpan.

   Satu keputusan yang menentukan di sini: "kemarin" dihitung mundur dari HARI
   TERAKHIR YANG PUNYA DATA, bukan dari tanggal hari ini. Ekspor Shopee dan Meta
   hampir selalu tertinggal satu sampai tiga hari, jadi menghitung dari hari ini
   akan menghasilkan layar kosong dan membuat pengguna mengira datanya hilang.

   Peringatan lag ikut ditampilkan: pada jendela pendek, sebagian besar pesanan
   belum sempat masuk, sehingga ROAS-nya terlihat jauh lebih buruk dari
   kenyataan. Angka yang belum matang lebih berbahaya daripada angka yang tidak
   ada, karena orang mengambil keputusan dari layar tanpa membaca catatan kaki.
*/
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const DAY = 86400000;

  const iso = d => d.toISOString().slice(0, 10);
  const shift = (dateStr, days) => iso(new Date(Date.parse(dateStr + 'T00:00:00Z') - days * DAY));
  const diffDays = (a, b) =>
    Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY) + 1;

  /* Rentang tanggal yang benar-benar ada di dataset yang sedang dianalisis. */
  function boundsFromDataset() {
    const D = window.__getDataset && window.__getDataset();
    const E = window.Engine;
    if (!D || !E || !D.affiliate) return null;
    const ds = [];
    D.affiliate.forEach(r => { const d = E.dayOnly(r['Waktu Pemesanan']); if (E.isDate(d)) ds.push(d); });
    (D.ads || []).forEach(r => { const d = E.dayOnly(r['Reporting starts']); if (E.isDate(d)) ds.push(d); });
    if (!ds.length) return null;
    ds.sort();
    return { min: ds[0], max: ds[ds.length - 1] };
  }

  /* Rentang yang tersimpan di IndexedDB untuk akun aktif. */
  async function boundsFromStore() {
    const store = window.__dailyStore;
    const acct = window.__activeAccount && window.__activeAccount();
    if (!store || !acct) return null;
    const rows = await store.range(acct.id, 'affiliate');
    if (!rows.length) return null;
    const ds = rows.map(r => r.date).sort();
    return { min: ds[0], max: ds[ds.length - 1] };
  }

  function setNote(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'src-note ' + (kind || '');
  }

  function mark(wrap, days) {
    if (!wrap) return;
    wrap.querySelectorAll('.seg-btn').forEach(b => {
      const on = String(days) === b.dataset.days;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* Berapa hari terakhir yang belum matang menurut pengaturan lag atribusi. */
  const lagDays = () => {
    const v = parseFloat(($('lagDays') || {}).value);
    return isFinite(v) ? v : 3;
  };

  function describe(start, end, bounds, noteEl) {
    const span = diffDays(start, end);
    const parts = [`${span} hari · ${start} — ${end}`];
    let kind = 'ok';

    // Data biasanya berhenti beberapa hari sebelum hari ini; katakan supaya
    // pengguna tidak mengira ada data yang hilang.
    const today = iso(new Date());
    const behind = diffDays(bounds.max, today) - 1;
    if (behind > 0) parts.push(`data terakhir ${behind} hari lalu`);

    // Peringatan yang paling penting: jendela pendek hampir seluruhnya berisi
    // hari yang pesanannya masih menyusul.
    const lag = lagDays();
    if (lag > 0 && diffDays(end, bounds.max) - 1 < lag) {
      const immature = Math.min(lag, span);
      if (immature >= span) {
        parts.push('seluruh periode ini belum matang — ROAS akan terlihat terlalu rendah');
        kind = 'bad';
      } else {
        parts.push(`${immature} hari terakhir belum matang`);
        kind = 'warn';
      }
    }
    setNote(noteEl, parts.join(' · '), kind);
  }

  function apply(days, bounds, startEl, endEl, noteEl, wrap, after) {
    if (!bounds) { setNote(noteEl, 'Belum ada data untuk difilter', 'bad'); return; }
    let start, end = bounds.max;
    if (days === 'all') {
      start = bounds.min;
    } else {
      start = shift(bounds.max, Number(days) - 1);
      if (start < bounds.min) start = bounds.min;
    }
    startEl.value = start;
    endEl.value = end;
    mark(wrap, days);
    describe(start, end, bounds, noteEl);
    after();
  }

  function bind() {
    /* ── Analisis utama ───────────────────────────────────────────────────── */
    const wrap = $('rangePresets');
    if (wrap) {
      wrap.querySelectorAll('.seg-btn').forEach(btn => {
        btn.onclick = () => apply(
          btn.dataset.days, boundsFromDataset(),
          $('dateStart'), $('dateEnd'), $('rangeNote'), wrap,
          () => window.recalc && window.recalc()
        );
      });
      // Mengetik tanggal sendiri berarti tidak lagi memakai preset.
      ['dateStart', 'dateEnd'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('change', () => { mark(wrap, null); setNote($('rangeNote'), ''); });
      });
    }

    /* ── Riwayat tersimpan ────────────────────────────────────────────────── */
    const sWrap = $('storedPresets');
    if (sWrap) {
      sWrap.querySelectorAll('.seg-btn').forEach(btn => {
        btn.onclick = async () => {
          const bounds = await boundsFromStore();
          apply(btn.dataset.days, bounds,
            $('dsStart'), $('dsEnd'), $('storedRangeNote'), sWrap,
            () => { const b = $('btnRange'); if (b) b.click(); });
        };
      });
      ['dsStart', 'dsEnd'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('change', () => { mark(sWrap, null); setNote($('storedRangeNote'), ''); });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
