-- Harness untuk menguji skema Supabase di Postgres biasa.
-- Supabase menyediakan skema auth dan fungsi auth.uid() dari GoTrue; di sini
-- keduanya ditiru supaya kebijakan RLS bisa diuji sungguhan sebelum menyentuh
-- project asli.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);

-- auth.uid() Supabase membaca klaim JWT; di sini dibaca dari GUC yang bisa
-- kita set per sesi untuk berpura-pura jadi pengguna tertentu.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

-- Peran anon meniru klien browser: tidak boleh melewati RLS.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant usage on schema public, auth to anon;
