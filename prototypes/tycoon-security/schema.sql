-- SYNTHETIC TYCOON LAB. Not a production migration. The test subject is not
-- authenticated: only the harness sets this value. Never expose it to users.
create role ty_lab_player nologin;
create schema lab_auth;
create function lab_auth.uid() returns text language sql stable as $$ select nullif(current_setting('lab.test_subject',true),'') $$;
create schema ty_private;
create schema ty_api;
revoke all on schema ty_private from public;
revoke all on schema ty_api from public;

-- Content is loaded only by a trusted seeder; selection is server-owned.
create table ty_private.question_bank (
  id text primary key, subject text not null, stem text not null, options text[] not null,
  correct_index integer not null, explanation text not null,
  check(cardinality(options)>=2 and correct_index>=0 and correct_index<cardinality(options))
);
create table ty_private.sessions (
  id text primary key, owner text not null, request_key text not null, subject text not null,
  status text not null default 'active' check(status in ('active','finished')),
  started_at timestamptz not null, deadline timestamptz not null,
  question_count integer not null check(question_count between 1 and 20),
  next_question integer not null default 1, cash integer not null default 0 check(cash>=0),
  earned integer not null default 0 check(earned>=0), correct_count integer not null default 0,
  funding_level integer not null default 0 check(funding_level between 0 and 5),
  unique(owner,request_key)
);
-- Each run pins its own content version. No live key or future ID is public.
create table ty_private.session_questions (
  session_id text not null references ty_private.sessions(id), ordinal integer not null,
  stem text not null, options text[] not null, correct_index integer not null, explanation text not null,
  primary key(session_id,ordinal)
);
create table ty_private.answers (
  session_id text not null references ty_private.sessions(id), ordinal integer not null,
  choice integer not null, correct boolean not null, correct_index integer not null,
  earned integer not null, cash_after integer not null, explanation text not null,
  primary key(session_id,ordinal)
);
create table ty_private.purchases (
  session_id text not null references ty_private.sessions(id), action_key text not null,
  item text not null, cost integer not null, level_after integer not null, cash_after integer not null,
  primary key(session_id,action_key)
);
create table ty_private.wallets(owner text primary key, balance integer not null check(balance>=0));
create table ty_private.ledger(session_id text primary key references ty_private.sessions(id),owner text not null,amount integer not null check(amount>0));
create table ty_private.completions(session_id text primary key references ty_private.sessions(id), correct_count integer not null, earned integer not null, cash integer not null, award integer not null check(award>=0));

create function ty_private.valid_key(v text) returns boolean language sql immutable as $$ select v is not null and v ~ '^[A-Za-z0-9_-]{1,64}$' $$;
create function ty_private.lock_owned(p_session text) returns ty_private.sessions language plpgsql security definer set search_path=pg_catalog,ty_private,lab_auth as $$
declare s ty_private.sessions%rowtype;
begin
  if lab_auth.uid() is null then raise exception 'not authorized' using errcode='42501'; end if;
  select * into s from ty_private.sessions where id=p_session and owner=lab_auth.uid() for update;
  if not found then raise exception 'not authorized' using errcode='42501'; end if;
  return s;
end $$;

