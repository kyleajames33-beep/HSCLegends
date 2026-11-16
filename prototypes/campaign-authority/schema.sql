-- ISOLATED CONTRACT LAB. Never deploy this schema as a Supabase migration.
-- The p_actor parameter is a trusted-gateway input, NOT an authentication mechanism.
create schema campaign_lab;
create table campaign_lab.question_bank (
  qid integer primary key, prompt text not null, options jsonb not null,
  correct_index integer not null check (correct_index between 0 and 3), explanation text not null
);
insert into campaign_lab.question_bank values
 (1,'Which side gains product?', '["Right","Left","Neither","Unknown"]',0,'The forward reaction forms product.'),
 (2,'How many?', '["One","Two","Three","Four"]',1,'This synthetic fixture has answer two.'),
 (3,'Which option?', '["A","B","C","D"]',2,'This synthetic fixture has answer C.'),
 (4,'Which value?', '["One","Two","Three","Four"]',3,'This synthetic fixture has answer four.');
create table campaign_lab.runs (
 id uuid primary key, owner text not null, version integer not null default 0,
 turn integer not null default 1, phase text not null default 'question' check(phase in ('question','feedback','won','lost','exhausted')),
 boss_hp integer not null default 28 check(boss_hp >= 0), player_hp integer not null default 100 check(player_hp between 0 and 100),
 energy integer not null default 0 check(energy between 0 and 5), combo integer not null default 0 check(combo >= 0),
 shield boolean not null default false, charging boolean not null default false,
 question_started timestamptz not null default clock_timestamp(), claimed boolean not null default false
);
create table campaign_lab.actions (
 run_id uuid not null references campaign_lab.runs(id), request_id uuid not null, kind text not null,
 expected_version integer not null, value integer, result jsonb not null, primary key(run_id, request_id)
);
create table campaign_lab.wallets (owner text primary key, balance integer not null default 0 check(balance>=0));
create table campaign_lab.awards (run_id uuid primary key references campaign_lab.runs(id), owner text not null, amount integer not null check(amount=25));

-- Actor arguments in this lab model a trusted gateway that binds an already
-- authenticated principal. Direct execution by browser/database roles is denied.
create function campaign_lab.start_run(p_actor text,p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs;
begin
 if p_actor is null or length(p_actor)=0 or p_run is null then raise exception 'bad input'; end if;
 insert into campaign_lab.runs(id,owner) values(p_run,p_actor) on conflict do nothing;
 select * into r from campaign_lab.runs where id=p_run;
 if r.owner<>p_actor then raise exception 'not owner'; end if;
 return jsonb_build_object('run',r.id,'version',r.version,'phase',r.phase);
end $$;

create function campaign_lab.get_state(p_actor text,p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs; q campaign_lab.question_bank;
begin
 select * into r from campaign_lab.runs where id=p_run;
 if not found or p_actor is null or r.owner<>p_actor then raise exception 'not owner'; end if;
 if r.phase='question' then select * into q from campaign_lab.question_bank where qid=r.turn; end if;
 return jsonb_build_object('run',r.id,'version',r.version,'phase',r.phase,'turn',r.turn,
   'boss_hp',r.boss_hp,'player_hp',r.player_hp,'energy',r.energy,'combo',r.combo,
   'shield',r.shield,'charging',r.charging,'deadline',r.question_started + interval '15 seconds',
   'question',case when r.phase='question' then jsonb_build_object('id',q.qid,'prompt',q.prompt,'options',q.options) else null end);
end $$;

-- Only an already-recorded answer/timeout can produce a receipt. This allows
-- a trusted gateway to recover feedback without trusting a client-side score.
create function campaign_lab.last_receipt(p_actor text,p_run uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs; receipt jsonb;
begin
 select * into r from campaign_lab.runs where id=p_run;
 if not found or p_actor is null or r.owner<>p_actor then raise exception 'not owner'; end if;
 select a.result->'receipt' into receipt from campaign_lab.actions a
  where a.run_id=p_run and a.kind in ('answer','expire') and (a.result->>'turn')::int=r.turn
  limit 1;
 return receipt;
end $$;

create function campaign_lab.act(p_actor text,p_run uuid,p_request uuid,p_expected integer,p_kind text,p_value integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,campaign_lab as $$
declare r campaign_lab.runs; q campaign_lab.question_bank; existing campaign_lab.actions;
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
 if r.version<>p_expected then raise exception 'stale version'; end if;
 if r.phase in ('won','lost','exhausted') then raise exception 'run finished'; end if;
 if p_kind in ('answer','expire') then
   if r.phase<>'question' then raise exception 'not answering'; end if;
   if p_kind='answer' and (p_value is null or p_value<0 or p_value>3) then raise exception 'invalid choice'; end if;
   if p_kind='answer' and clock_timestamp() >= r.question_started + interval '15 seconds' then raise exception 'deadline passed'; end if;
   if p_kind='expire' and (p_value is not null or clock_timestamp() < r.question_started + interval '15 seconds') then raise exception 'not expired'; end if;
   select * into q from campaign_lab.question_bank where qid=r.turn;
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
   receipt:=jsonb_build_object('question_id',q.qid,'correct',correct,'correct_index',q.correct_index,'explanation',q.explanation,'damage',dmg);
 elsif p_kind='next' then
   if p_value is not null or r.phase<>'feedback' then raise exception 'cannot advance'; end if;
   r.turn:=r.turn+1;
   if exists(select 1 from campaign_lab.question_bank where qid=r.turn) then
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
 out_json:=jsonb_build_object('version',r.version,'phase',r.phase,'turn',r.turn,'boss_hp',r.boss_hp,
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

-- Simulated roles. The trusted gateway is the only API caller; guests have no
-- direct SQL access. Real identity binding is deliberately not implemented.
create role campaign_lab_gateway nologin;
create role campaign_lab_guest nologin;
revoke all on schema campaign_lab from public;
revoke all on all tables in schema campaign_lab from public;
revoke all on all functions in schema campaign_lab from public;
grant usage on schema campaign_lab to campaign_lab_gateway;
grant execute on function campaign_lab.start_run(text,uuid),campaign_lab.get_state(text,uuid),campaign_lab.last_receipt(text,uuid),campaign_lab.act(text,uuid,uuid,integer,text,integer),campaign_lab.claim(text,uuid) to campaign_lab_gateway;
