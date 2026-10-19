#!/bin/bash
# Tests supabase/migrations/inward_pending.sql (the table, policies and both SQL
# functions) on a THROWAWAY local PostgreSQL cluster - never Supabase, never any
# shared database.
#
#   tests/sql/run-local-pg-tests.sh <scratch-dir> [port]
#
# Isolation: creates its own cluster inside <scratch-dir> (must not exist yet),
# listens on 127.0.0.1 only (no unix socket), refuses a busy port, runs every client
# under `env -i` (no PG*/SUPABASE/.env settings can leak in), loads only local SQL
# files, and deletes the cluster at the end. It never reads .env files.
# Supabase's roles (anon, authenticated, authenticator) and default grants are
# recreated by hand below, so this is a close model of Supabase, not Supabase itself.
set -u
SCRATCH="${1:?usage: $0 <scratch-dir> [port]}"
PORT="${2:-54329}"
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

psqlx() { "${CLEAN[@]}" "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -X -q -At "$@" 2>&1; }
DB() { psqlx -d app "$@"; }
as() { local role="$1"; shift; DB -v ON_ERROR_STOP=1 -c "set role $role; $*"; }   # act as a restricted role, never postgres
PASS=0; FAIL=0
ok() { if [ "$1" = "1" ]; then PASS=$((PASS+1)); echo "PASS $2"; else FAIL=$((FAIL+1)); echo "FAIL $2"; fi; }
has() { case "$1" in *"$2"*) echo 1;; *) echo 0;; esac; }
eq()  { [ "$1" = "$2" ] && echo 1 || echo 0; }

echo "== isolation proof"
ok "$(eq "$(psqlx -d postgres -c "show data_directory")" "$SCRATCH/data")" "server is the scratch cluster (listen=$(psqlx -d postgres -c "show listen_addresses"), foreign servers=$(psqlx -d postgres -c "select count(*) from pg_foreign_server"))"

# ---- Supabase-like baseline + the project's own migrations (the ones the feature depends on) ----
psqlx -d postgres -c "create database app" >/dev/null
DB -c "
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role random_role nologin;
create role authenticator login noinherit; grant anon, authenticated to authenticator;
create schema if not exists extensions;
grant usage on schema public, extensions to anon, authenticated, service_role, random_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;" >/dev/null
load() { local out; out=$(DB -v ON_ERROR_STOP=1 -f "$ROOT/$1" 2>&1 | grep -iE "^psql:.*ERROR|FATAL"); [ -z "$out" ] && echo 1 || { echo "   $1: $out" >&2; echo 0; }; }
LOADED=1
for f in schema.sql $(for m in tires tires_add_sku_qr_code tire_history placement_logs inward_receipts inward_receipts_add_location inward_receipts_add_pallet_shift inward_receipts_add_picker_name plan_numbers outwards warehouses warehouse_stand_counts warehouse_floor_counts remove_stands_and_floors users; do echo migrations/$m.sql; done); do
  [ "$(load supabase/$f)" = "1" ] || LOADED=0
done
ok "$LOADED" "the app's existing migrations load"
# Fingerprints of EVERYTHING that already exists (definitions and data), taken before and after the migration.
schema_fp() { DB -c "select md5(string_agg(x, '|' order by x)) from (
  select 'col:'||table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') x from information_schema.columns where table_schema='public' and table_name <> 'inward_pending'
  union all select 'con:'||conrelid::regclass||':'||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace and conrelid::regclass::text <> 'inward_pending'
  union all select 'idx:'||indexdef from pg_indexes where schemaname='public' and tablename <> 'inward_pending'
  union all select 'trg:'||t.tgrelid::regclass||':'||pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not tgisinternal and c.relnamespace='public'::regnamespace and c.relname <> 'inward_pending'
  union all select 'pol:'||tablename||':'||policyname||':'||cmd||':'||coalesce(qual,'')||coalesce(with_check,'') from pg_policies where schemaname='public' and tablename <> 'inward_pending'
  union all select 'grant:'||table_name||':'||grantee||':'||privilege_type from information_schema.role_table_grants where table_schema='public' and table_name <> 'inward_pending'
  union all select 'rls:'||relname||':'||relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname <> 'inward_pending'
  union all select 'fn:'||proname||':'||md5(prosrc) from pg_proc where pronamespace='public'::regnamespace and proname not in ('putaway_pallet','cancel_pending_pallet')
) q"; }
data_fp() { DB -c "select md5(concat_ws('|',
  (select coalesce(string_agg(t::text,',' order by id),'') from public.tires t),
  (select coalesce(string_agg(t::text,',' order by id),'') from public.tire_history t),
  (select coalesce(string_agg(t::text,',' order by id),'') from public.placement_logs t),
  (select coalesce(string_agg(t::text,',' order by id),'') from public.inward_receipts t),
  (select coalesce(string_agg(t::text,',' order by plan_no, kind),'') from public.plan_numbers t),
  (select coalesce(string_agg(t::text,',' order by key),'') from public.warehouses t),
  (select coalesce(string_agg(t::text,',' order by id),'') from public.users t),
  (select coalesce(string_agg(t::text,',' order by id),'') from public.outwards t),
  (select coalesce(string_agg(t::text,',' order by id),'') from public.tire_skus t)))"; }
