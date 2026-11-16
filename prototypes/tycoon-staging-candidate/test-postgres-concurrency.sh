#!/usr/bin/env bash
# Synthetic-only race tests: a fresh local container, no app or production access.
set -euo pipefail
lab_root=$(cd "$(dirname "$0")" && pwd)
lab_tmp=$(mktemp -d "${TMPDIR:-/tmp}/hsc-tycoon-pg.XXXXXXXX")
lab_container=''
local_docker() { env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"; }
cleanup() { if [[ -n "$lab_container" ]]; then local_docker rm -f "$lab_container" >/dev/null 2>&1 || true; fi; rm -rf -- "$lab_tmp"; }
trap cleanup EXIT
local_docker info >/dev/null
lab_container=$(local_docker run --pull=never --rm -d --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17)
for ((i=0;i<100;i++)); do
  if local_docker logs "$lab_container" 2>&1 | grep -q 'PostgreSQL init process complete' && local_docker exec "$lab_container" pg_isready -q -U postgres; then break; fi
  if ((i==99)); then echo 'Isolated Postgres did not start.' >&2; exit 1; fi
  sleep 0.2
done
sql() { local_docker exec -i "$lab_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
sql < "$lab_root/test/auth-fixture.sql"
sql < "$lab_root/schema.sql"
seed() {
  sql <<'SQL'
truncate ty_private.ledger,ty_private.completions,ty_private.wallets,ty_private.purchases,ty_private.answers,ty_private.session_questions,ty_private.sessions,ty_private.question_bank,ty_private.releases;
insert into ty_private.releases values ('chemistry','chemistry',12,'test-2025','draft');
insert into ty_private.question_bank values ('q1','chemistry','Q1?',array['A','B'],0,'E1'),('q2','chemistry','Q2?',array['A','B'],1,'E2'),('q3','chemistry','Q3?',array['A','B'],0,'E3');
update ty_private.releases set status='published' where id='chemistry';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select * from ty_api.start('chemistry','request-1');
SQL
  lab_run=$(sql -c 'select id from ty_private.sessions')
  [[ "$lab_run" =~ ^[a-f0-9-]{36}$ ]] || { echo 'Invalid synthetic run id' >&2; exit 1; }
}
prepare_cash() {
  sql -v run="$lab_run" <<'SQL'
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select * from ty_api.answer(:'run',1,0);
select * from ty_api.answer(:'run',2,1);
SQL
}
race() {
  local action=$1 ending=$2 first_pid second_pid blocked=0 actual
  seed
  if [[ "$action" != answer ]]; then prepare_cash; fi
  case "$action" in
    answer) first_query="select * from ty_api.answer(:'run',1,0);"; second_query="select * from ty_api.answer(:'run',1,1);";;
    buy) first_query="select * from ty_api.buy(:'run','upgrade-1','funding');"; second_query="$first_query";;
    finish) first_query="select * from ty_api.finish(:'run');"; second_query="$first_query";;
    *) exit 1;;
  esac
  cat > "$lab_tmp/first.sql" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
$first_query
select 'FIRST_LOCK_HELD';
select pg_sleep(8);
$ending;
SQL
  sql -v run="$lab_run" < "$lab_tmp/first.sql" > "$lab_tmp/first.log" 2>&1 & first_pid=$!
  for ((i=0;i<100;i++)); do
    if grep -q FIRST_LOCK_HELD "$lab_tmp/first.log"; then break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then cat "$lab_tmp/first.log" >&2; wait "$first_pid" || true; exit 1; fi
    if ((i==99)); then echo 'Timed out waiting for first transaction.' >&2; exit 1; fi
    sleep 0.1
  done
  cat > "$lab_tmp/second.sql" <<SQL
begin;
set local application_name='hsc_tycoon_race_second';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
$second_query
commit;
SQL
  sql -v run="$lab_run" < "$lab_tmp/second.sql" > "$lab_tmp/second.log" 2>&1 & second_pid=$!
  for ((i=0;i<50;i++)); do
    blocked=$(sql -c "select count(*) from pg_stat_activity where application_name='hsc_tycoon_race_second' and wait_event_type='Lock'")
    if [[ "$blocked" == '1' ]]; then break; fi
    if ! kill -0 "$second_pid" 2>/dev/null; then cat "$lab_tmp/second.log" >&2; echo 'Second session failed to wait for the first.' >&2; exit 1; fi
    sleep 0.1
  done
  [[ "$blocked" == '1' ]] || { echo 'Did not observe a database lock wait.' >&2; exit 1; }
  wait "$first_pid" || { cat "$lab_tmp/first.log" >&2; exit 1; }
  wait "$second_pid" || { cat "$lab_tmp/second.log" >&2; exit 1; }
  case "$action" in
    answer) actual=$(sql -c "select cash::text||':'||correct_count::text||':'||next_question::text||':'||(select count(*) from ty_private.answers)::text from ty_private.sessions"); expected='5:1:2:1'; expected_receipt='1|0|t|0|5|5|E1';;
    buy) actual=$(sql -c "select cash::text||':'||funding_level::text||':'||(select count(*) from ty_private.purchases)::text from ty_private.sessions"); expected='0:1:1'; expected_receipt='funding|10|1|0';;
    finish) actual=$(sql -c "select (select count(*) from ty_private.completions)::text||':'||(select count(*) from ty_private.ledger)::text||':'||(select balance from ty_private.wallets where owner='00000000-0000-4000-8000-000000000001')::text"); expected='1:1:9'; expected_receipt='2|10|10|9';;
  esac
  [[ "$actual" == "$expected" ]] || { echo "$action/$ending expected $expected, got $actual" >&2; exit 1; }
  grep -Fxq "$expected_receipt" "$lab_tmp/second.log" || { echo "Second $action response did not match the original receipt." >&2; cat "$lab_tmp/second.log" >&2; exit 1; }
  echo "PASS: simultaneous $action, first $ending, result $actual."
}
race answer commit
race buy commit
race finish commit
race finish rollback
