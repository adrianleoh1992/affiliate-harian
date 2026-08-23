-- ═══════════════════════════════════════════════════════════════════════════
-- Affiliate Harian — skema Supabase untuk TIM (model workspace)
-- Jalankan sekali: Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Model: workspace = organisasi (mis. Berlima). Semua data milik workspace,
-- bukan per orang. Anggota workspace bisa saling melihat update. Peran:
--   owner   — kelola anggota, hapus data
--   editor  — unggah dan ubah data
--   viewer  — hanya melihat
--
-- Ini berbeda dari model per-user: RLS memeriksa KEANGGOTAAN workspace,
-- bukan auth.uid() saja. Dua orang di workspace yang sama melihat data yang
-- sama.

-- ── Extension ─────────────────────────────────────────────────────────────
-- gen_random_bytes() untuk kode undangan berasal dari pgcrypto. Supabase
-- biasanya sudah mengaktifkannya, tapi jangan diandalkan: project baru bisa
-- gagal di baris pertama tanpa ini.
create extension if not exists pgcrypto;

-- ── Workspace & keanggotaan ────────────────────────────────────────────────
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  digest_webhook text,   -- opsional: URL webhook untuk ringkasan harian otomatis
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','editor','viewer')),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ── Akun (milik workspace, bukan pengguna) ────────────────────────────────
create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind         text not null check (kind in ('shopee','ads')),
  name         text not null,
  parent_id    uuid references public.accounts(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (workspace_id, kind, name)
);

-- ── Agregat harian affiliate ───────────────────────────────────────────────
create table if not exists public.daily_affiliate (
  id            bigserial primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  account_id    uuid not null references public.accounts(id) on delete cascade,
  date          date not null,
  tag           text not null,
  comm          numeric(14,2) not null default 0,
  comm_done     numeric(14,2) not null default 0,
  comm_pending  numeric(14,2) not null default 0,
  gmv           numeric(16,2) not null default 0,
  qty           integer not null default 0,
  refund        numeric(14,2) not null default 0,
  orders        integer not null default 0,
  excluded      integer not null default 0,
  rows          integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (account_id, date, tag)
);

-- ── Agregat harian iklan ───────────────────────────────────────────────────
create table if not exists public.daily_ads (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  date         date not null,
  ad_unit      text not null,
  spend        numeric(14,2) not null default 0,
  impressions  bigint not null default 0,
  reach        bigint not null default 0,
  clicks       integer not null default 0,
  shop_clicks  integer not null default 0,
  lpv          integer not null default 0,
  results      integer not null default 0,
  delivery     text,
  cpm          numeric(12,2) not null default 0,
  cpc          numeric(12,2) not null default 0,
  ctr          numeric(8,4)  not null default 0,
  updated_at   timestamptz not null default now(),
  unique (account_id, date, ad_unit)
);

-- ── Agregat harian klik ────────────────────────────────────────────────────
create table if not exists public.daily_clicks (
  id          bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  date        date not null,
  tag         text not null,
  clicks      integer not null default 0,
  by_region   jsonb not null default '{}'::jsonb,
  by_source   jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (account_id, date, tag)
);

-- ── Log unggahan & hash baris (dedup lintas perangkat) ─────────────────────
create table if not exists public.uploads (
  id           bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id   uuid not null references public.accounts(id) on delete cascade,
  kind         text not null,
  file_hash    text not null,
  file_name    text,
  rows         integer not null default 0,
  added        integer not null default 0,
  updated      integer not null default 0,
  duplicates   integer not null default 0,
  period_start date,
  period_end   date,
  uploaded_at  timestamptz not null default now(),
  unique (account_id, file_hash)
);

create table if not exists public.row_hashes (
  id          bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  kind        text not null,
  hash        text not null,
  unique (account_id, kind, hash)
);

-- ── Indeks ────────────────────────────────────────────────────────────────
create index if not exists idx_aff_acct_date on public.daily_affiliate (account_id, date);
create index if not exists idx_ads_acct_date  on public.daily_ads (account_id, date);
create index if not exists idx_clk_acct_date  on public.daily_clicks (account_id, date);
create index if not exists idx_rh_acct_kind   on public.row_hashes (account_id, kind);
create index if not exists idx_up_acct        on public.uploads (account_id, uploaded_at desc);

-- ── Fungsi bantu RLS ──────────────────────────────────────────────────────
create or replace function public.is_workspace_member(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = w and user_id = auth.uid()
  );
$$;