# some existing data to prove the migration leaves it alone
DB -c "
insert into public.users (id, username, password, role) values ('99999999-9999-9999-9999-999999999999','existing','password-12345','operator');
insert into public.tires (id, serial_number, model, current_stage, location) values ('old1','SKU-1','Old tire','warehouse','Warehouse 1 - Bin A01-01'), ('old2','SKU-1','Old tire','production','Plant');
insert into public.inward_receipts (id, material, description, warehouse, location, quantity, plan_no, pallet_no, shift, picker_name, received_by) values ('ir-old','SKU-1','Old tire','Warehouse 1','Warehouse 1 - Bin A01-01',1,'OLD-1','PO','1','Someone','x');
insert into public.tire_history (id, tire_id, stage, location, moved_by) values ('h-old','old1','warehouse','Warehouse 1 - Bin A01-01','x');
insert into public.plan_numbers (plan_no, kind) values ('OLD-1','inward');" >/dev/null
SCHEMA_BEFORE=$(schema_fp); DATA_BEFORE=$(data_fp)
ok "$([ ${#SCHEMA_BEFORE} = 32 ] && [ ${#DATA_BEFORE} = 32 ] && echo 1 || echo 0)" "(sanity: the before/after fingerprints are real 32-character hashes, not empty)"
ok "$(load supabase/migrations/inward_pending.sql)" "inward_pending.sql applies"
ok "$(eq "$SCHEMA_BEFORE" "$(schema_fp)")" "NOTHING existing changed: every other table's columns, constraints, indexes, triggers, policies, grants, RLS and every other function are identical before/after the migration"
ok "$(eq "$DATA_BEFORE" "$(data_fp)")" "NO existing data changed: every row of tires, history, logs, receipts, plan numbers, warehouses, users, outwards and SKUs is identical"
ok "$(load supabase/migrations/inward_pending.sql)" "inward_pending.sql can be re-run"
ok "$(eq "$SCHEMA_BEFORE/$DATA_BEFORE" "$(schema_fp)/$(data_fp)")" "...and re-running it also changes nothing existing"
# self-test: the fingerprints really notice a change (otherwise the checks above could pass vacuously)
DB -c "alter table public.tires add column zz_probe int" >/dev/null
ok "$([ "$(schema_fp)" != "$SCHEMA_BEFORE" ] && echo 1 || echo 0)" "(self-test: the schema fingerprint changes when a column is added)"
DB -c "alter table public.tires drop column zz_probe" >/dev/null
DB -c "update public.tires set notes='changed' where id='old1'" >/dev/null
ok "$([ "$(data_fp)" != "$DATA_BEFORE" ] && echo 1 || echo 0)" "(self-test: the data fingerprint changes when a row is edited)"
DB -c "update public.tires set notes='' where id='old1'" >/dev/null
ok "$(eq "$SCHEMA_BEFORE" "$(schema_fp)")" "(self-test: the schema fingerprint returns to its original value once the column is dropped again)"

