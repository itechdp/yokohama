#!/bin/bash
# Tests the RBAC migrations (supabase/migrations/rbac_01..05) on a THROWAWAY local PostgreSQL
# cluster - never Supabase, never any shared database.
#
#   tests/sql/run-rbac-tests.sh <scratch-dir> [port]
#
# Same isolation rules as run-local-pg-tests.sh: its own cluster in <scratch-dir> (must not
# exist), 127.0.0.1 only, no unix socket, refuses a busy port, every client under `env -i`,
# loads only local SQL files, deletes the cluster at the end. It never reads .env files.
# Supabase's roles, default grants and the bits of the `auth` schema the functions use
# (auth.uid(), auth.jwt(), auth.users, auth.sessions) are recreated by hand below, so this
# is a close model of Supabase, not Supabase itself. Real Supabase Auth behaviour (password
# hashes, sessions, Edge Functions) is tested on the staging project.
set -u
SCRATCH="${1:?usage: $0 <scratch-dir> [port]}"
PORT="${2:-54331}"
PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@18/bin}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -e "$SCRATCH" ] && { echo "refusing: $SCRATCH already exists"; exit 2; }
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "refusing: port $PORT is in use"; exit 2; }
mkdir -p "$SCRATCH"
CLEAN=(env -i PATH=/usr/bin:/bin:"$PGBIN" LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8)
cleanup() { "${CLEAN[@]}" "$PGBIN/pg_ctl" -D "$SCRATCH/data" -m immediate stop >/dev/null 2>&1; rm -rf "$SCRATCH"; }
trap cleanup EXIT
"${CLEAN[@]}" "$PGBIN/initdb" -D "$SCRATCH/data" -U postgres -A trust --locale=en_US.UTF-8 >/dev/null 2>&1 || { echo "initdb failed"; exit 2; }
"${CLEAN[@]}" "$PGBIN/pg_ctl" -w -D "$SCRATCH/data" -l "$SCRATCH/server.log" \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c max_connections=60" start >/dev/null || { echo "server start failed"; exit 2; }
psqlx() { "${CLEAN[@]}" "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q "$@"; }
psqlx -d postgres -c "create database app" >/dev/null
DB() { psqlx -d app -v ON_ERROR_STOP=1 "$@"; }

echo "== isolation proof: data directory = $(psqlx -At -d postgres -c 'show data_directory'), listen = $(psqlx -At -d postgres -c 'show listen_addresses')"

DB >/dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, encrypted_password text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
SQL

# The app's existing migrations (retry passes resolve ordering). drop_old_auth.sql needs pg_cron: ignored.
cd "$ROOT/supabase/migrations"
DB -f "$ROOT/supabase/schema.sql" >/dev/null 2>&1
ls | grep -v '^rbac_' | grep -v '^drop_old_auth' > "$SCRATCH/todo"
for pass in 1 2 3 4 5; do
  : > "$SCRATCH/next"
  while read -r f; do DB -f "$f" >/dev/null 2>&1 || echo "$f" >> "$SCRATCH/next"; done < "$SCRATCH/todo"
  cp "$SCRATCH/next" "$SCRATCH/todo"; [ -s "$SCRATCH/todo" ] || break
done
[ -s "$SCRATCH/todo" ] && { echo "existing migrations that did not apply:"; cat "$SCRATCH/todo"; exit 2; }
echo "== existing migrations applied"

for f in rbac_01_foundation rbac_02_functions rbac_03_workflow_functions; do
  out=$(DB -f "$ROOT/supabase/migrations/$f.sql" 2>&1 | grep -E "ERROR")
  [ -z "$out" ] && echo "== $f.sql applied" || { echo "FAIL: $f.sql: $out"; exit 1; }
  # idempotent: a second run must also succeed
  out=$(DB -f "$ROOT/supabase/migrations/$f.sql" 2>&1 | grep -E "ERROR")
  [ -z "$out" ] || { echo "FAIL: $f.sql is not re-runnable: $out"; exit 1; }
done

psqlx -d app -v root="$ROOT" -f "$ROOT/tests/sql/rbac/rbac_test.sql" 2>&1 | grep -E "ERROR" | head -5
psqlx -d app -v root="$ROOT" -f "$ROOT/tests/sql/rbac/rbac_test_rls.sql" 2>&1 | grep -E "ERROR|abort" | head -5

# Rollbacks: Stage C, then re-apply, then C and A; the legacy users table must come out byte-identical.
BEFORE=$(psqlx -d app -At -c "select md5(string_agg(id||username||password||role, ',' order by id)) from users")
psqlx -d app -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/rbac_rollback_stage_c.sql" >/dev/null 2>&1 \
  && psqlx -d app -c "insert into t_res(name, ok, detail) values ('rollback C runs cleanly', true, '')" >/dev/null \
  || psqlx -d app -c "insert into t_res(name, ok, detail) values ('rollback C runs cleanly', false, 'error')" >/dev/null
psqlx -d app -c "insert into t_res(name, ok, detail) select 'rollback C reopens the original policy', (select count(*) = 1 from pg_policies where tablename='tires' and policyname='tires_anon_all'), ''" >/dev/null
psqlx -d app -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/migrations/rbac_05_rls_cutover.sql" >/dev/null 2>&1 \
  && psqlx -d app -c "insert into t_res(name, ok, detail) values ('cutover can be re-applied after a rollback', true, '')" >/dev/null \
  || psqlx -d app -c "insert into t_res(name, ok, detail) values ('cutover can be re-applied after a rollback', false, 'error')" >/dev/null
psqlx -d app -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/rbac_rollback_stage_c.sql" >/dev/null 2>&1
psqlx -d app -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/rollback/rbac_rollback_stage_a.sql" >/dev/null 2>&1; RA=$?
AFTER=$(psqlx -d app -At -c "select md5(string_agg(id||username||password||role, ',' order by id)) from users")
psqlx -d app -c "create table if not exists t_res2(name text, ok boolean)" >/dev/null
LEFT=$(psqlx -d app -At -c "select count(*) from pg_tables where schemaname='public' and tablename like 'app\_%' and tablename <> 'app_settings'")
LEGACY=$(psqlx -d app -At -c "select count(*) from app_login('mehul','Legacy-pass-1')")

echo
echo "== RESULTS"
psqlx -d app -At -F' | ' -c "select 'FAIL: '||name||' -> '||detail from t_res where not ok order by n"
PASS=$(psqlx -d app -At -c "select count(*) from t_res where ok"); FAIL=$(psqlx -d app -At -c "select count(*) from t_res where not ok")
EXTRA_FAIL=0
[ "$RA" = "0" ] && echo "PASS rollback A runs cleanly" || { echo "FAIL rollback A errored"; EXTRA_FAIL=$((EXTRA_FAIL+1)); }
[ "$LEFT" = "0" ] && echo "PASS rollback A leaves no new tables behind" || { echo "FAIL rollback A left $LEFT tables"; EXTRA_FAIL=$((EXTRA_FAIL+1)); }
[ "$BEFORE" = "$AFTER" ] && echo "PASS legacy users table is byte-identical after the full rollback" || { echo "FAIL users table changed"; EXTRA_FAIL=$((EXTRA_FAIL+1)); }
[ "$LEGACY" = "1" ] && echo "PASS the old login still works after the full rollback" || { echo "FAIL old login broken after rollback"; EXTRA_FAIL=$((EXTRA_FAIL+1)); }
echo "RESULT: $PASS passed, $((FAIL+EXTRA_FAIL)) failed"
[ $((FAIL+EXTRA_FAIL)) -eq 0 ]
