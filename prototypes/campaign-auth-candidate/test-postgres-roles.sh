#!/usr/bin/env bash
# Disposable PostgreSQL, synthetic auth.uid() and synthetic claims ONLY.
set -euo pipefail
lab_root=$(cd "$(dirname "$0")" && pwd)
lab_tmp=$(mktemp -d "${TMPDIR:-/tmp}/hsc-campaign-auth-pg.XXXXXXXX")
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
alice='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
bob='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
expect_denied() {
  local description=$1 expected=$2 query=$3
  if sql -c "$query" >"$lab_tmp/denied.log" 2>&1; then echo "Unexpected success: $description" >&2; exit 1; fi
  grep -q "$expected" "$lab_tmp/denied.log" || { cat "$lab_tmp/denied.log" >&2; echo "Unexpected error for $description" >&2; exit 1; }
  echo "PASS: $description rejected."
}
seed() {
  sql -v run="$lab_run" -v alice="$alice" <<'SQL' >/dev/null
truncate campaign_lab.actions,campaign_lab.awards,campaign_lab.wallets,campaign_lab.run_questions,campaign_lab.runs cascade;
set role authenticated;
select set_config('request.jwt.claim.sub',:'alice',false);
select campaign_api.start_run(:'run',1);
reset role;
SQL
}
seed
expect_denied 'anonymous API use' 'permission denied' "set role anon; select campaign_api.get_state('$lab_run');"
expect_denied 'browser-role private question read' 'permission denied' "set role authenticated; select * from campaign_lab.run_questions;"
expect_denied 'browser-role actor routine' 'permission denied' "set role authenticated; select campaign_lab.get_state('$alice','$lab_run');"
expect_denied 'client-supplied actor overload' 'does not exist' "set role authenticated; select campaign_api.act('$bob'::uuid,'$lab_run'::uuid,'$req1'::uuid,0,'answer',0);"
expect_denied 'different authenticated identity' 'not owner' "set role authenticated; select set_config('request.jwt.claim.sub','$bob',false); select campaign_api.get_state('$lab_run');"
expect_denied 'missing identity' 'authentication required' "set role authenticated; select campaign_api.get_state('$lab_run');"
expect_denied 'published content mutation' 'published content immutable' "update campaign_lab.question_bank set correct_index=1 where qid=1;"
# Show the mocked GUC is forgeable under direct SQL: this is not a secure channel.
spoof=$(sql -c "set role authenticated; select set_config('request.jwt.claim.sub','$alice',false); select campaign_api.get_state('$lab_run')->>'run';" | tail -1)
[[ "$spoof" == "$lab_run" ]] || { echo 'Expected synthetic direct-SQL claim forgery demonstration.' >&2; exit 1; }
echo 'PASS: direct SQL can forge the mock claim (explicit trust-boundary limitation).'
prepare_action() {
  sql -v run="$lab_run" -v req="$req1" -v alice="$alice" <<'SQL' >/dev/null
set role authenticated;
select set_config('request.jwt.claim.sub',:'alice',false);
select campaign_api.act(:'run',:'req',0,'answer',0);
SQL
}
prepare_win() {
  prepare_action
  sql -v run="$lab_run" -v req2="$req2" -v req3="$req3" -v alice="$alice" <<'SQL' >/dev/null
set role authenticated;
select set_config('request.jwt.claim.sub',:'alice',false);
select campaign_api.act(:'run',:'req2',1,'hit',null);
select campaign_api.act(:'run',:'req3',2,'hit',null);
SQL
}
race() {
  local action=$1 ending=$2 first_pid second_pid blocked=0 second_status=0 actual expected
  seed
  case "$action" in
    answer) first_query="select campaign_api.act(:'run',:'req1',0,'answer',0);"; second_query="select campaign_api.act(:'run',:'req2',0,'answer',1);";;
    claim) prepare_win; first_query="select campaign_api.claim(:'run');"; second_query="$first_query";;
    *) exit 1;;
  esac
  cat > "$lab_tmp/first.sql" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'alice',true);
$first_query
select 'FIRST_LOCK_HELD';
select pg_sleep(4);
$ending;
SQL
  sql -v run="$lab_run" -v req1="$req1" -v req2="$req2" -v alice="$alice" < "$lab_tmp/first.sql" > "$lab_tmp/first.log" 2>&1 & first_pid=$!
  for ((i=0;i<100;i++)); do
    if grep -q FIRST_LOCK_HELD "$lab_tmp/first.log"; then break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then cat "$lab_tmp/first.log" >&2; wait "$first_pid" || true; exit 1; fi
    if ((i==99)); then echo 'Timed out waiting for first transaction.' >&2; exit 1; fi
    sleep 0.1
  done
  cat > "$lab_tmp/second.sql" <<SQL
begin;
set local application_name='hsc_campaign_auth_race_second';
set local role authenticated;
select set_config('request.jwt.claim.sub',:'alice',true);
$second_query
commit;
SQL
  sql -v run="$lab_run" -v req1="$req1" -v req2="$req2" -v alice="$alice" < "$lab_tmp/second.sql" > "$lab_tmp/second.log" 2>&1 & second_pid=$!
  for ((i=0;i<50;i++)); do
    blocked=$(sql -c "select count(*) from pg_stat_activity where application_name='hsc_campaign_auth_race_second' and wait_event_type='Lock'")
    if [[ "$blocked" == '1' ]]; then break; fi
    if ! kill -0 "$second_pid" 2>/dev/null; then cat "$lab_tmp/second.log" >&2; echo 'Second session failed before lock wait.' >&2; exit 1; fi
    sleep 0.1
  done
  [[ "$blocked" == '1' ]] || { echo 'Did not observe a PostgreSQL lock wait.' >&2; exit 1; }
  wait "$first_pid" || { cat "$lab_tmp/first.log" >&2; exit 1; }
  wait "$second_pid" || second_status=$?
  if [[ "$action" == answer && "$ending" == commit ]]; then
    [[ "$second_status" != 0 ]] && grep -q 'stale version' "$lab_tmp/second.log" || { cat "$lab_tmp/second.log" >&2; echo 'Expected stale answer rejection.' >&2; exit 1; }
  elif [[ "$second_status" != 0 ]]; then cat "$lab_tmp/second.log" >&2; exit 1; fi
  case "$action/$ending" in
    answer/commit) actual=$(sql -c "select version||':'||energy||':'||player_hp||':'||(select count(*) from campaign_lab.actions) from campaign_lab.runs"); expected='1:2:100:1';;
    answer/rollback) actual=$(sql -c "select version||':'||energy||':'||player_hp||':'||(select count(*) from campaign_lab.actions) from campaign_lab.runs"); expected='1:0:86:1';;
    claim/*) actual=$(sql -c "select (select count(*) from campaign_lab.awards)||':'||(select balance from campaign_lab.wallets where owner='$alice')||':'||(select claimed from campaign_lab.runs)"); expected='1:25:true';;
  esac
  [[ "$actual" == "$expected" ]] || { echo "$action/$ending expected $expected, got $actual" >&2; exit 1; }
  echo "PASS: two authenticated PostgreSQL sessions, $action, first $ending, result $actual."
}
race answer commit
race answer rollback
race claim commit
race claim rollback