echo; echo "== prerequisites the migration relies on (also what to check on a real database first)"
ok "$(eq "$(DB -c "select count(*) from information_schema.columns where table_schema='public' and ((table_name='inward_receipts' and column_name in ('location','pallet_no','shift','picker_name')) or (table_name='tires' and column_name='sku_qr_code'))")" 5)" "the 5 required columns exist"
ok "$(eq "$(DB -c "select count(*) from information_schema.columns where table_schema = 'public' and is_nullable = 'NO' and column_default is null and ((table_name = 'tires' and column_name <> 'id') or (table_name = 'tire_history' and column_name not in ('id', 'tire_id')) or (table_name = 'placement_logs' and column_name not in ('id', 'tire_id')) or (table_name = 'inward_receipts' and column_name <> 'id') or (table_name = 'plan_numbers' and column_name not in ('plan_no', 'kind')))")" 0)" "no extra REQUIRED column the function fails to fill"
ok "$(has "$(DB -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'plan_numbers_kind_check'")" "'inward'")" "plan_numbers kind check allows 'inward'"

# ---- test-only failure injection: a trigger that raises/sleeps on demand (exists only in this throwaway DB) ----
DB -c "
create function public.t_fail() returns trigger language plpgsql as \$f\$
begin
  if current_setting('test.sleep', true) = tg_table_name || ':' || tg_op then perform pg_sleep(6); end if;
  if current_setting('test.fail', true) = tg_table_name || ':' || tg_op then raise exception 'injected failure on % %', tg_table_name, tg_op; end if;
  return coalesce(new, old);
end \$f\$;
create trigger t_fail before insert or update on public.tires for each row execute function public.t_fail();
create trigger t_fail before insert or update on public.tire_history for each row execute function public.t_fail();
create trigger t_fail before insert or update on public.placement_logs for each row execute function public.t_fail();
create trigger t_fail before insert or update on public.inward_receipts for each row execute function public.t_fail();
create trigger t_fail before insert or update on public.plan_numbers for each row execute function public.t_fail();
create trigger t_fail before insert or update on public.inward_pending for each row execute function public.t_fail();" >/dev/null

UID1="11111111-1111-1111-1111-111111111111"
reseed() {  # fresh known data; $1 = production-stage tires of M1
  DB -c "
  truncate public.tires, public.tire_history, public.placement_logs, public.inward_receipts, public.plan_numbers, public.inward_pending, public.warehouses, public.users;
  insert into public.users (id, username, password, role) values ('$UID1', 'forklift1', 'password-12345', 'operator');
  insert into public.warehouses (key, label, prefix, column_row_counts) values ('wh1','WH-1','A','{3,3}'), ('wh2','WH-2','B','{3}');
  insert into public.inward_pending (id, material, description, quantity, pallet_no, plan_no, shift, entry_date, picker_name, created_by) values
    ('a','M1','Tire M1',4,'P-a','SHEET-9','2','2026-10-13','Ravi','cage1'), ('b','M2','Tire M2',2,'P-b','SHEET-9','2','2026-10-13','Ravi','cage1'), ('c','M1','Tire M1',3,'P-c','SHEET-9','2','2026-10-13','Ravi','cage1');
  insert into public.tires (id, serial_number, model, current_stage, location) select 'prod'||g, 'M1', 'Tire M1', 'production', 'Plant' from generate_series(1, ${1:-0}) g;
  insert into public.tires (id, serial_number, model, current_stage, location) values ('other','X','Other','warehouse','WH-2 - Bin B01-01'), ('disp','M1','Tire M1','dispatch','Picking');" >/dev/null
}
fp() { DB -c "select md5(concat_ws('|',
    (select coalesce(string_agg(t::text,',' order by id),'') from public.tires t),
    (select coalesce(string_agg(t::text,',' order by id),'') from public.tire_history t),
    (select coalesce(string_agg(t::text,',' order by id),'') from public.placement_logs t),
    (select coalesce(string_agg(t::text,',' order by id),'') from public.inward_receipts t),
    (select coalesce(string_agg(t::text,',' order by plan_no),'') from public.plan_numbers t),
    (select coalesce(string_agg(t::text,',' order by id),'') from public.inward_pending t)))"; }   # every row of every table touched
n() { DB -c "select count(*) from public.$1 ${2:+where $2}"; }
put() { as anon "select public.putaway_pallet('$1','$2','$3','${4:-$UID1}')"; }
failing() { DB -v ON_ERROR_STOP=1 -c "set role anon; set test.fail = '$1'; select public.putaway_pallet('$2','$3','$4','$UID1')" 2>&1; }

