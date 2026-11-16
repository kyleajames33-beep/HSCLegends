#!/usr/bin/env bash
# Synthetic-only SQL race/rollback check in an isolated disposable container.
# Requires an already-pulled postgres:17 image and local Docker daemon.
set -euo pipefail
lab_root=$(cd "$(dirname "$0")" && pwd)
lab_tmp=$(mktemp -d "${TMPDIR:-/tmp}/hsc-gamble-pg.XXXXXXXX")
lab_container=''
local_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"
}
cleanup() {
  if [[ -n "$lab_container" ]]; then local_docker rm -f "$lab_container" >/dev/null 2>&1 || true; fi
  rm -rf -- "$lab_tmp"
}
trap cleanup EXIT
local_docker info >/dev/null
# --network none, no bind mounts or published ports; only this container is deleted.
lab_container=$(local_docker run --pull=never --rm -d --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17)
for ((i=0;i<100;i++)); do
  # The image starts a temporary initdb server and then restarts it. Wait for
  # initdb to finish as well as readiness to avoid racing that shutdown.
  if local_docker logs "$lab_container" 2>&1 | grep -q 'PostgreSQL init process complete' && local_docker exec "$lab_container" pg_isready -q -U postgres; then break; fi
  if ((i==99)); then echo 'Isolated Postgres did not start.' >&2; exit 1; fi
  sleep 0.2
done
sql() { local_docker exec -i "$lab_container" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
sql < "$lab_root/schema.sql"
seed() {
  sql <<'SQL'
truncate game_private.results,game_private.decisions,game_private.answers,game_private.pairs,game_private.questions,game_private.players,game_private.rooms;
insert into game_private.rooms values ('room',1,'decide',now()+interval '1 hour');
insert into game_private.players(id,room_id,subject) values ('a','room','alice'),('b','room','bob');
insert into game_private.questions values ('room',1,'Which?',array['A','B'],1);
insert into game_private.pairs values ('room',1,'a','b');
insert into game_private.answers values ('room',1,'a',1,true,10),('room',1,'b',1,true,10);
insert into game_private.decisions values ('room',1,'a','steal'),('room',1,'b','share');
SQL
}
verify_once() {
  local actual
  actual=$(sql <<'SQL'
select (select count(*) from game_private.results)::text || ':' ||
       (select points from game_private.players where id='a')::text || ':' ||
       (select points from game_private.players where id='b')::text;
SQL
)
  if [[ "$actual" != '1:20:0' ]]; then echo "Incorrect payout/result count: $actual" >&2; exit 1; fi
}
race() {
  local ending=$1 first_pid second_pid
  seed
  cat > "$lab_tmp/first.sql" <<SQL
begin;
set local role lab_player;
select set_config('lab.test_subject','alice',true);
select * from game_api.reveal('room',1,'a');
select 'FIRST_LOCK_HELD';
select pg_sleep(10);
$ending;
SQL
  sql < "$lab_tmp/first.sql" > "$lab_tmp/first.log" 2>&1 & first_pid=$!
  for ((i=0;i<100;i++)); do
    if grep -q FIRST_LOCK_HELD "$lab_tmp/first.log"; then break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then cat "$lab_tmp/first.log" >&2; wait "$first_pid" || true; echo 'First session failed before acquiring the lock.' >&2; exit 1; fi
    if ((i==99)); then echo 'Timed out waiting for first transaction.' >&2; exit 1; fi
    sleep 0.1
  done
  sql > "$lab_tmp/second.log" 2>&1 <<'SQL' & second_pid=$!
begin;
set local application_name='hsc_gamble_race_second';
set local role lab_player;
select set_config('lab.test_subject','bob',true);
select * from game_api.reveal('room',1,'b');
commit;
SQL
  # Verify the second backend is actually waiting on a Postgres lock; an
  # operating-system process still running could merely be starting up.
  local blocked=0
  for ((i=0;i<50;i++)); do
    blocked=$(sql -c "select count(*) from pg_stat_activity where application_name='hsc_gamble_race_second' and wait_event_type='Lock'")
    if [[ "$blocked" == '1' ]]; then break; fi
    if ! kill -0 "$second_pid" 2>/dev/null; then cat "$lab_tmp/second.log" >&2; echo 'Second session completed without waiting for the first lock.' >&2; exit 1; fi
    sleep 0.1
  done
  if [[ "$blocked" != '1' ]]; then echo 'Did not observe the second session waiting on a Postgres lock.' >&2; exit 1; fi
  wait "$first_pid" || { cat "$lab_tmp/first.log" >&2; exit 1; }
  wait "$second_pid" || { cat "$lab_tmp/second.log" >&2; exit 1; }
  verify_once
  echo "PASS: competing reveal waits; first $ending leaves one payout."
}
race commit
race rollback
# Fail after the result and first balance update; the entire statement must roll back.
seed
sql <<'SQL'
create function game_private.inject_failure() returns trigger language plpgsql as $$ begin if new.id='b' then raise exception 'injected balance failure'; end if; return new; end $$;
create trigger fail_second before update on game_private.players for each row execute function game_private.inject_failure();
SQL
if sql > "$lab_tmp/failure.log" 2>&1 <<'SQL'
begin;
set local role lab_player;
select set_config('lab.test_subject','alice',true);
select * from game_api.reveal('room',1,'a');
commit;
SQL
then echo 'Expected injected payout failure.' >&2; exit 1; fi
if ! grep -q 'injected balance failure' "$lab_tmp/failure.log"; then cat "$lab_tmp/failure.log" >&2; echo 'Failure was not the expected trigger.' >&2; exit 1; fi
actual=$(sql <<'SQL'
select (select count(*) from game_private.results)::text || ':' || (select points from game_private.players where id='a')::text || ':' || (select points from game_private.players where id='b')::text;
SQL
)
if [[ "$actual" != '0:0:0' ]]; then echo "Partial payout after rollback: $actual" >&2; exit 1; fi
sql <<'SQL'
drop trigger fail_second on game_private.players;
drop function game_private.inject_failure();
begin;
set local role lab_player;
select set_config('lab.test_subject','bob',true);
select * from game_api.reveal('room',1,'b');
commit;
SQL
verify_once
echo 'PASS: failed second payout rolls back result and first payout; retry pays once.'