create or replace function public.workspace_role(w uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.workspace_members
  where workspace_id = w and user_id = auth.uid();
$$;

-- ── Row Level Security ────────────────────────────────────────────────────
alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.accounts           enable row level security;
alter table public.daily_affiliate    enable row level security;
alter table public.daily_ads          enable row level security;
alter table public.daily_clicks       enable row level security;
alter table public.uploads            enable row level security;
alter table public.row_hashes         enable row level security;

-- workspaces: lihat yang diikuti; kelola hanya pemilik
drop policy if exists "lihat workspace" on public.workspaces;
create policy "lihat workspace" on public.workspaces
  for select using (public.is_workspace_member(id) or created_by = auth.uid());
drop policy if exists "buat workspace" on public.workspaces;
create policy "buat workspace" on public.workspaces
  for insert with check (created_by = auth.uid());
drop policy if exists "kelola workspace" on public.workspaces;
create policy "kelola workspace" on public.workspaces
  for update using (public.workspace_role(id) = 'owner');

-- keanggotaan: lihat jika anggota; gabung lewat undangan; hapus oleh owner
drop policy if exists "lihat anggota" on public.workspace_members;
create policy "lihat anggota" on public.workspace_members
  for select using (public.is_workspace_member(workspace_id));
drop policy if exists "gabung workspace" on public.workspace_members;
create policy "gabung workspace" on public.workspace_members
  for insert with check (
    -- pemilik menambah anggota, atau pengguna bergabung lewat kode undangan
    (public.workspace_role(workspace_id) in ('owner','editor')) or
    (user_id = auth.uid())
  );
drop policy if exists "kelola anggota" on public.workspace_members;
create policy "kelola anggota" on public.workspace_members
  for delete using (public.workspace_role(workspace_id) = 'owner' or user_id = auth.uid());

-- akun: baca anggota; tulis editor/owner; hapus owner
drop policy if exists "baca akun" on public.accounts;
create policy "baca akun" on public.accounts
  for select using (public.is_workspace_member(workspace_id));
drop policy if exists "tulis akun" on public.accounts;
create policy "tulis akun" on public.accounts
  for insert with check (public.workspace_role(workspace_id) in ('owner','editor'));
drop policy if exists "ubah akun" on public.accounts;
create policy "ubah akun" on public.accounts
  for update using (public.workspace_role(workspace_id) in ('owner','editor'));
drop policy if exists "hapus akun" on public.accounts;
create policy "hapus akun" on public.accounts
  for delete using (public.workspace_role(workspace_id) = 'owner');

-- data harian: baca anggota, tulis editor/owner, hapus owner
do $$
declare t text;
begin
  foreach t in array array['daily_affiliate','daily_ads','daily_clicks','uploads','row_hashes']
  loop
    execute format('drop policy if exists "baca data" on public.%I', t);
    execute format('create policy "baca data" on public.%I
      for select using (public.is_workspace_member(workspace_id))', t);
    execute format('drop policy if exists "tulis data" on public.%I', t);
    execute format('create policy "tulis data" on public.%I
      for insert with check (public.workspace_role(workspace_id) in (''owner'',''editor''))', t);
    execute format('drop policy if exists "ubah data" on public.%I', t);
    execute format('create policy "ubah data" on public.%I
      for update using (public.workspace_role(workspace_id) in (''owner'',''editor''))', t);
    execute format('drop policy if exists "hapus data" on public.%I', t);
    execute format('create policy "hapus data" on public.%I
      for delete using (public.workspace_role(workspace_id) = ''owner'')', t);
  end loop;
end $$;

-- ── Rollup untuk query silang antar akun ──────────────────────────────────
-- "total semua akun bulan ini" cukup SELECT dari view ini, tanpa membawa
-- ratusan MB ke browser.
--
-- security_invoker WAJIB. Tanpa itu view berjalan sebagai pemiliknya
-- (postgres), yang melewati RLS sepenuhnya — anggota satu workspace akan
-- melihat angka workspace lain lewat view meski tabelnya terlindungi.
-- Ini terbukti bocor saat diuji sebelum opsi ini ditambahkan.
create or replace view public.v_account_monthly
with (security_invoker = true) as
select
  workspace_id,
  account_id,
  date_trunc('month', date)::date as month,
  sum(comm)          as comm,
  sum(comm_done)     as comm_done,
  sum(comm_pending)  as comm_pending,
  sum(orders)        as orders,
  sum(gmv)           as gmv,
  count(distinct tag) as tags
from public.daily_affiliate
group by 1, 2, 3;

create or replace view public.v_workspace_monthly
with (security_invoker = true) as
select
  workspace_id,
  date_trunc('month', date)::date as month,
  sum(comm)       as comm,
  sum(comm_done)  as comm_done,
  sum(comm_pending) as comm_pending,
  sum(orders)     as orders,
  sum(gmv)        as gmv
from public.daily_affiliate
group by 1, 2;

-- ── Verifikasi ────────────────────────────────────────────────────────────
-- Harus mengembalikan 8 baris, semuanya rowsecurity = true.
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('workspaces','workspace_members','accounts','daily_affiliate',
                    'daily_ads','daily_clicks','uploads','row_hashes')
order by tablename;