echo; echo "== happy path"
reseed 1
UNREL_TIRES=$(DB -c "select md5(string_agg(t::text, ',' order by id)) from public.tires t where id in ('other','disp')")
UNREL_PENDING=$(DB -c "select md5(string_agg(t::text, ',' order by id)) from public.inward_pending t where id in ('b','c')")
R=$(put a wh1 A01-02)
ok "$(has "$R" '"result": "put_away"')" "putaway returns put_away"
ok "$(eq "$(n tires "current_stage='warehouse' and location='WH-1 - Bin A01-02'")" 4)" "4 tires at WH-1 - Bin A01-02 (1 reused production + 3 new)"
ok "$(eq "$(n tires "id='prod1' and current_stage='warehouse'")" 1)" "the production-stage unit was reused, not duplicated"
ok "$(eq "$(n tire_history)/$(n placement_logs)/$(n inward_receipts)" "4/4/1")" "4 history, 4 placement logs, 1 receipt"
ok "$(eq "$(DB -c "select pallet_no||'|'||material||'|'||quantity||'|'||warehouse||'|'||location||'|'||plan_no||'|'||shift||'|'||picker_name||'|'||received_by from inward_receipts")" "P-a|M1|4|WH-1|WH-1 - Bin A01-02|SHEET-9|2|Ravi|forklift1")" "receipt: pallet/SKU/qty/warehouse/location/sheet/shift/driver/username"
ok "$(eq "$(DB -c "select status||'|'||location||'|'||putaway_by from inward_pending where id='a'")" "put_away|WH-1 - Bin A01-02|forklift1")" "pallet marked put_away with where/who"
ok "$(eq "$(n plan_numbers "plan_no='SHEET-9' and kind='inward'")" 1)" "plan number registered"
ok "$(eq "$(n tires "(id='other' and location='WH-2 - Bin B01-01') or (id='disp' and current_stage='dispatch')")" 2)" "other stock and the dispatch tire untouched"
ok "$(eq "$(DB -c "select md5(string_agg(t::text, ',' order by id)) from public.tires t where id in ('other','disp')")" "$UNREL_TIRES")" "unrelated tires are byte-for-byte identical after a putaway"
ok "$(eq "$(DB -c "select md5(string_agg(t::text, ',' order by id)) from public.inward_pending t where id in ('b','c')")" "$UNREL_PENDING")" "other pending pallets are byte-for-byte identical after a putaway"

echo; echo "== repeat / lost response"
F=$(fp); R=$(put a wh2 B01-01)
ok "$(has "$R" '"result": "already_put_away"')" "repeat call reports already_put_away"
ok "$(has "$R" 'WH-1 - Bin A01-02')" "...with the ORIGINAL location, not the new request"
ok "$(eq "$F" "$(fp)")" "repeat call changed nothing (full-table fingerprint identical)"

echo; echo "== rollback at each write (error injected inside the function's own statements)"
for spec in "tires:UPDATE" "tires:INSERT" "tire_history:INSERT" "placement_logs:INSERT" "inward_receipts:INSERT" "plan_numbers:INSERT" "inward_pending:UPDATE"; do
  reseed 1; B=$(fp); OUT=$(failing "$spec" a wh1 A01-01)
  ok "$(has "$OUT" 'injected failure')" "[$spec] the write fails with the injected error"
  ok "$(eq "$B" "$(fp)")" "[$spec] ROLLED BACK: every table identical to before (no partial stock/records)"
  ok "$(eq "$(n inward_pending "id='a' and status='pending'")/$(n tires "id='prod1' and current_stage='production'")" "1/1")" "[$spec] pallet still pending, reused production tire not moved"
  R=$(put a wh1 A01-01)
  ok "$(eq "$(has "$R" put_away)/$(n tires "location='WH-1 - Bin A01-01'")/$(n inward_receipts)/$(n tire_history)" "1/4/1/4")" "[$spec] clean retry succeeds: exactly 4 tires, 1 receipt, 4 history (no duplicates)"
done

