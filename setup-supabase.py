#!/usr/bin/env python3
"""
Pasang skema Affiliate Harian ke Supabase lewat Management API.

Dipakai supaya pengguna tidak perlu menyentuh SQL Editor sama sekali: cukup
satu Personal Access Token, sisanya otomatis — pilih project, jalankan skema,
verifikasi RLS, lalu ambil URL dan anon key untuk aplikasi.

Pakai:
    export SUPABASE_PAT=sbp_xxxxx
    python3 setup-supabase.py              # daftar project, lalu pilih
    python3 setup-supabase.py <project_ref> # langsung ke project tertentu
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.supabase.com/v1"
PAT = os.environ.get("SUPABASE_PAT", "").strip()


def call(method, path, body=None, token=None):
    url = API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + (token or PAT))
    req.add_header("Content-Type", "application/json")
    # Tanpa User-Agent yang wajar, Cloudflare di depan api.supabase.com
    # menolak dengan error 1010 dan itu terlihat seperti token tidak valid.
    req.add_header("User-Agent", "affiliate-harian-setup/1.0")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:400]}


def run_sql(ref, sql):
    return call("POST", f"/projects/{ref}/database/query", {"query": sql})


def main():
    if not PAT:
        print("SUPABASE_PAT belum diatur.")
        print("Buat di https://supabase.com/dashboard/account/tokens")
        return 1

    print("== memeriksa token ==")
    code, projects = call("GET", "/projects")
    if code != 200:
        print(f"   GAGAL ({code}): {projects}")
        return 1
    print(f"   token valid, {len(projects)} project ditemukan")

    ref = sys.argv[1] if len(sys.argv) > 1 else None
    if not ref:
        print("\n== project di akun Anda ==")
        for p in projects:
            print(f"   {p['id']}  {p['name']:<28} {p['region']:<16} {p['status']}")
        active = [p for p in projects if p.get("status") == "ACTIVE_HEALTHY"]
        if len(active) == 1:
            ref = active[0]["id"]
            print(f"\n   hanya satu project aktif, dipakai: {active[0]['name']}")
        else:
            print("\nJalankan ulang dengan project ref yang dipilih:")
            print("   python3 setup-supabase.py <project_ref>")
            return 0

    proj = next((p for p in projects if p["id"] == ref), None)
    if not proj:
        print(f"   project {ref} tidak ada di akun ini")
        return 1
    print(f"\n== project: {proj['name']} ({ref}) · {proj['region']} · {proj['status']} ==")

    if proj.get("status") != "ACTIVE_HEALTHY":
        print(f"   project berstatus {proj['status']}, bukan ACTIVE_HEALTHY.")
        print("   Kalau ter-pause, restore dulu dari dashboard.")
        return 1

    here = os.path.dirname(os.path.abspath(__file__))
    schema = open(os.path.join(here, "supabase-schema.sql")).read()

    print("\n== memasang skema ==")
    code, res = run_sql(ref, schema)
    if code not in (200, 201):
        print(f"   GAGAL ({code}): {json.dumps(res)[:500]}")
        return 1
    print("   skema terpasang")

    print("\n== verifikasi RLS ==")
    code, rows = run_sql(ref, """
        select tablename, rowsecurity from pg_tables
        where schemaname='public' and tablename in
          ('workspaces','workspace_members','accounts','daily_affiliate',
           'daily_ads','daily_clicks','uploads','row_hashes')
        order by tablename;""")
    if code not in (200, 201) or not rows:
        print(f"   GAGAL membaca status RLS: {rows}")
        return 1
    bad = [r for r in rows if not r.get("rowsecurity")]
    for r in rows:
        print(f"   {'OK  ' if r['rowsecurity'] else 'BAHAYA'} {r['tablename']}")
    if bad:
        print(f"\n   {len(bad)} tabel tanpa RLS — jangan dipakai sebelum diperbaiki")
        return 1
    if len(rows) != 8:
        print(f"\n   hanya {len(rows)} dari 8 tabel terbentuk")
        return 1
    print(f"   {len(rows)}/8 tabel terlindungi")

    print("\n== verifikasi view tidak melewati RLS ==")
    code, views = run_sql(ref, """
        select c.relname,
               coalesce('security_invoker=true' = any(c.reloptions), false) as aman
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='v' order by c.relname;""")
    if code in (200, 201) and views:
        for v in views:
            print(f"   {'OK  ' if v['aman'] else 'BOCOR'} {v['relname']}")
        if any(not v["aman"] for v in views):
            print("\n   view melewati RLS — anggota bisa melihat data workspace lain")
            return 1

    print("\n== mengambil kredensial aplikasi ==")
    code, keys = call("GET", f"/projects/{ref}/api-keys")
    anon = None
    if code == 200 and isinstance(keys, list):
        anon = next((k.get("api_key") for k in keys if k.get("name") == "anon"), None)
    url = f"https://{ref}.supabase.co"
    print(f"   URL : {url}")
    print(f"   anon: {(anon[:24] + '...') if anon else 'gagal diambil — lihat Settings > API'}")

    if anon:
        # Ditulis ke file yang di-ignore git, bukan dicetak penuh ke terminal.
        out = os.path.join(here, ".supabase-creds.json")
        json.dump({"url": url, "anon_key": anon, "project_ref": ref,
                   "project_name": proj["name"]}, open(out, "w"), indent=2)
        print(f"   disimpan ke {os.path.basename(out)} (di-ignore git)")

    print("\nSELESAI — database siap dipakai.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
