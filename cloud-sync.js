/* ── Supabase sync (model tim/workspace) ────────────────────────────────────
   OPSIONAL. Tanpa konfigurasi, file ini tidak melakukan apa pun dan aplikasi
   tetap berjalan penuh dari IndexedDB. Cloud adalah tambahan, bukan syarat —
   kalau Supabase mati atau project free tier ter-pause, data lokal tetap utuh.

   Model workspace: data milik organisasi, bukan per orang. Anggota workspace
   yang sama saling melihat update. RLS di database memeriksa keanggotaan,
   jadi bug di frontend tidak bisa membocorkan data ke workspace lain.

   Konfigurasi lewat localStorage supaya kredensial tidak pernah masuk repo:
     aharian_sb_url  → https://xxxx.supabase.co
     aharian_sb_key  → anon public key (aman di browser; RLS yang menjaga)
     aharian_ws      → workspace aktif
*/
'use strict';

const CloudSync = (() => {
  const LS_URL = 'aharian_sb_url', LS_KEY = 'aharian_sb_key', LS_WS = 'aharian_ws';
  let sb = null;

  const cfg = () => {
    // localStorage menang supaya pengguna bisa menunjuk ke project lain,
    // tapi tanpa itu pakai bawaan repo — rekan tim tidak perlu menempel
    // kredensial apa pun untuk mulai.
    const d = (typeof window !== 'undefined' && window.SUPABASE_DEFAULTS) || {};
    return {
      url: ((localStorage.getItem(LS_URL) || d.url || '')).trim().replace(/\/+$/, ''),
      key: ((localStorage.getItem(LS_KEY) || d.anonKey || '')).trim(),
    };
  };
  const configured = () => { const c = cfg(); return !!(c.url && c.key); };
  const activeWorkspace = () => {
    try { return JSON.parse(localStorage.getItem(LS_WS) || 'null'); } catch (e) { return null; }
  };
  const setActiveWorkspace = w => {
    if (w) localStorage.setItem(LS_WS, JSON.stringify(w));
    else localStorage.removeItem(LS_WS);
  };

  function saveConfig(url, key) {
    localStorage.setItem(LS_URL, String(url || '').trim().replace(/\/+$/, ''));
    localStorage.setItem(LS_KEY, String(key || '').trim());
    sb = null;
  }
  function clearConfig() {
    [LS_URL, LS_KEY, LS_WS].forEach(k => localStorage.removeItem(k));
    sb = null;
  }
  // Benar kalau koneksi berasal dari repo, bukan dipilih pengguna. Dipakai UI
  // untuk tidak menawarkan "Ganti Koneksi" seolah pengguna pernah mengaturnya.
  const usingDefaults = () => !localStorage.getItem(LS_URL);

  /* SDK dimuat hanya saat dipakai, supaya halaman tetap ringan bagi yang
     tidak mengaktifkan cloud. */
  async function loadSdk() {
    if (window.supabase && window.supabase.createClient) return window.supabase;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = res;
      s.onerror = () => rej(new Error('Gagal memuat SDK Supabase'));
      document.head.appendChild(s);
    });
    if (!window.supabase) throw new Error('SDK Supabase tidak tersedia');
    return window.supabase;
  }

  async function client() {
    if (sb) return sb;
    if (!configured()) throw new Error('Supabase belum dikonfigurasi');
    const sdk = await loadSdk();
    const c = cfg();
    sb = sdk.createClient(c.url, c.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'aharian_sb_auth' },
    });
    return sb;
  }

  async function currentUser() {
    if (!configured()) return null;
    try {
      const c = await client();
      const { data } = await c.auth.getUser();
      return (data && data.user) || null;
    } catch (e) { return null; }
  }

  async function signIn(email) {
    const c = await client();
    const { error } = await c.auth.signInWithOtp({
      email: String(email).trim(),
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw new Error(error.message);
  }

  async function signOut() {
    if (sb) await sb.auth.signOut();
    setActiveWorkspace(null);
  }

  /* ── Workspace ────────────────────────────────────────────────────────── */
  async function myWorkspaces() {
    const u = await currentUser();
    if (!u) return [];
    const c = await client();
    const { data, error } = await c.from('workspace_members')
      .select('role, workspaces(id,name,invite_code)')
      .eq('user_id', u.id);
    if (error) throw new Error(error.message);
    return (data || []).filter(r => r.workspaces)
      .map(r => ({ ...r.workspaces, role: r.role }));
  }

  async function createWorkspace(name) {
    const u = await currentUser();
    if (!u) throw new Error('Belum masuk');
    const c = await client();
    const { data: ws, error } = await c.from('workspaces')
      .insert({ name: String(name).trim(), created_by: u.id }).select().single();
    if (error) throw new Error(error.message);
    // Pembuat otomatis jadi owner, kalau tidak dia tidak bisa mengakses
    // workspace-nya sendiri karena RLS memeriksa keanggotaan.
    const { error: mErr } = await c.from('workspace_members')
      .insert({ workspace_id: ws.id, user_id: u.id, role: 'owner' });
    if (mErr) throw new Error(mErr.message);
    return { ...ws, role: 'owner' };
  }

  async function joinWorkspace(inviteCode) {
    const u = await currentUser();
    if (!u) throw new Error('Belum masuk');
    const c = await client();
    const { data: ws, error } = await c.from('workspaces')
      .select('id,name,invite_code').eq('invite_code', String(inviteCode).trim()).maybeSingle();
    if (error) throw new Error(error.message);
    if (!ws) throw new Error('Kode undangan tidak ditemukan');
    const { error: mErr } = await c.from('workspace_members')
      .upsert({ workspace_id: ws.id, user_id: u.id, role: 'editor' },
              { onConflict: 'workspace_id,user_id' });
    if (mErr) throw new Error(mErr.message);
    return { ...ws, role: 'editor' };
  }

  async function members(workspaceId) {
    const c = await client();
    const { data, error } = await c.from('workspace_members')
      .select('user_id, role, joined_at').eq('workspace_id', workspaceId);
    if (error) throw new Error(error.message);
    return data || [];
  }

  /* ── Sinkronisasi ─────────────────────────────────────────────────────── */
  const CHUNK = 500;

  async function upsertAll(table, rows, conflict) {
    if (!rows.length) return 0;
    const c = await client();
    let n = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await c.from(table).upsert(slice, { onConflict: conflict });
      if (error) throw new Error(`${table}: ${error.message}`);
      n += slice.length;
    }
    return n;
  }

  async function fetchAll(table, accountId) {
    const c = await client();
    const rows = [];
    let from = 0;
    // Supabase membatasi 1000 baris per permintaan.
    for (;;) {
      const { data, error } = await c.from(table).select('*')
        .eq('account_id', accountId).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    return rows;
  }

  async function push(store, localAcct, onProgress) {
    const ws = activeWorkspace();
    if (!ws) throw new Error('Belum memilih workspace');
    if (ws.role === 'viewer') throw new Error('Peran viewer tidak boleh mengubah data');
    const c = await client();
    const say = m => onProgress && onProgress(m);

    say('Menyiapkan akun...');
    const { data: acct, error: aErr } = await c.from('accounts')
      .upsert({ workspace_id: ws.id, kind: 'shopee', name: localAcct.name },
              { onConflict: 'workspace_id,kind,name' })
      .select().single();
    if (aErr) throw new Error('accounts: ' + aErr.message);

    const base = { workspace_id: ws.id, account_id: acct.id };
    const out = {};

    say('Mengirim data affiliate...');
    out.affiliate = await upsertAll('daily_affiliate',
      (await store.range(localAcct.id, 'affiliate')).map(r => ({
        ...base, date: r.date, tag: r.tag,
        comm: r.comm || 0, comm_done: r.comm_done || 0, comm_pending: r.comm_pending || 0,
        gmv: r.gmv || 0, qty: r.qty || 0, refund: r.refund || 0,
        orders: r.orders || 0, excluded: r.excluded || 0, rows: r.rows || 0,
      })), 'account_id,date,tag');

    say('Mengirim data iklan...');
    out.ads = await upsertAll('daily_ads',
      (await store.range(localAcct.id, 'ads')).map(r => ({
        ...base, date: r.date, ad_unit: r.ad_unit,
        spend: r.spend || 0, impressions: r.impressions || 0, reach: r.reach || 0,
        clicks: r.clicks || 0, shop_clicks: r.shop_clicks || 0, lpv: r.lpv || 0,
        results: r.results || 0, delivery: r.delivery || null,
        cpm: r.cpm || 0, cpc: r.cpc || 0, ctr: r.ctr || 0,
      })), 'account_id,date,ad_unit');

    say('Mengirim data klik...');
    out.clicks = await upsertAll('daily_clicks',
      (await store.range(localAcct.id, 'clicks')).map(r => ({
        ...base, date: r.date, tag: r.tag, clicks: r.clicks || 0,
        by_region: r.by_region || {}, by_source: r.by_source || {},
      })), 'account_id,date,tag');

    say('Mengirim jejak dedup...');
    out.uploads = await upsertAll('uploads',
      (await store.uploadHistory(localAcct.id)).map(r => ({
        ...base, kind: r.kind, file_hash: r.file_hash, file_name: r.file_name || null,
        rows: r.rows || 0, added: r.added || 0, updated: r.updated || 0,
        duplicates: r.duplicates || 0,
        period_start: r.period_start || null, period_end: r.period_end || null,
      })), 'account_id,file_hash');

    // Hash baris ikut naik; tanpa ini rekan tim di perangkat lain akan
    // menganggap file yang sudah diunggah sebagai file baru.
    const hashes = [];
    for (const kind of ['affiliate', 'ads', 'clicks']) {
      (await store.knownRowHashes(localAcct.id, kind))
        .forEach(h => hashes.push({ ...base, kind, hash: h }));
    }
    out.hashes = await upsertAll('row_hashes', hashes, 'account_id,kind,hash');

    return { account: acct, counts: out };
  }

  async function cloudAccounts() {
    const ws = activeWorkspace();
    if (!ws) return [];
    const c = await client();
    const { data, error } = await c.from('accounts')
      .select('id,name,kind').eq('workspace_id', ws.id).eq('kind', 'shopee').order('name');
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function pull(store, cloudAcct, onProgress) {
    const ws = activeWorkspace();
    if (!ws) throw new Error('Belum memilih workspace');
    const say = m => onProgress && onProgress(m);

    say('Menyiapkan akun lokal...');
    const local = await store.ensureAccount('shopee', cloudAcct.name);
    const out = {};

    say('Mengambil data affiliate...');
    const aff = (await fetchAll('daily_affiliate', cloudAcct.id)).map(r => ({
      date: r.date, tag: r.tag, comm: +r.comm, comm_done: +r.comm_done,
      comm_pending: +r.comm_pending, gmv: +r.gmv, qty: r.qty, refund: +r.refund,
      orders: r.orders, excluded: r.excluded, rows: r.rows,
    }));
    if (aff.length) { await store.saveDaily(local.id, 'affiliate', aff, {}); }
    out.affiliate = aff.length;

    say('Mengambil data iklan...');
    const ads = (await fetchAll('daily_ads', cloudAcct.id)).map(r => ({
      date: r.date, ad_unit: r.ad_unit, spend: +r.spend, impressions: +r.impressions,
      reach: +r.reach, clicks: r.clicks, shop_clicks: r.shop_clicks, lpv: r.lpv,
      results: r.results, delivery: r.delivery || '', cpm: +r.cpm, cpc: +r.cpc, ctr: +r.ctr,
    }));
    if (ads.length) { await store.saveDaily(local.id, 'ads', ads, {}); }
    out.ads = ads.length;

    say('Mengambil data klik...');
    const clk = (await fetchAll('daily_clicks', cloudAcct.id)).map(r => ({
      date: r.date, tag: r.tag, clicks: r.clicks,
      by_region: r.by_region || {}, by_source: r.by_source || {},
    }));
    if (clk.length) { await store.saveDaily(local.id, 'clicks', clk, {}); }
    out.clicks = clk.length;

    say('Memulihkan jejak dedup...');
    const ups = await fetchAll('uploads', cloudAcct.id);
    const hashes = await fetchAll('row_hashes', cloudAcct.id);
    await store.restoreDedup(local.id, ups, hashes);

    return { account: local, counts: out, uploads: ups.length, hashes: hashes.length };
  }

  /* Query silang antar akun — dihitung di database, bukan di browser. */
  async function workspaceMonthly(monthsBack) {
    const ws = activeWorkspace();
    if (!ws) return [];
    const c = await client();
    const since = new Date();
    since.setMonth(since.getMonth() - (monthsBack || 12));
    const { data, error } = await c.from('v_workspace_monthly')
      .select('*').eq('workspace_id', ws.id)
      .gte('month', since.toISOString().slice(0, 10)).order('month');
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function accountMonthly(monthsBack) {
    const ws = activeWorkspace();
    if (!ws) return [];
    const c = await client();
    const since = new Date();
    since.setMonth(since.getMonth() - (monthsBack || 12));
    const { data, error } = await c.from('v_account_monthly')
      .select('*, accounts(name)').eq('workspace_id', ws.id)
      .gte('month', since.toISOString().slice(0, 10)).order('month');
    if (error) throw new Error(error.message);
    return data || [];
  }

  /* Realtime: rekan tim mengunggah, layar Anda ikut tahu. */
  function subscribe(onChange) {
    const ws = activeWorkspace();
    if (!ws) return null;
    return client().then(c => {
      const ch = c.channel('ws-' + ws.id)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'daily_affiliate', filter: `workspace_id=eq.${ws.id}` },
          p => onChange && onChange(p))
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'uploads', filter: `workspace_id=eq.${ws.id}` },
          p => onChange && onChange(p))
        .subscribe();
      return ch;
    });
  }

  return {
    configured, saveConfig, clearConfig, cfg, usingDefaults,
    currentUser, signIn, signOut,
    myWorkspaces, createWorkspace, joinWorkspace, members,
    activeWorkspace, setActiveWorkspace,
    push, pull, cloudAccounts,
    workspaceMonthly, accountMonthly, subscribe,
  };
})();

if (typeof window !== 'undefined') window.CloudSync = CloudSync;
