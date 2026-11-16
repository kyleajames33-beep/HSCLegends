#!/usr/bin/env bash
# Synthetic duplicate-start races; never points at a pre-existing database.
set -euo pipefail
lab_root=$(cd "$(dirname "$0")" && pwd)
lab_tmp=$(mktemp -d "${TMPDIR:-/tmp}/hsc-tycoon-start.XXXXXXXX")
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
race() {
  local next_release=$1 first_pid second_pid blocked=0 second_status=0 actual run
  sql <<'SQL'
truncate ty_private.ledger,ty_private.completions,ty_private.wallets,ty_private.purchases,ty_private.answers,ty_private.session_questions,ty_private.sessions,ty_private.question_bank,ty_private.releases;
insert into ty_private.releases values ('chemistry','chemistry',12,'test-2025','draft'),('physics','physics',12,'test-2025','draft');
insert into ty_private.question_bank values ('q1','chemistry','Q1?',array['A','B'],0,'E1'),('q2','physics','Q2?',array['A','B'],1,'E2');
update ty_private.releases set status='published';
SQL
  sql > "$lab_tmp/first.log" 2>&1 <<'SQL' & first_pid=$!
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select * from ty_api.start('chemistry','request-1');
select 'FIRST_LOCK_HELD';
select pg_sleep(8);
commit;
SQL
  for ((i=0;i<100;i++)); do
    if grep -q FIRST_LOCK_HELD "$lab_tmp/first.log"; then break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then cat "$lab_tmp/first.log" >&2; wait "$first_pid" || true; exit 1; fi
    if ((i==99)); then echo 'First request did not acquire lock.' >&2; exit 1; fi
    sleep 0.1
  done
  sql -v release="$next_release" > "$lab_tmp/second.log" 2>&1 <<'SQL' & second_pid=$!
begin;
set local application_name='hsc_tycoon_start_second';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select * from ty_api.start(:'release','request-1');
commit;
SQL
  for ((i=0;i<50;i++)); do
    blocked=$(sql -c "select count(*) from pg_stat_activity where application_name='hsc_tycoon_start_second' and wait_event_type='Lock'")
    if [[ "$blocked" == '1' ]]; then break; fi
    if ! kill -0 "$second_pid" 2>/dev/null; then cat "$lab_tmp/second.log" >&2; echo 'Second start did not wait on lock.' >&2; exit 1; fi
    sleep 0.1
  done
  [[ "$blocked" == '1' ]] || { echo 'No Postgres lock wait observed.' >&2; exit 1; }
  wait "$first_pid" || { cat "$lab_tmp/first.log" >&2; exit 1; }
  wait "$second_pid" || second_status=$?
  actual=$(sql -c "select (select count(*) from ty_private.sessions)::text||':'||(select count(*) from ty_private.session_questions)::text")
  [[ "$actual" == '1:1' ]] || { echo "Duplicate sessions/questions: $actual" >&2; exit 1; }
  run=$(sql -c 'select id from ty_private.sessions')
  if [[ "$next_release" == chemistry ]]; then
    [[ "$second_status" == 0 ]] && grep -Fq "$run|1|" "$lab_tmp/first.log" && grep -Fq "$run|1|" "$lab_tmp/second.log" || { cat "$lab_tmp/second.log" >&2; echo 'Matching retry did not return original session.' >&2; exit 1; }
  else
    [[ "$second_status" != 0 ]] && grep -q 'idempotency key conflict' "$lab_tmp/second.log" || { cat "$lab_tmp/second.log" >&2; echo 'Mismatched release was not rejected.' >&2; exit 1; }
  fi
  echo "PASS: concurrent start with $next_release leaves one session and correctly handles retry."
}
race chemistry
race physics
