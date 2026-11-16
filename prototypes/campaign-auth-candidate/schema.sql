-- ISOLATED AUTH-BOUND CONTRACT CANDIDATE. Never deploy as a migration.
-- campaign_lab is private and never granted to browser roles. Its p_actor
-- functions are reached only by security-definer wrappers that derive auth.uid().
create schema campaign_lab;
create table campaign_lab.content_releases (
 id integer primary key, subject text not null, syllabus text not null,
 revision text not null unique, status text not null check(status in ('draft','released','revoked'))
);
create table campaign_lab.question_bank (
  qid integer primary key, release_id integer not null references campaign_lab.content_releases(id),
  prompt text not null, options jsonb not null check (jsonb_typeof(options)='array' and jsonb_array_length(options)=4),
  correct_index integer not null check (correct_index between 0 and 3), explanation text not null,
  review_status text not null check(review_status in ('draft','approved')),
  reviewer text, reviewed_at timestamptz,
  check(review_status <> 'approved' or (reviewer is not null and reviewed_at is not null))
);
insert into campaign_lab.content_releases values (1,'synthetic-chemistry','synthetic-syllabus-v1','fixture-v1','draft');
insert into campaign_lab.question_bank values
 (1,1,'Which side gains product?', '["Right","Left","Neither","Unknown"]',0,'The forward reaction forms product.','approved','synthetic-reviewer',clock_timestamp()),
 (2,1,'How many?', '["One","Two","Three","Four"]',1,'This synthetic fixture has answer two.','approved','synthetic-reviewer',clock_timestamp()),
 (3,1,'Which option?', '["A","B","C","D"]',2,'This synthetic fixture has answer C.','approved','synthetic-reviewer',clock_timestamp()),
 (4,1,'Which value?', '["One","Two","Three","Four"]',3,'This synthetic fixture has answer four.','approved','synthetic-reviewer',clock_timestamp());
update campaign_lab.content_releases set status='released' where id=1;

-- Published content is immutable. Revocation blocks future starts and actions.
create function campaign_lab.protect_question() returns trigger language plpgsql set search_path=pg_catalog,campaign_lab as $$
declare old_status text; new_status text;
begin
 if tg_op <> 'INSERT' then select status into old_status from campaign_lab.content_releases where id=old.release_id for share; end if;
 if tg_op <> 'DELETE' then select status into new_status from campaign_lab.content_releases where id=new.release_id for share; end if;
 if old_status in ('released','revoked') or new_status in ('released','revoked') then raise exception 'published content immutable'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger protect_question before insert or update or delete on campaign_lab.question_bank for each row execute function campaign_lab.protect_question();
create function campaign_lab.protect_release() returns trigger language plpgsql set search_path=pg_catalog,campaign_lab as $$
begin
 if tg_op='DELETE' then if old.status<>'draft' then raise exception 'published release immutable'; end if; return old; end if;
 if old.status in ('released','revoked') and (new.subject is distinct from old.subject or new.syllabus is distinct from old.syllabus or new.revision is distinct from old.revision or new.id is distinct from old.id or (new.status is distinct from old.status and not (old.status='released' and new.status='revoked'))) then raise exception 'published release immutable'; end if;
 return new;
end $$;
create trigger protect_release before update or delete on campaign_lab.content_releases for each row execute function campaign_lab.protect_release();
create table campaign_lab.runs (
 id uuid primary key, owner text not null, release_id integer not null references campaign_lab.content_releases(id), version integer not null default 0,
 turn integer not null default 1, phase text not null default 'question' check(phase in ('question','feedback','won','lost','exhausted')),
 boss_hp integer not null default 28 check(boss_hp >= 0), player_hp integer not null default 100 check(player_hp between 0 and 100),
 energy integer not null default 0 check(energy between 0 and 5), combo integer not null default 0 check(combo >= 0),
 shield boolean not null default false, charging boolean not null default false,
 question_started timestamptz not null default clock_timestamp(), claimed boolean not null default false
);
create table campaign_lab.run_questions (
 run_id uuid not null references campaign_lab.runs(id), slot integer not null,
 source_id integer not null, prompt text not null, options jsonb not null, correct_index integer not null,
 explanation text not null, reviewer text not null, reviewed_at timestamptz not null, primary key(run_id,slot)
);
create table campaign_lab.actions (
 run_id uuid not null references campaign_lab.runs(id), request_id uuid not null, kind text not null,
 expected_version integer not null, value integer, result jsonb not null, primary key(run_id, request_id)
);
create table campaign_lab.wallets (owner text primary key, balance integer not null default 0 check(balance>=0));
create table campaign_lab.awards (run_id uuid primary key references campaign_lab.runs(id), owner text not null, amount integer not null check(amount=25));