-- Start accepts subject and idempotency key only: never bank rows, money or grades.
create function ty_api.start(p_subject text,p_request text) returns table(session_id text,question_count integer,deadline timestamptz) language plpgsql security definer set search_path=pg_catalog,ty_private,lab_auth as $$
declare v_owner text:=lab_auth.uid(); n integer; v_id text; s ty_private.sessions%rowtype;
begin
  if v_owner is null then raise exception 'not authorized' using errcode='42501'; end if;
  if not ty_private.valid_key(p_request) or p_subject is null then raise exception 'invalid start'; end if;
  -- A retry returns the original run even if the question bank changed later.
  select * into s from ty_private.sessions where owner=v_owner and request_key=p_request;
  if found then
    if s.subject <> p_subject then raise exception 'idempotency key conflict'; end if;
    return query select s.id,s.question_count,s.deadline; return;
  end if;
  select count(*) into n from (select id from ty_private.question_bank where subject=p_subject order by id limit 20) q;
  if n=0 then raise exception 'no questions'; end if;
  insert into ty_private.sessions(id,owner,request_key,subject,started_at,deadline,question_count)
    values(gen_random_uuid()::text,v_owner,p_request,p_subject,clock_timestamp(),clock_timestamp()+interval '120 seconds',n)
    on conflict(owner,request_key) do nothing returning id into v_id;
  if v_id is null then
    select * into s from ty_private.sessions where owner=v_owner and request_key=p_request;
    if s.subject <> p_subject then raise exception 'idempotency key conflict'; end if;
    return query select s.id,s.question_count,s.deadline; return;
  end if;
  insert into ty_private.session_questions(session_id,ordinal,stem,options,correct_index,explanation)
    select v_id,row_number() over(order by id)::integer,stem,options,correct_index,explanation
    from (select * from ty_private.question_bank where subject=p_subject order by id limit 20) q;
  return query select x.id,x.question_count,x.deadline from ty_private.sessions x where x.id=v_id;
end $$;

create function ty_api.snapshot(p_session text) returns jsonb language plpgsql security definer set search_path=pg_catalog,ty_private,lab_auth as $$
declare s ty_private.sessions%rowtype; q jsonb; c jsonb;
begin
  s:=ty_private.lock_owned(p_session);
  if s.status='active' and s.deadline>clock_timestamp() and s.next_question<=s.question_count then
    select jsonb_build_object('ordinal',sq.ordinal,'stem',sq.stem,'options',sq.options) into q from ty_private.session_questions sq where sq.session_id=s.id and sq.ordinal=s.next_question;
  end if;
  select jsonb_build_object('correct_count',x.correct_count,'earned',x.earned,'cash',x.cash,'award',x.award) into c from ty_private.completions x where x.session_id=s.id;
  return jsonb_build_object('status',s.status,'server_now',clock_timestamp(),'deadline',s.deadline,'question_count',s.question_count,'question',q,'cash',s.cash,'earned',s.earned,'correct_count',s.correct_count,'funding_level',s.funding_level,'completion',c);
end $$;

create function ty_api.answer(p_session text,p_ordinal integer,p_choice integer) returns table(ordinal integer,choice integer,correct boolean,correct_index integer,earned integer,cash_after integer,explanation text) language plpgsql security definer set search_path=pg_catalog,ty_private,lab_auth as $$
declare s ty_private.sessions%rowtype; q ty_private.session_questions%rowtype; a ty_private.answers%rowtype; v_correct boolean; v_earned integer;
begin
  s:=ty_private.lock_owned(p_session);
  if p_ordinal is null or p_ordinal<1 then raise exception 'invalid ordinal'; end if;
  select * into a from ty_private.answers where session_id=s.id and ty_private.answers.ordinal=p_ordinal;
  if found then return query select a.ordinal,a.choice,a.correct,a.correct_index,a.earned,a.cash_after,a.explanation;return;end if;
  if s.status<>'active' or s.deadline<=clock_timestamp() then raise exception 'run closed'; end if;
  if s.next_question<>p_ordinal then raise exception 'wrong question';end if;
  select * into q from ty_private.session_questions where session_id=s.id and ty_private.session_questions.ordinal=p_ordinal;
  if not found or p_choice is null or p_choice<0 or p_choice>=cardinality(q.options) then raise exception 'invalid choice';end if;
  v_correct:=p_choice=q.correct_index; v_earned:=case when v_correct then 5+5*s.funding_level else 0 end;
  update ty_private.sessions set cash=cash+v_earned,earned=ty_private.sessions.earned+v_earned,correct_count=ty_private.sessions.correct_count+(case when v_correct then 1 else 0 end),next_question=next_question+1 where id=s.id returning * into s;
  insert into ty_private.answers values(s.id,p_ordinal,p_choice,v_correct,q.correct_index,v_earned,s.cash,q.explanation) returning * into a;
  return query select a.ordinal,a.choice,a.correct,a.correct_index,a.earned,a.cash_after,a.explanation;
end $$;

