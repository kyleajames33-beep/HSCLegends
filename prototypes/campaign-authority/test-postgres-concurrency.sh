#!/usr/bin/env bash
# Disposable synthetic tests only: never connect to app/staging/production DBs.
set -euo pipefail
lab_root=$(cd "$(dirname "$0")" && pwd)
lab_tmp=$(mktemp -d "${TMPDIR:-/tmp}/hsc-campaign-pg.XXXXXXXX")
lab_container=''
local_docker() { env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"; }
cleanup() { if [[ -n "$lab_container" ]]; then local_docker rm -f "$lab_container" >/dev/null 2>&1 || true; fi; rm -rf -- "$lab_tmp"; }
trap cleanup EXIT
local_docker info >/dev/null
lab_container=$(local_docker run --pull=never --rm -d --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17)
for ((i=0;i<100;i++)); do
  if local_docker logs "$lab_container" 2>&1 | grep -q 'PostgreSQL init process complete' && local_docker exec "$lab_container" pg_isready -q -U postgres; then break; fi
  if ((i==99)); then echo 'Isolated PostgreSQL did not start.' >&2; exit 1; fi
  sleep 0.2
done
sql() { local_docker exec -i "$lab_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
sql < "$lab_root/schema.sql"
lab_run='00000000-0000-4000-8000-000000000001'
req1='00000000-0000-4000-8000-000000000011'
req2='00000000-0000-4000-8000-000000000012'
req3='00000000-0000-4000-8000-000000000013'
seed() {
  sql -v run="$lab_run" <<'SQL' >/dev/null
truncate campaign_lab.actions,campaign_lab.awards,campaign_lab.wallets,campaign_lab.runs cascade;
select campaign_lab.start_run('alice',:'run');
SQL
}
prepare_action() {
  sql -v run="$lab_run" -v req="$req1" <<'SQL' >/dev/null
select campaign_lab.act('alice',:'run',:'req',0,'answer',0);
SQL
}
prepare_win() {
  prepare_action
  sql -v run="$lab_run" -v req2="$req2" -v req3="$req3" <<'SQL' >/dev/null
select campaign_lab.act('alice',:'run',:'req2',1,'hit',null);
select campaign_lab.act('alice',:'run',:'req3',2,'hit',null);
SQL
}
race() {
  local action=$1 ending=$2 first_pid second_pid blocked=0 expected actual second_status=0
  seed
  case "$action" in
    answer) first_query="select campaign_lab.act('alice',:'run',:'req1',0,'answer',0);"; second_query="select campaign_lab.act('alice',:'run',:'req2',0,'answer',1);";;
    hit) prepare_action; first_query="select campaign_lab.act('alice',:'run',:'req2',1,'hit',null);"; second_query="select campaign_lab.act('alice',:'run',:'req3',1,'hit',null);";;
    claim) prepare_win; first_query="select campaign_lab.claim('alice',:'run');"; second_query="$first_query";;
    *) exit 1;;
  esac
  cat > "$lab_tmp/first.sql" <<SQL
begin;
set local role campaign_lab_gateway;
$first_query
select 'FIRST_LOCK_HELD';
select pg_sleep(4);
$ending;
SQL
  sql -v run="$lab_run" -v req1="$req1" -v req2="$req2" -v req3="$req3" < "$lab_tmp/first.sql" > "$lab_tmp/first.log" 2>&1 & first_pid=$!
  for ((i=0;i<100;i++)); do
    if grep -q FIRST_LOCK_HELD "$lab_tmp/first.log"; then break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then cat "$lab_tmp/first.log" >&2; wait "$first_pid" || true; exit 1; fi
    if ((i==99)); then echo 'Timed out waiting for first transaction.' >&2; exit 1; fi
    sleep 0.1
  done
  cat > "$lab_tmp/second.sql" <<SQL
begin;
set local application_name='hsc_campaign_race_second';
set local role campaign_lab_gateway;
$second_query
commit;
SQL
  sql -v run="$lab_run" -v req1="$req1" -v req2="$req2" -v req3="$req3" < "$lab_tmp/second.sql" > "$lab_tmp/second.log" 2>&1 & second_pid=$!
  for ((i=0;i<50;i++)); do
    blocked=$(sql -c "select count(*) from pg_stat_activity where application_name='hsc_campaign_race_second' and wait_event_type='Lock'")
    if [[ "$blocked" == '1' ]]; then break; fi
    if ! kill -0 "$second_pid" 2>/dev/null; then cat "$lab_tmp/second.log" >&2; echo 'Second session failed before lock wait.' >&2; exit 1; fi
    sleep 0.1
  done
  [[ "$blocked" == '1' ]] || { echo 'Did not observe the second session waiting on a lock.' >&2; exit 1; }
  wait "$first_pid" || { cat "$lab_tmp/first.log" >&2; exit 1; }
  wait "$second_pid" || second_status=$?
  if [[ "$action" != claim && "$ending" == commit ]]; then
    [[ "$second_status" != 0 ]] && grep -q 'stale version' "$lab_tmp/second.log" || { cat "$lab_tmp/second.log" >&2; echo 'Expected stale action rejection.' >&2; exit 1; }
  elif [[ "$second_status" != 0 ]]; then cat "$lab_tmp/second.log" >&2; exit 1; fi
  case "$action/$ending" in
    answer/commit) actual=$(sql -c "select version||':'||energy||':'||player_hp||':'||(select count(*) from campaign_lab.actions) from campaign_lab.runs"); expected='1:2:100:1';;
    answer/rollback) actual=$(sql -c "select version||':'||energy||':'||player_hp||':'||(select count(*) from campaign_lab.actions) from campaign_lab.runs"); expected='1:0:86:1';;
    hit/*) actual=$(sql -c "select version||':'||energy||':'||boss_hp||':'||(select count(*) from campaign_lab.actions) from campaign_lab.runs"); expected='2:1:14:2';;
    claim/*) actual=$(sql -c "select (select count(*) from campaign_lab.awards)||':'||(select balance from campaign_lab.wallets where owner='alice')||':'||(select claimed from campaign_lab.runs)"); expected='1:25:true';;
  esac
  [[ "$actual" == "$expected" ]] || { echo "$action/$ending expected $expected, got $actual" >&2; exit 1; }
  echo "PASS: two PostgreSQL connections, $action, first $ending, result $actual."
}
race answer commit
race answer rollback
race hit commit
race hit rollback
race claim commit
race claim rollback
