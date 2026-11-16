#!/usr/bin/env bash
# Synthetic-only real Postgres publication/authoring races in a disposable container.
set -euo pipefail
lab_root=$(cd "$(dirname "$0")" && pwd)
lab_tmp=$(mktemp -d "${TMPDIR:-/tmp}/hsc-tycoon-publish.XXXXXXXX")
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
truncate ty_private.question_bank,ty_private.releases cascade;
insert into ty_private.releases values ('release','chemistry',12,'test-2025','draft');
insert into ty_private.question_bank values ('q1','release','Q1?',array['A','B'],0,'E1');
SQL
}
race() {
  local mode=$1 first_query second_query first_pid second_pid blocked=0 second_status=0 actual
  seed
  if [[ "$mode" == author_first ]]; then
    first_query="insert into ty_private.question_bank values ('q2','release','Q2?',array['A','B'],1,'E2');"
    second_query="update ty_private.releases set status='published' where id='release';"
  else
    first_query="update ty_private.releases set status='published' where id='release';"
    second_query="insert into ty_private.question_bank values ('q2','release','Q2?',array['A','B'],1,'E2');"
  fi
  cat > "$lab_tmp/first.sql" <<SQL
begin;
$first_query
select 'FIRST_LOCK_HELD';
select pg_sleep(8);
commit;
SQL
  sql < "$lab_tmp/first.sql" > "$lab_tmp/first.log" 2>&1 & first_pid=$!
  for ((i=0;i<100;i++)); do
    if grep -q FIRST_LOCK_HELD "$lab_tmp/first.log"; then break; fi
    if ! kill -0 "$first_pid" 2>/dev/null; then cat "$lab_tmp/first.log" >&2; wait "$first_pid" || true; exit 1; fi
    if ((i==99)); then echo 'First transaction did not acquire lock.' >&2; exit 1; fi
    sleep 0.1
  done
  cat > "$lab_tmp/second.sql" <<SQL
begin;
set local application_name='hsc_tycoon_publish_second';
$second_query
commit;
SQL
  sql < "$lab_tmp/second.sql" > "$lab_tmp/second.log" 2>&1 & second_pid=$!
  for ((i=0;i<50;i++)); do
    blocked=$(sql -c "select count(*) from pg_stat_activity where application_name='hsc_tycoon_publish_second' and wait_event_type='Lock'")
    if [[ "$blocked" == '1' ]]; then break; fi
    if ! kill -0 "$second_pid" 2>/dev/null; then cat "$lab_tmp/second.log" >&2; echo 'Second transaction did not wait on lock.' >&2; exit 1; fi
    sleep 0.1
  done
  [[ "$blocked" == '1' ]] || { echo 'No Postgres lock wait observed.' >&2; exit 1; }
  wait "$first_pid" || { cat "$lab_tmp/first.log" >&2; exit 1; }
  wait "$second_pid" || second_status=$?
  actual=$(sql -c "select status||':'||(select count(*) from ty_private.question_bank where release_id='release')::text from ty_private.releases where id='release'")
  if [[ "$mode" == author_first ]]; then
    [[ "$second_status" == '0' && "$actual" == 'published:2' ]] || { cat "$lab_tmp/second.log" >&2; echo "Unexpected author-first result $actual" >&2; exit 1; }
  else
    [[ "$second_status" != '0' && "$actual" == 'published:1' ]] && grep -q 'published release questions are immutable' "$lab_tmp/second.log" || { cat "$lab_tmp/second.log" >&2; echo "Unexpected publish-first result $actual" >&2; exit 1; }
  fi
  echo "PASS: $mode serialized as $actual."
}
race author_first
race publish_first