echo; echo "== interrupted mid-transaction (cancelled / killed backend)"
for how in cancel terminate; do
  reseed 1; B=$(fp)
  ( DB -c "set application_name='victim'; set role anon; set test.sleep='tire_history:INSERT'; select public.putaway_pallet('a','wh1','A01-01','$UID1')" > "$SCRATCH/victim.out" 2>&1 ) &
  VP=$!; sleep 1.5; KR=$(DB -c "select pg_${how}_backend(pid) from pg_stat_activity where application_name='victim'"); wait $VP
  ok "$(has "$KR" t)" "[$how] in-flight putaway was interrupted"
  ok "$(eq "$B" "$(fp)")" "[$how] ROLLED BACK: nothing left behind"
  R=$(put a wh1 A01-01)
  ok "$(eq "$(has "$R" put_away)/$(n tires "location='WH-1 - Bin A01-01'")/$(n inward_receipts)" "1/4/1")" "[$how] retry succeeds with exactly 4 tires and 1 receipt"
done

echo; echo "== concurrency"
reseed 1
( DB -c "set role anon; begin; select public.putaway_pallet('a','wh1','A01-01','$UID1'); select pg_sleep(3); commit" > "$SCRATCH/s1.out" 2>&1 ) & S1=$!
sleep 1; T0=$(date +%s); R2=$(put a wh2 B01-01); T1=$(date +%s); wait $S1
ok "$(has "$R2" already_put_away)" "a second request waits for the first, then sees already_put_away"
ok "$([ $((T1-T0)) -ge 1 ] && echo 1 || echo 0)" "...it really blocked on the pallet lock (waited $((T1-T0))s)"
ok "$(eq "$(n tires "location='WH-1 - Bin A01-01'")/$(n inward_receipts)" "4/1")" "...stock only at the first bin (4), one receipt"
reseed 1; BINS=(A01-01 A02-02 A01-02 A02-01 A01-03 A02-03 A02-02 A01-01)
for i in 1 2 3 4 5 6 7 8; do ( put a wh1 "${BINS[$((i-1))]}" > "$SCRATCH/p$i.out" ) & done; wait
WON=0; DONE=0; for i in 1 2 3 4 5 6 7 8; do o=$(cat "$SCRATCH/p$i.out"); [ "$(has "$o" '"put_away"')" = 1 ] && WON=$((WON+1)); [ "$(has "$o" already_put_away)" = 1 ] && DONE=$((DONE+1)); done
ok "$(eq "$WON/$DONE" "1/7")" "8 simultaneous requests: exactly 1 performs the putaway, 7 see already_put_away"
ok "$(eq "$(n tires "current_stage='warehouse' and id <> 'other'")/$(n inward_receipts)/$(n tire_history)" "4/1/4")" "...stock is 4 (not 32), 1 receipt, 4 history"
reseed 4; for p in a c; do ( put $p wh1 A01-01 > "$SCRATCH/q$p.out" ) & done; wait
ok "$(eq "$(n tires "current_stage='warehouse' and serial_number='M1'")/$(n tires "current_stage='production'")" "7/0")" "2 different pallets of the same SKU at once: 7 tires (4 production reused, 3 new)"
ok "$(eq "$(DB -c "select count(*) from (select tire_id from placement_logs group by 1 having count(*)>1) x")" 0)" "...no tire placed twice"
OUTCOMES=""
for round in 1 2 3 4 5 6 7 8; do
  reseed 0
  if [ $((round % 2)) = 0 ]; then D1=0; D2=0.0$round; else D1=0.0$round; D2=0; fi
  ( sleep $D1; as anon "select public.cancel_pending_pallet('a','$UID1')" > "$SCRATCH/cx.out" 2>&1 ) & ( sleep $D2; put a wh1 A01-01 > "$SCRATCH/px.out" 2>&1 ) & wait
  ST=$(DB -c "select status from inward_pending where id='a'"); TS=$(n tires "location='WH-1 - Bin A01-01'")
  if [ "$ST" = put_away ]; then C=$(eq "$TS/$(n inward_receipts)" "4/1"); else C=$(eq "$ST/$TS/$(n inward_receipts)" "cancelled/0/0"); fi
  ok "$C" "cancel vs putaway race #$round -> consistent end state ($ST, $TS tires)"; OUTCOMES="$OUTCOMES $ST"
done
echo "   race outcomes:$OUTCOMES"