-- Actor arguments in this lab model a trusted gateway that binds an already
-- authenticated principal. Direct execution by browser/database roles is denied.
create function campaign_lab.start_run(p_actor text,p_run uuid,p_release integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs; rel campaign_lab.content_releases; created uuid;
begin
 if p_actor is null or length(p_actor)=0 or p_run is null or p_release is null then raise exception 'bad input'; end if;
 select * into rel from campaign_lab.content_releases where id=p_release for share;
 if not found or rel.status<>'released' then raise exception 'content unavailable'; end if;
 insert into campaign_lab.runs(id,owner,release_id) values(p_run,p_actor,p_release) on conflict do nothing returning id into created;
 select * into r from campaign_lab.runs where id=p_run;
 if r.owner<>p_actor then raise exception 'not owner'; end if;
 if r.release_id<>p_release then raise exception 'run conflict'; end if;
 if created is not null then
   insert into campaign_lab.run_questions(run_id,slot,source_id,prompt,options,correct_index,explanation,reviewer,reviewed_at)
   select p_run,row_number() over(order by qid)::int,qid,prompt,options,correct_index,explanation,reviewer,reviewed_at
   from campaign_lab.question_bank where release_id=p_release and review_status='approved';
   if not found then raise exception 'no approved content'; end if;
 end if;
 return jsonb_build_object('run',r.id,'release_id',r.release_id,'version',r.version,'phase',r.phase);
end $$;

create function campaign_lab.get_state(p_actor text,p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs; q campaign_lab.run_questions;
begin
 select * into r from campaign_lab.runs where id=p_run;
 if not found or p_actor is null or r.owner<>p_actor then raise exception 'not owner'; end if;
 if r.phase='question' then select * into q from campaign_lab.run_questions where run_id=p_run and slot=r.turn; end if;
 return jsonb_build_object('run',r.id,'version',r.version,'phase',r.phase,'turn',r.turn,
   'boss_hp',r.boss_hp,'player_hp',r.player_hp,'energy',r.energy,'combo',r.combo,
   'shield',r.shield,'charging',r.charging,'deadline',r.question_started + interval '15 seconds',
   'question',case when r.phase='question' then jsonb_build_object('id',q.source_id,'prompt',q.prompt,'options',q.options) else null end);
end $$;

-- Only an already-recorded answer/timeout can produce a receipt. This allows
-- a trusted gateway to recover feedback without trusting a client-side score.
create function campaign_lab.last_receipt(p_actor text,p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs; receipt jsonb;
begin
 select * into r from campaign_lab.runs where id=p_run for share;
 if not found or p_actor is null or r.owner<>p_actor then raise exception 'not owner'; end if;
 select a.result->'receipt' into receipt from campaign_lab.actions a
  where a.run_id=p_run and a.kind in ('answer','expire') and (a.result->>'turn')::int=r.turn
  limit 1;
 return jsonb_build_object('run',r.id,'version',r.version,'turn',r.turn,'receipt',receipt);
end $$;

create function campaign_lab.act(p_actor text,p_run uuid,p_request uuid,p_expected integer,p_kind text,p_value integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs; q campaign_lab.run_questions; existing campaign_lab.actions; release_status text;
 correct boolean; amount integer; dmg integer; out_json jsonb; receipt jsonb := null;
begin
 if p_request is null or p_expected is null or p_kind is null then raise exception 'bad input'; end if;
 select * into r from campaign_lab.runs where id=p_run for update;
 if not found or r.owner<>p_actor or p_actor is null then raise exception 'not owner'; end if;
 select * into existing from campaign_lab.actions where run_id=p_run and request_id=p_request;
 if found then
   if existing.kind is distinct from p_kind or existing.value is distinct from p_value or existing.expected_version is distinct from p_expected then raise exception 'request conflict'; end if;
   return existing.result;
 end if;
 select status into release_status from campaign_lab.content_releases where id=r.release_id for share;
 if release_status is distinct from 'released' then raise exception 'content unavailable'; end if;
 if r.version<>p_expected then raise exception 'stale version'; end if;
 if r.phase in ('won','lost','exhausted') then raise exception 'run finished'; end if;
 if p_kind in ('answer','expire') then
   if r.phase<>'question' then raise exception 'not answering'; end if;
   if p_kind='answer' and (p_value is null or p_value<0 or p_value>3) then raise exception 'invalid choice'; end if;
   if p_kind='answer' and clock_timestamp() >= r.question_started + interval '15 seconds' then raise exception 'deadline passed'; end if;
   if p_kind='expire' and (p_value is not null or clock_timestamp() < r.question_started + interval '15 seconds') then raise exception 'not expired'; end if;
   select * into q from campaign_lab.run_questions where run_id=p_run and slot=r.turn;
   if not found then raise exception 'question unavailable'; end if;
   correct := p_kind='answer' and p_value=q.correct_index;
   dmg := 0;
   if correct then
     r.combo:=r.combo+1;
     amount:=case when clock_timestamp() < r.question_started + interval '8.25 seconds' then 2 else 1 end;
     r.energy:=least(5,r.energy+amount);
   else
     r.combo:=0;
     if r.shield then r.shield:=false;
     else dmg:=case when r.boss_hp < 12 then 21 else 14 end; end if;
   end if;
   if r.charging then dmg:=dmg+30; r.charging:=false; end if;
   r.player_hp:=greatest(0,r.player_hp-dmg);
   r.phase:=case when r.player_hp=0 then 'lost' else 'feedback' end;
   receipt:=jsonb_build_object('question_id',q.source_id,'correct',correct,'correct_index',q.correct_index,'explanation',q.explanation,'damage',dmg);
 elsif p_kind='next' then
   if p_value is not null or r.phase<>'feedback' then raise exception 'cannot advance'; end if;
   r.turn:=r.turn+1;
   if exists(select 1 from campaign_lab.run_questions where run_id=p_run and slot=r.turn) then
     r.phase:='question'; r.question_started:=clock_timestamp();
     if r.turn%3=0 then r.charging:=true; end if;
   else r.phase:='exhausted'; end if;
 elsif p_kind in ('hit','special','block') then
   if p_value is not null then raise exception 'invalid action payload'; end if;
   amount:=case when p_kind='special' then 3 else 1 end;
   if r.energy<amount then raise exception 'insufficient energy'; end if;
   r.energy:=r.energy-amount;
   if p_kind='block' then r.shield:=true; r.charging:=false; r.player_hp:=least(100,r.player_hp+16);
   else
     dmg:=case when p_kind='special' then 45 when r.combo>=5 then 28 when r.combo>=3 then 21 else 14 end;
     r.boss_hp:=greatest(0,r.boss_hp-dmg);
     if r.boss_hp=0 then r.phase:='won'; end if;
   end if;
 else raise exception 'unknown action'; end if;
 r.version:=r.version+1;
 update campaign_lab.runs set version=r.version,turn=r.turn,phase=r.phase,boss_hp=r.boss_hp,
 player_hp=r.player_hp,energy=r.energy,combo=r.combo,shield=r.shield,charging=r.charging,question_started=r.question_started where id=p_run;
 out_json:=jsonb_build_object('run',r.id,'request_id',p_request,'kind',p_kind,'expected_version',p_expected,
 'version',r.version,'phase',r.phase,'turn',r.turn,'boss_hp',r.boss_hp,
 'player_hp',r.player_hp,'energy',r.energy,'combo',r.combo,'shield',r.shield,'charging',r.charging,'receipt',receipt);
 insert into campaign_lab.actions(run_id,request_id,kind,expected_version,value,result) values(p_run,p_request,p_kind,p_expected,p_value,out_json);
 return out_json;
end $$;

create function campaign_lab.claim(p_actor text,p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs;
begin
 select * into r from campaign_lab.runs where id=p_run for update;
 if not found or r.owner<>p_actor or p_actor is null then raise exception 'not owner'; end if;
 if r.phase<>'won' then raise exception 'not won'; end if;
 if not r.claimed then
   insert into campaign_lab.awards(run_id,owner,amount) values(p_run,p_actor,25);
   insert into campaign_lab.wallets(owner,balance) values(p_actor,25)
   on conflict(owner) do update set balance=campaign_lab.wallets.balance+25;
   update campaign_lab.runs set claimed=true where id=p_run;
 end if;
 return jsonb_build_object('awarded',25,'run',p_run);
end $$;

-- All actor-taking routines and storage are private to their owner.
revoke all on schema campaign_lab from public;
revoke all on all tables in schema campaign_lab from public;
revoke all on all functions in schema campaign_lab from public;

-- Synthetic auth stub for this isolated database only. Production must use
-- Supabase's actual auth.uid() and a verified JWT delivered by PostgREST.
-- In this test, request.jwt.claim.sub is deliberately set by the test harness;
-- direct SQL users can forge that GUC. This is NOT an authentication system.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create role authenticated nologin;
create role anon nologin;
create schema campaign_api;
revoke all on schema campaign_api from public;

create function campaign_api.start_run(p_run uuid,p_release integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,auth,campaign_lab as $$
declare actor uuid := auth.uid();
begin
 if actor is null then raise exception 'authentication required'; end if;
 return campaign_lab.start_run(actor::text,p_run,p_release);
end $$;
create function campaign_api.get_state(p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,auth,campaign_lab as $$
declare actor uuid := auth.uid();
begin
 if actor is null then raise exception 'authentication required'; end if;
 return campaign_lab.get_state(actor::text,p_run);
end $$;
create function campaign_api.last_receipt(p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,auth,campaign_lab as $$
declare actor uuid := auth.uid();
begin
 if actor is null then raise exception 'authentication required'; end if;
 return campaign_lab.last_receipt(actor::text,p_run);
end $$;
create function campaign_api.act(p_run uuid,p_request uuid,p_expected integer,p_kind text,p_value integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,auth,campaign_lab as $$
declare actor uuid := auth.uid();
begin
 if actor is null then raise exception 'authentication required'; end if;
 return campaign_lab.act(actor::text,p_run,p_request,p_expected,p_kind,p_value);
end $$;
create function campaign_api.claim(p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,auth,campaign_lab as $$
declare actor uuid := auth.uid();
begin
 if actor is null then raise exception 'authentication required'; end if;
 return campaign_lab.claim(actor::text,p_run);
end $$;
revoke all on all functions in schema campaign_api from public;
grant usage on schema campaign_api to authenticated;
grant execute on all functions in schema campaign_api to authenticated;