-- Return only an already committed receipt for the requesting run owner.
create function ty_api.receipt(p_session text,p_ordinal integer) returns table(ordinal integer,choice integer,correct boolean,correct_index integer,earned integer,cash_after integer,explanation text) language plpgsql security definer set search_path=pg_catalog,ty_private,lab_auth as $$
declare s ty_private.sessions%rowtype; a ty_private.answers%rowtype;
begin
  s:=ty_private.lock_owned(p_session);
  if p_ordinal is null or p_ordinal<1 then raise exception 'invalid ordinal'; end if;
  select * into a from ty_private.answers where session_id=s.id and ty_private.answers.ordinal=p_ordinal;
  if not found then raise exception 'receipt unavailable'; end if;
  return query select a.ordinal,a.choice,a.correct,a.correct_index,a.earned,a.cash_after,a.explanation;
end $$;

create function ty_api.buy(p_session text,p_action text,p_item text) returns table(item text,cost integer,level_after integer,cash_after integer) language plpgsql security definer set search_path=pg_catalog,ty_private,lab_auth as $$
declare s ty_private.sessions%rowtype; receipt ty_private.purchases%rowtype; v_cost integer;
begin
  s:=ty_private.lock_owned(p_session);
  if not ty_private.valid_key(p_action) then raise exception 'invalid action key'; end if;
  select * into receipt from ty_private.purchases where session_id=s.id and action_key=p_action;
  if found then
    if receipt.item is distinct from p_item then raise exception 'idempotency key conflict';end if;
    return query select receipt.item,receipt.cost,receipt.level_after,receipt.cash_after;return;
  end if;
  if s.status<>'active' or s.deadline<=clock_timestamp() then raise exception 'run closed';end if;
  if p_item is distinct from 'funding' then raise exception 'invalid upgrade';end if;
  if s.funding_level>=5 then raise exception 'upgrade cap';end if;
  v_cost:=10 * (1 << s.funding_level);
  if s.cash<v_cost then raise exception 'insufficient cash';end if;
  update ty_private.sessions set cash=cash-v_cost,funding_level=funding_level+1 where id=s.id returning * into s;
  insert into ty_private.purchases values(s.id,p_action,p_item,v_cost,s.funding_level,s.cash) returning * into receipt;
  return query select receipt.item,receipt.cost,receipt.level_after,receipt.cash_after;
end $$;

create function ty_api.finish(p_session text) returns table(correct_count integer,earned integer,cash integer,award integer) language plpgsql security definer set search_path=pg_catalog,ty_private,lab_auth as $$
declare s ty_private.sessions%rowtype; receipt ty_private.completions%rowtype; v_award integer; v_inserted boolean;
begin
  s:=ty_private.lock_owned(p_session);
  select * into receipt from ty_private.completions where session_id=s.id;
  if found then return query select receipt.correct_count,receipt.earned,receipt.cash,receipt.award;return;end if;
  v_award:=case when s.correct_count>0 then s.correct_count*2+5 else 0 end;
  update ty_private.sessions set status='finished' where id=s.id;
  insert into ty_private.completions values(s.id,s.correct_count,s.earned,s.cash,v_award) returning * into receipt;
  if v_award>0 then
    insert into ty_private.ledger values(s.id,s.owner,v_award) on conflict(session_id) do nothing returning true into v_inserted;
    if coalesce(v_inserted,false) then insert into ty_private.wallets values(s.owner,v_award) on conflict(owner) do update set balance=ty_private.wallets.balance+excluded.balance;end if;
  end if;
  return query select receipt.correct_count,receipt.earned,receipt.cash,receipt.award;
end $$;
revoke all on all tables in schema ty_private from public,ty_lab_player;
revoke all on all functions in schema ty_private from public,ty_lab_player;
revoke all on all functions in schema ty_api from public;
grant usage on schema ty_api to ty_lab_player;
grant execute on function ty_api.start(text,text),ty_api.snapshot(text),ty_api.answer(text,integer,integer),ty_api.receipt(text,integer),ty_api.buy(text,text,text),ty_api.finish(text) to ty_lab_player;