echo; echo "== invalid bins / warehouse / pallet / users"
reseed 1; B=$(fp)
for t in "wh1|B01-01|bin from another warehouse" "wh1|A09-01|row outside layout" "wh1|A01-09|position outside layout" "wh1|A1-1|non-canonical code" "wh1||empty bin" "nope|A01-01|unknown warehouse" "wh1|A01-01-X3|old stand/floor suffix" "wh1|A00-01|row zero" "wh1|A01-00|position zero" "wh1|a01-01|wrong case" "wh1|A01-01; drop table tires|injection attempt" "wh2|A01-01|WH-1 bin sent for WH-2"; do
  IFS='|' read -r w bn why <<<"$t"; OUT=$(put a "$w" "$bn"); ok "$(has "$OUT" ERROR)" "rejected: $why"
done
OUT=$(put nope wh1 A01-01); ok "$(has "$OUT" 'pallet not found')" "unknown pallet id rejected"
OUT=$(as anon "select public.putaway_pallet(null,'wh1','A01-01','$UID1')"); ok "$(has "$OUT" ERROR)" "null pallet id rejected"
OUT=$(as anon "select public.putaway_pallet('a','wh1',null,'$UID1')"); ok "$(has "$OUT" ERROR)" "null bin rejected"
for u in "22222222-2222-2222-2222-222222222222" "00000000-0000-0000-0000-000000000000"; do OUT=$(put a wh1 A01-01 "$u"); ok "$(has "$OUT" 'unknown user')" "unknown user id $u rejected"; done
OUT=$(as anon "select public.putaway_pallet('a','wh1','A01-01',null)"); ok "$(has "$OUT" 'unknown user')" "null user rejected"
OUT=$(as anon "select public.cancel_pending_pallet('a','22222222-2222-2222-2222-222222222222')"); ok "$(has "$OUT" 'unknown user')" "cancel with unknown user rejected"
ok "$(eq "$B" "$(fp)")" "none of the invalid calls changed anything"

echo; echo "== cancellation"
reseed 1; TIRES=$(n tires)
R=$(as anon "select public.cancel_pending_pallet('a','$UID1')"); ok "$(has "$R" '"cancelled"')" "cancel a pending pallet"
ok "$(eq "$(n tires)/$(n tire_history)/$(n inward_receipts)" "$TIRES/0/0")" "...no stock or records touched"
R=$(as anon "select public.cancel_pending_pallet('a','$UID1')"); ok "$(has "$R" already_cancelled)" "cancel twice is harmless"
R=$(put a wh1 A01-01); ok "$(has "$R" 'cancelled and cannot be put away')" "a cancelled pallet can't be put away"
put b wh1 A01-01 >/dev/null; F=$(fp)
R=$(as anon "select public.cancel_pending_pallet('b','$UID1')"); ok "$(has "$R" 'put_away and cannot be cancelled')" "a put-away pallet can't be cancelled"
ok "$(eq "$F" "$(fp)")" "...stock unchanged"

echo; echo "== case selection (case_selection.sql)"
reseed 1
ok "$(load supabase/migrations/case_selection.sql)" "case_selection.sql applies"
ok "$(load supabase/migrations/case_selection.sql)" "...and can be re-run"
ok "$(eq "$(DB -c "select count(*) from information_schema.columns where table_schema='public' and column_name='case_no' and is_nullable='YES' and table_name in ('tire_skus','inward_pending','inward_receipts')")" 3)" "case_no added (nullable) to tire_skus, inward_pending, inward_receipts"
ok "$(eq "$(n inward_pending "case_no is not null")" 0)" "existing pending pallets keep case_no NULL (no guessed case)"
R=$(DB -c "update public.inward_pending set case_no = 3 where id='a'" 2>&1); ok "$(has "$R" 'check constraint')" "only case 1 or 2 is accepted"
as anon "insert into public.inward_pending (id, material, description, quantity, pallet_no, plan_no, shift, case_no) values ('c1','M1','Tire M1',2,'P-c1','SHEET-9','1',1), ('c2','M2','Tire M2',2,'P-c2','SHEET-9','1',2)" >/dev/null
ok "$(eq "$(n inward_pending "case_no = 1")/$(n inward_pending "case_no = 2")" "1/1")" "the cage insert (anon, pending only) stores the case"
ok "$(eq "$(n inward_pending "status='pending' and (case_no = 1 or case_no is null)")" 4)" "Case 1 view = Case 1 pallets + legacy (no-case) pallets, never Case 2"
ok "$(eq "$(n inward_pending "status='pending' and (case_no = 2 or case_no is null)")" 4)" "Case 2 view = Case 2 pallets + legacy pallets, never Case 1"
put c1 wh1 A01-01 >/dev/null
ok "$(eq "$(DB -c "select case_no from inward_receipts where id='ir-c1'")" 1)" "a putaway receipt copies the pallet's case (putaway_pallet itself unchanged)"
put a wh1 A01-02 >/dev/null
ok "$(eq "$(DB -c "select coalesce(case_no::text,'null') from inward_receipts where id='ir-a'")" null)" "a legacy pallet's receipt stays NULL"
as anon "insert into public.inward_receipts (id, material, description, warehouse, location, quantity, plan_no, pallet_no, shift, picker_name, received_by, case_no) values ('ir-direct','M2','Tire M2','WH-1','WH-1 - Bin A01-03',1,'S','P','1','x','y',2)" >/dev/null
ok "$(eq "$(DB -c "select case_no from inward_receipts where id='ir-direct'")" 2)" "a direct inward receipt keeps the case it was given"

