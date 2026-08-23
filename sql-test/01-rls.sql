-- Uji RLS sungguhan: apakah anggota workspace A benar-benar tidak bisa
-- membaca data workspace B, dan apakah viewer benar-benar tidak bisa menulis.
-- Ini yang menentukan aman atau tidaknya membagi anon key ke tim.

\set ON_ERROR_STOP off
\pset pager off

-- Dua pengguna, dua workspace.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'adrian@berlima.id'),
  ('22222222-2222-2222-2222-222222222222', 'rekan@berlima.id'),
  ('33333333-3333-3333-3333-333333333333', 'orangluar@lain.com')
on conflict do nothing;

-- Seed sebagai superuser (melewati RLS) supaya kondisi awal jelas.
insert into public.workspaces (id, name, created_by, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Berlima Digital',
   '11111111-1111-1111-1111-111111111111', 'kode-berlima'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Agensi Lain',
   '33333333-3333-3333-3333-333333333333', 'kode-lain')
on conflict do nothing;

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'owner')
on conflict do nothing;

insert into public.accounts (id, workspace_id, kind, name) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'shopee', 'BBA Utama'),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'shopee', 'Akun Rahasia')
on conflict do nothing;

insert into public.daily_affiliate (workspace_id, account_id, date, tag, comm, orders) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   '2026-08-01', 'TelesinGripvideo2', 6568003, 1200),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002',
   '2026-08-01', 'RahasiaAgensiLain', 99999999, 5000)
on conflict do nothing;

-- Mulai bertindak sebagai klien browser: peran anon, RLS berlaku penuh.
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;

\echo ''
\echo '=== 1. ADRIAN (owner Berlima) melihat apa? ==='
set role anon;
set test.uid = '11111111-1111-1111-1111-111111111111';
select tag, comm::bigint from public.daily_affiliate order by tag;

\echo ''
\echo '=== 2. REKAN (editor Berlima) melihat apa? ==='
set test.uid = '22222222-2222-2222-2222-222222222222';
select tag, comm::bigint from public.daily_affiliate order by tag;

\echo ''
\echo '=== 3. ORANG LUAR (workspace lain) melihat apa? ==='
set test.uid = '33333333-3333-3333-3333-333333333333';
select tag, comm::bigint from public.daily_affiliate order by tag;

\echo ''
\echo '=== 4. TANPA LOGIN (anon key saja) melihat apa? ==='
set test.uid = '';
select count(*) as baris_terlihat from public.daily_affiliate;

\echo ''
\echo '=== 5. ORANG LUAR mencoba MENULIS ke workspace Berlima ==='
set test.uid = '33333333-3333-3333-3333-333333333333';
insert into public.daily_affiliate (workspace_id, account_id, date, tag, comm, orders)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        '2026-08-02', 'Penyusup', 1, 1);

\echo ''
\echo '=== 6. ORANG LUAR mencoba MEMBACA akun Berlima ==='
select name from public.accounts order by name;

\echo ''
\echo '=== 7. VIEWER mencoba menulis ==='
reset role;
insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer')
on conflict (workspace_id, user_id) do update set role = 'viewer';
set role anon;
set test.uid = '33333333-3333-3333-3333-333333333333';
insert into public.daily_affiliate (workspace_id, account_id, date, tag, comm, orders)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        '2026-08-03', 'ViewerNulis', 1, 1);

\echo ''
\echo '=== 8. VIEWER membaca (harus BOLEH) ==='
select tag, comm::bigint from public.daily_affiliate
where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by tag;

\echo ''
\echo '=== 9. QUERY SILANG ANTAR AKUN (view rollup) ==='
set test.uid = '11111111-1111-1111-1111-111111111111';
select month, comm::bigint, orders from public.v_workspace_monthly order by month;

\echo ''
\echo '=== 10. UPSERT tidak menggandakan ==='
set test.uid = '22222222-2222-2222-2222-222222222222';
insert into public.daily_affiliate (workspace_id, account_id, date, tag, comm, orders)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        '2026-08-01', 'TelesinGripvideo2', 6568003, 1200)
on conflict (account_id, date, tag) do update set comm = excluded.comm;
select count(*) as baris, sum(comm)::bigint as total from public.daily_affiliate
where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

reset role;
