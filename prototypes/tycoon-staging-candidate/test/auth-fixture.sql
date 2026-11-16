-- TEST ONLY. This setting is freely writable by a SQL user and is not a JWT.
-- Production must provide verified auth.uid() and its own existing roles.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