echo; echo "== table permissions and the cage insert (anon, authenticated, and PostgREST-style authenticator)"
for who in anon authenticated authenticator; do
  reseed 0
  if [ "$who" = authenticator ]; then RUN() { psqlx -d app -U authenticator -c "set role anon; $1" 2>&1; }; else RUN() { as $who "$1"; }; fi
  INS="insert into public.inward_pending (id,material,description,quantity,pallet_no,plan_no,shift,entry_date,picker_name,status,created_by) values"
  R=$(RUN "$INS ('pp-x-M1','M1','Tire M1',5,'P-x','S-1','1','2026-10-13','Ravi','pending','cage1') on conflict (id) do nothing")
  ok "$(eq "$(n inward_pending "id='pp-x-M1' and quantity=5 and entry_date='2026-10-13'")" 1)" "[$who] cage insert (as the app sends it) saves the pallet with its Date"
  R=$(RUN "$INS ('pp-x-M1','M1','Tire M1',99,'P-x','S-1','1','2026-10-13','Ravi','pending','cage1') on conflict (id) do nothing")
  ok "$(eq "$(has "$R" ERROR)/$(n inward_pending "id like 'pp-x-%'")/$(n inward_pending "id='pp-x-M1' and quantity=5")" "0/1/1")" "[$who] the same submission sent again is silently ignored (1 row, original untouched)"
  R=$(RUN "$INS ('forged','M1','x',1,'P','S','1','2026-10-13','','put_away','x')"); ok "$(has "$R" 'row-level security')" "[$who] a forged 'put_away' row is refused"
  R=$(RUN "insert into public.inward_pending (id,material,quantity,pallet_no,plan_no,shift,putaway_by) values ('f2','M1',1,'P','S','1','someone')"); ok "$(has "$R" 'row-level security')" "[$who] a row with putaway fields pre-filled is refused"
  R=$(RUN "insert into public.inward_pending (id,material,quantity,pallet_no,plan_no,shift) values ('f3','M1',0,'P','S','1')"); ok "$(has "$R" 'check constraint')" "[$who] quantity 0 rejected"
  R=$(RUN "insert into public.inward_pending (id,material,quantity,pallet_no,plan_no,shift) values ('f4','M1',1,'  ','S','1')"); ok "$(has "$R" 'check constraint')" "[$who] blank pallet no rejected"
  R=$(RUN "insert into public.inward_pending (id,material,quantity,pallet_no,plan_no,shift,status) values ('f5','M1',1,'P','S','1','in_progress')"); ok "$(has "$R" ERROR)" "[$who] invalid status rejected"
  R=$(RUN "insert into public.inward_pending (id,material,quantity,pallet_no,plan_no,shift) values ('pp-x-M1','M1',1,'P-x','S-1','1') on conflict (id) do update set quantity = 1"); ok "$(has "$R" 'permission denied')" "[$who] ON CONFLICT DO UPDATE (overwriting a pallet) is denied"
  R=$(RUN "update public.inward_pending set quantity = 999 where id='a'"); ok "$(has "$R" 'permission denied')" "[$who] direct UPDATE denied"
  R=$(RUN "update public.inward_pending set status='put_away' where id='a'"); ok "$(has "$R" 'permission denied')" "[$who] cannot mark a pallet put_away directly"
  R=$(RUN "delete from public.inward_pending where id='a'"); ok "$(has "$R" 'permission denied')" "[$who] direct DELETE denied"
  R=$(RUN "truncate public.inward_pending"); ok "$(has "$R" 'permission denied')" "[$who] TRUNCATE denied"
  R=$(RUN "select count(*) from public.users"); ok "$(eq "$R" 0)" "[$who] sees no rows of the users table (passwords hidden)"
  ok "$(eq "$(n inward_pending "id='a' and quantity=4 and status='pending'")" 1)" "[$who] pallet 'a' unchanged after all of the above"
