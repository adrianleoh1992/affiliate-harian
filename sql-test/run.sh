#!/usr/bin/env bash
# Uji skema Supabase di Postgres lokal sebelum menyentuh project asli.
#
# Kenapa perlu: kebijakan RLS yang salah tidak memunculkan error — dia hanya
# diam-diam memperlihatkan data yang seharusnya tersembunyi. Satu-satunya cara
# tahu adalah mencoba membacanya sebagai pengguna lain.
#
# Uji ini pernah menemukan kebocoran nyata: view rollup berjalan sebagai
# pemiliknya dan melewati RLS, sehingga anggota satu workspace bisa melihat
# total workspace lain. Ditutup dengan security_invoker = true.
#
# Butuh: postgresql (brew install postgresql@16)
# Jalankan: bash sql-test/run.sh

set -euo pipefail
export LC_ALL=C LANG=C

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGDATA=/tmp/pgtest-aharian
PORT=55432
SOCK=/tmp

cleanup() {
  pg_ctl -D "$PGDATA" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$PGDATA" /tmp/pgtest-aharian.log
}
trap cleanup EXIT

echo "== menyiapkan postgres sementara =="
rm -rf "$PGDATA"
initdb -D "$PGDATA" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$PGDATA" -o "-p $PORT -k $SOCK" -l /tmp/pgtest-aharian.log start >/dev/null
sleep 3

psql -h $SOCK -p $PORT -U postgres -qc "create database sbtest;"
psql -h $SOCK -p $PORT -U postgres -d sbtest -q -f "$DIR/00-harness.sql"

echo "== menjalankan skema =="
psql -h $SOCK -p $PORT -U postgres -d sbtest -q -v ON_ERROR_STOP=1 \
  -f "$DIR/../supabase-schema.sql" >/dev/null
echo "   skema jalan tanpa error"

echo "== memeriksa RLS aktif di semua tabel =="
OFF=$(psql -h $SOCK -p $PORT -U postgres -d sbtest -tAc \
  "select count(*) from pg_tables where schemaname='public' and rowsecurity=false;")
if [ "$OFF" != "0" ]; then
  echo "   GAGAL: $OFF tabel tanpa RLS"; exit 1
fi
echo "   semua tabel RLS aktif"

echo "== memeriksa view memakai security_invoker =="
BAD=$(psql -h $SOCK -p $PORT -U postgres -d sbtest -tAc \
  "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='v'
     and (c.reloptions is null or not ('security_invoker=true' = any(c.reloptions)));")
if [ "$BAD" != "0" ]; then
  echo "   GAGAL: $BAD view melewati RLS — anggota bisa melihat data workspace lain"
  exit 1
fi
echo "   semua view menghormati RLS"

echo "== uji isolasi antar workspace =="
OUT=$(psql -h $SOCK -p $PORT -U postgres -d sbtest -f "$DIR/01-rls.sql" 2>&1)

fail=0
check() {
  if echo "$OUT" | sed -n "/=== $1/,/^$/p" | grep -q "$2"; then
    echo "   PASS  $3"
  else
    echo "   FAIL  $3"; fail=1
  fi
}

check "3\." "RahasiaAgensiLain" "orang luar hanya melihat datanya sendiri"
echo "$OUT" | sed -n '/=== 3\./,/^$/p' | grep -q "TelesinGripvideo2" \
  && { echo "   FAIL  orang luar BISA melihat data Berlima"; fail=1; } \
  || echo "   PASS  orang luar tidak bisa melihat data Berlima"
check "4\." " 0" "tanpa login tidak melihat apa pun"
check "5\." "violates row-level security" "orang luar ditolak saat menulis"
check "7\." "violates row-level security" "viewer ditolak saat menulis"
check "8\." "TelesinGripvideo2" "viewer tetap bisa membaca"
check "10\." "6568003" "upsert tidak menggandakan"

# Yang paling penting: view rollup tidak boleh membocorkan workspace lain.
if echo "$OUT" | sed -n '/=== 9\./,/^$/p' | grep -q "99999999"; then
  echo "   FAIL  view rollup MEMBOCORKAN data workspace lain"; fail=1
else
  echo "   PASS  view rollup tidak membocorkan workspace lain"
fi

echo ""
if [ "$fail" = "0" ]; then
  echo "SEMUA UJI RLS LOLOS"
else
  echo "ADA UJI YANG GAGAL"; exit 1
fi
