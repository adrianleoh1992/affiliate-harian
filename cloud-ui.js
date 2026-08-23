/* ── Cloud UI ───────────────────────────────────────────────────────────────
   Dimuat setelah daily-layer.js. Menambahkan panel Cloud tanpa mengubah apa
   pun yang sudah ada: kalau Supabase belum dikonfigurasi, panel hanya
   menampilkan formulir setup dan aplikasi tetap berjalan penuh dari IndexedDB.
*/
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = window.Engine.escapeHtml;
  const toast = window.toast;
  const nf = n => Math.round(n || 0).toLocaleString('id-ID');
  let RT = null;

  function statusHtml(msg, kind) {
    return `<div class="cloud-status ${kind || ''}">${msg}</div>`;
  }

  async function render() {
    const el = $('cloudPanel');
    if (!el) return;

    if (!CloudSync.configured()) {
      el.innerHTML = `
        <p class="hint">Hubungkan ke Supabase agar data bisa dibuka di perangkat lain
          dan dilihat bersama tim. Tanpa ini, aplikasi tetap berjalan penuh dari
          penyimpanan browser.</p>
        <div class="ctrls" style="grid-template-columns:1fr">
          <div class="field"><label>Supabase URL</label>
            <input type="text" id="sbUrl" placeholder="https://xxxx.supabase.co"></div>
          <div class="field"><label>Anon Key</label>
            <input type="text" id="sbKey" placeholder="eyJhbGciOi..."></div>
        </div>
        <button class="btn primary" id="sbSave" style="margin-top:10px">Simpan Koneksi</button>
        <p class="hint" style="margin-top:10px">Anon key aman disimpan di browser —
          Row Level Security di database yang menentukan siapa boleh melihat apa.
          Panduan lengkap ada di <b>SUPABASE.md</b>.</p>`;
      $('sbSave').onclick = () => {
        const u = $('sbUrl').value.trim(), k = $('sbKey').value.trim();
        if (!u || !k) return toast('URL dan key harus diisi');
        CloudSync.saveConfig(u, k);
        toast('Koneksi disimpan');
        render();
      };
      return;
    }

    const user = await CloudSync.currentUser();
    if (!user) {
      el.innerHTML = `
        <p class="hint">Masuk dengan email. Link masuk akan dikirim ke inbox Anda —
          tidak ada password yang perlu diingat atau bisa bocor.</p>
        <div class="ctrls" style="grid-template-columns:1fr auto;align-items:end">
          <div class="field"><label>Email</label>
            <input type="email" id="sbEmail" placeholder="nama@berlima.id"></div>
          <button class="btn primary" id="sbLogin">Kirim Link Masuk</button>
        </div>
        <button class="btn ghost" id="sbForget" style="margin-top:10px">Ganti Koneksi</button>`;
      $('sbLogin').onclick = async () => {
        const email = $('sbEmail').value.trim();
        if (!email) return toast('Email harus diisi');
        $('sbLogin').disabled = true; $('sbLogin').textContent = 'Mengirim...';
        try {
          await CloudSync.signIn(email);
          el.innerHTML = statusHtml(
            `Link masuk dikirim ke <b>${esc(email)}</b>. Buka email itu di perangkat ini,
             lalu kembali ke halaman ini.`, 'ok');
        } catch (e) {
          toast('Gagal: ' + e.message);
          $('sbLogin').disabled = false; $('sbLogin').textContent = 'Kirim Link Masuk';
        }
      };
      $('sbForget').onclick = () => { CloudSync.clearConfig(); render(); };
      return;
    }

    const ws = CloudSync.activeWorkspace();
    const list = await CloudSync.myWorkspaces();

    if (!ws) {
      el.innerHTML = `
        ${statusHtml(`Masuk sebagai <b>${esc(user.email)}</b>`, 'ok')}
        <p class="hint">Workspace adalah tempat data tim disimpan bersama. Buat baru,
          atau gabung ke workspace rekan Anda dengan kode undangan.</p>
        ${list.length ? `<div class="ws-list">${list.map(w => `
          <div class="ws-item"><span><b>${esc(w.name)}</b>
            <span class="pill">${esc(w.role)}</span></span>
          <button class="btn sm" data-ws="${esc(w.id)}">Pilih</button></div>`).join('')}</div>` : ''}
        <div class="ctrls" style="grid-template-columns:1fr auto;align-items:end;margin-top:12px">
          <div class="field"><label>Workspace baru</label>
            <input type="text" id="wsName" placeholder="Berlima Digital"></div>
          <button class="btn primary" id="wsCreate">Buat</button>
        </div>
        <div class="ctrls" style="grid-template-columns:1fr auto;align-items:end">
          <div class="field"><label>Kode undangan</label>
            <input type="text" id="wsCode" placeholder="a1b2c3d4e5f6"></div>
          <button class="btn" id="wsJoin">Gabung</button>
        </div>
        <button class="btn ghost" id="sbOut" style="margin-top:10px">Keluar</button>`;
      el.querySelectorAll('[data-ws]').forEach(b => b.onclick = () => {
        CloudSync.setActiveWorkspace(list.find(w => w.id === b.dataset.ws));
        render();
      });
      $('wsCreate').onclick = async () => {
        const n = $('wsName').value.trim();
        if (!n) return toast('Nama workspace harus diisi');
        try {
          CloudSync.setActiveWorkspace(await CloudSync.createWorkspace(n));
          toast('Workspace dibuat'); render();
        } catch (e) { toast('Gagal: ' + e.message); }
      };
      $('wsJoin').onclick = async () => {
        const c = $('wsCode').value.trim();
        if (!c) return toast('Kode undangan harus diisi');
        try {
          CloudSync.setActiveWorkspace(await CloudSync.joinWorkspace(c));
          toast('Bergabung ke workspace'); render();
        } catch (e) { toast('Gagal: ' + e.message); }
      };
      $('sbOut').onclick = async () => { await CloudSync.signOut(); render(); };
      return;
    }

    const cloud = await CloudSync.cloudAccounts().catch(() => []);
    const mem = await CloudSync.members(ws.id).catch(() => []);
    el.innerHTML = `
      ${statusHtml(`<b>${esc(ws.name)}</b> · ${esc(ws.role)} ·
        ${mem.length} anggota · masuk sebagai ${esc(user.email)}`, 'ok')}
      <div class="cloud-actions">
        <button class="btn primary" id="cPush">Kirim Akun Aktif ke Cloud</button>
        <button class="btn" id="cPull">Ambil dari Cloud</button>
        <button class="btn ghost" id="cSwitch">Ganti Workspace</button>
      </div>
      <p class="hint" style="margin-top:10px">Kode undangan workspace:
        <code class="pill">${esc(ws.invite_code || '—')}</code>
        — bagikan ke rekan agar mereka bisa gabung dan melihat data yang sama.</p>
      <div id="cloudList" style="margin-top:12px">${
        cloud.length
          ? `<p class="hint">Akun di cloud:</p><div class="ws-list">${cloud.map(a => `
              <div class="ws-item"><span>${esc(a.name)}</span>
              <button class="btn sm" data-pull="${esc(a.id)}" data-name="${esc(a.name)}">Ambil</button></div>`).join('')}</div>`
          : '<p class="hint">Belum ada akun di cloud. Tekan Kirim untuk mengunggah akun aktif.</p>'
      }</div>
      <div id="cloudProgress"></div>`;

    $('cSwitch').onclick = () => { CloudSync.setActiveWorkspace(null); render(); };
    $('cPush').onclick = async () => {
      const acct = window.__activeAccount && window.__activeAccount();
      if (!acct) return toast('Pilih akun Shopee dulu');
      const prog = $('cloudProgress');
      $('cPush').disabled = true;
      try {
        const res = await CloudSync.push(window.__dailyStore, acct,
          m => prog.innerHTML = statusHtml(m));
        prog.innerHTML = statusHtml(
          `Terkirim: ${nf(res.counts.affiliate)} affiliate · ${nf(res.counts.ads)} iklan ·
           ${nf(res.counts.clicks)} klik. Rekan tim bisa melihatnya sekarang.`, 'ok');
        render();
      } catch (e) {
        prog.innerHTML = statusHtml('Gagal: ' + esc(e.message), 'bad');
        $('cPush').disabled = false;
      }
    };
    $('cPull').onclick = () => toast('Pilih akun di daftar cloud di bawah');
    el.querySelectorAll('[data-pull]').forEach(b => b.onclick = async () => {
      const prog = $('cloudProgress');
      b.disabled = true;
      try {
        const res = await CloudSync.pull(window.__dailyStore,
          { id: b.dataset.pull, name: b.dataset.name },
          m => prog.innerHTML = statusHtml(m));
        prog.innerHTML = statusHtml(
          `Terambil: ${nf(res.counts.affiliate)} affiliate · ${nf(res.counts.ads)} iklan ·
           ${nf(res.counts.clicks)} klik.`, 'ok');
        if (window.__refreshAccounts) await window.__refreshAccounts();
      } catch (e) {
        prog.innerHTML = statusHtml('Gagal: ' + esc(e.message), 'bad');
        b.disabled = false;
      }
    });

    // Rekan tim mengunggah, layar ini ikut tahu tanpa perlu refresh.
    if (!RT) {
      RT = CloudSync.subscribe(() => {
        toast('Ada pembaruan dari rekan tim');
        const p = $('cloudProgress');
        if (p) p.innerHTML = statusHtml('Data workspace baru saja diperbarui rekan tim. Tekan Ambil untuk menariknya.', 'ok');
      });
    }
  }

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    if (t.dataset.tab === 'cloud') render();
  }));

  // Sesi bisa pulih dari magic link saat halaman dibuka kembali, tapi jangan
  // mengunduh SDK Supabase hanya untuk memeriksanya — itu membebani setiap
  // pemuatan halaman bagi pengguna yang tidak sedang memakai cloud. Token
  // sesi tersimpan di localStorage, jadi keberadaannya bisa dicek murah.
  const hasSession = () => {
    try {
      return Object.keys(localStorage).some(k =>
        k === 'aharian_sb_auth' || k.startsWith('sb-'));
    } catch (e) { return false; }
  };
  // Kembali dari magic link membawa token di fragment URL.
  const returningFromLink = /[#&](access_token|error_description)=/.test(location.hash);
  if (CloudSync.configured() && (hasSession() || returningFromLink)) {
    setTimeout(render, 400);
  }
  window.__renderCloud = render;
})();