done
R=$(as random_role "select public.putaway_pallet('a','wh1','A01-01','$UID1')"); ok "$(has "$R" 'permission denied')" "a role with no grant cannot execute putaway_pallet (PUBLIC execute revoked)"
R=$(as random_role "select public.cancel_pending_pallet('a','$UID1')"); ok "$(has "$R" 'permission denied')" "a role with no grant cannot execute cancel_pending_pallet"

echo; echo "== function security"
INFO=$(DB -c "select string_agg(proname||':definer='||prosecdef||':owner='||pg_get_userbyid(proowner)||':cfg='||coalesce(array_to_string(proconfig,';'),'none'), ' ' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('putaway_pallet','cancel_pending_pallet')")
echo "   $INFO"
ok "$(eq "$(has "$INFO" 'putaway_pallet:definer=true')$(has "$INFO" 'cancel_pending_pallet:definer=true')" 11)" "both functions are SECURITY DEFINER"
ok "$(has "$INFO" "cfg=search_path=\"\"")" "both pin an EMPTY search_path (everything schema-qualified)"
ACL=$(DB -c "select string_agg(proname||'='||coalesce(proacl::text,'NULL(=PUBLIC)'), ' ') from pg_proc where pronamespace='public'::regnamespace and proname in ('putaway_pallet','cancel_pending_pallet')")
ok "$(eq "$(has "$ACL" '{=X')$(has "$ACL" ',=X')" "00")" "no EXECUTE for PUBLIC"
reseed 0
R=$(as anon "create temp table users (id uuid, username text); insert into users values ('33333333-3333-3333-3333-333333333333','attacker'); select public.putaway_pallet('a','wh1','A01-01','33333333-3333-3333-3333-333333333333')"); ok "$(has "$R" 'unknown user')" "a temp-table copy of 'users' does not fool the function"
R=$(as anon "set search_path = pg_temp, public; create temp table warehouses (key text, label text, prefix text, column_row_counts int[]); insert into warehouses values ('evil','EVIL','Z','{9}'); select public.putaway_pallet('a','evil','Z01-01','$UID1')"); ok "$(has "$R" 'warehouse not found')" "a temp-table copy of 'warehouses' + hostile search_path is ignored"
R=$(as anon "create function public.evil() returns int language sql as 'select 1'"); ok "$(has "$R" 'permission denied')" "anon cannot create objects in schema public"
R=$(as anon "alter function public.putaway_pallet(text,text,text,uuid) set search_path = pg_temp"); ok "$(has "$R" 'must be owner')" "anon cannot alter the function"
R=$(psqlx -d app -U authenticator -c "set role anon; set role postgres" 2>&1); ok "$(has "$R" 'permission denied')" "connecting like PostgREST: cannot switch to postgres"
R=$(as anon "select public.putaway_pallet('a'' or ''1''=''1','wh1','A01-01','$UID1')"); ok "$(has "$R" 'pallet not found')" "an injection-style pallet id is just 'not found'"
BODIES=$(awk '/^as \$\$/{f=1;next} /^\$\$;/{f=0} f' "$ROOT/supabase/migrations/inward_pending.sql")
ok "$(eq "$(echo "$BODIES" | grep -v '^ *--' | grep -ciE '\bexecute\b|format\(' | tr -d ' ')" 0)" "function bodies contain no dynamic SQL (no EXECUTE / format())"
ok "$([ "$(echo "$BODIES" | wc -l | tr -d ' ')" -gt 50 ] && echo 1 || echo 0)" "(sanity: the check really extracted the function bodies)"

echo; echo "== informational: existing exposure this feature does NOT change"
reseed 0
R=$(as anon "update public.tires set notes='written-by-anon' where id='other'; select notes from public.tires where id='other'")
echo "   INFO anon can still write the existing stock tables directly (their open policies are unchanged): $(has "$R" written-by-anon | sed 's/1/YES/;s/0/no/')"

echo; echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
