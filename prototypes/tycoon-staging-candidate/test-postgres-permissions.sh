#!/usr/bin/env bash
# Synthetic Postgres role checks. Never connects to an existing database.
set -euo pipefail
lab_root=$(cd "$(dirname "$0")" && pwd)
lab_tmp=$(mktemp -d "${TMPDIR:-/tmp}/hsc-tycoon-roles.XXXXXXXX")
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
actual=$(sql <<'SQL'
select has_schema_privilege('anon','ty_api','usage')::text||':'||has_schema_privilege('authenticated','ty_api','usage')::text||':'||
       has_table_privilege('authenticated','ty_private.question_bank','select')::text||':'||has_table_privilege('authenticated','ty_private.wallets','update')::text||':'||
       has_function_privilege('anon','ty_api.start(text,text)','execute')::text||':'||has_function_privilege('authenticated','ty_api.start(text,text)','execute')::text;
SQL
)
[[ "$actual" == 'false:true:false:false:false:true' ]] || { echo "Unexpected schema/table/function privileges: $actual" >&2; exit 1; }
expect_failure() {
  local needle=$1
  if sql > "$lab_tmp/failed.log" 2>&1; then echo 'Expected denial.' >&2; exit 1; fi
  grep -q "$needle" "$lab_tmp/failed.log" || { cat "$lab_tmp/failed.log" >&2; echo "Wrong failure; expected $needle" >&2; exit 1; }
}
expect_failure 'permission denied' <<'SQL'
set role anon;
select * from ty_api.start('release','request');
SQL
expect_failure 'permission denied' <<'SQL'
set role authenticated;
select * from ty_private.question_bank;
SQL
expect_failure 'not authorized' <<'SQL'
set role authenticated;
select * from ty_api.start('release','request');
SQL
sql <<'SQL'
insert into ty_private.releases values ('release','chemistry',12,'test-2025','draft');
insert into ty_private.question_bank values ('q1','release','Q1?',array['A','B'],0,'E1');
update ty_private.releases set status='published' where id='release';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select * from ty_api.start('release','request');
SQL
lab_run=$(sql -c 'select id from ty_private.sessions')
[[ "$lab_run" =~ ^[a-f0-9-]{36}$ ]] || { echo 'Invalid synthetic run id' >&2; exit 1; }
expect_failure 'not authorized' <<SQL
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
select ty_api.snapshot('$lab_run');
SQL
echo 'PASS: PostgreSQL role grants deny anonymous/private access and enforce mock uid ownership.'
