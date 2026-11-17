-- STAGING-ONLY. Boss Battle mode on top of staging-game-layer.sql.
-- The whole class fights one subject boss. Every point scored is damage.
-- Boss HP is frozen when the game starts: 450 x players x questions, so a class
-- answering about two-thirds correctly at a fair pace wins near the end.

alter table classroom_v2_private.rooms add column game_mode text not null default 'classic' check (game_mode in ('classic','boss'));
alter table classroom_v2_private.rooms add column boss_subject text check (boss_subject in ('biology','chemistry','physics','maths-standard','maths-advanced','maths-ext1'));
alter table classroom_v2_private.rooms add column boss_hp integer check (boss_hp > 0);

-- Host-only, lobby-only mode selection.
create function public.classroom_v2_game_configure(p_room uuid, p_mode text, p_boss text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room classroom_v2_private.rooms%rowtype;
begin
  select * into room from classroom_v2_private.rooms r where r.id=p_room and r.host_actor=auth.uid() for update;
  if not found or auth.uid() is null or not exists(select 1 from classroom_v2_private.hosts h where h.actor=auth.uid() and h.enabled) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  if room.state <> 'lobby' or clock_timestamp() >= room.expires_at then return false; end if;
  if p_mode not in ('classic','boss') or (p_mode='boss' and p_boss not in ('biology','chemistry','physics','maths-standard','maths-advanced','maths-ext1')) then
    raise exception using errcode='22023', message='INVALID_SETUP';
  end if;
  update classroom_v2_private.rooms r set game_mode=p_mode, boss_subject=case when p_mode='boss' then p_boss else null end where r.id=p_room;
  return true;
end $$;

-- Freeze boss HP when a boss room starts. Runs inside classroom_v2_start's
-- transaction (state lobby -> active), so it sees the final lobby roster.
create function classroom_v2_private.freeze_boss_hp() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.game_mode='boss' and old.state='lobby' and new.state='active' then
    new.boss_hp := 450
      * greatest(1, (select count(*) from classroom_v2_private.players p where p.room_id=new.id))
      * greatest(1, (select count(*) from classroom_v2_private.questions q where q.room_id=new.id));
  end if;
  return new;
end $$;
create trigger rooms_freeze_boss_hp before update on classroom_v2_private.rooms for each row execute function classroom_v2_private.freeze_boss_hp();
revoke all on function classroom_v2_private.freeze_boss_hp() from public, anon, authenticated;

-- Boss state shared by both views. Damage is the class's total score.
create function classroom_v2_private.boss_json(p_room uuid) returns jsonb language sql stable set search_path = '' as $$
  select case when r.game_mode <> 'boss' then null else jsonb_build_object(
    'subject', r.boss_subject, 'hp', r.boss_hp,
    'damage', (select coalesce(sum(p.score), 0) from classroom_v2_private.players p where p.room_id=r.id),
    'round_damage', (select coalesce(sum(x.points), 0) from classroom_v2_private.receipts x
                     join classroom_v2_private.questions q on q.room_id=x.room_id and q.id=x.question_id
                     where x.room_id=r.id and q.index=r.active_index)
  ) end
  from classroom_v2_private.rooms r where r.id=p_room
$$;
revoke all on function classroom_v2_private.boss_json(uuid) from public, anon, authenticated;

-- Wrap the existing views: same signature, plus mode and boss fields.
alter function public.classroom_v2_game_host(uuid) rename to classroom_v2_game_host_base;
alter function public.classroom_v2_game_player(uuid, uuid) rename to classroom_v2_game_player_base;
revoke all on function public.classroom_v2_game_host_base(uuid), public.classroom_v2_game_player_base(uuid,uuid) from public, anon, authenticated;
alter function public.classroom_v2_game_host_base(uuid) set schema classroom_v2_private;
alter function public.classroom_v2_game_player_base(uuid,uuid) set schema classroom_v2_private;

create function public.classroom_v2_game_host(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare base jsonb := classroom_v2_private.classroom_v2_game_host_base(p_room);
begin
  return base || jsonb_build_object('mode', (select r.game_mode from classroom_v2_private.rooms r where r.id=p_room), 'boss', classroom_v2_private.boss_json(p_room));
end $$;
create function public.classroom_v2_game_player(p_room uuid, p_player uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare base jsonb := classroom_v2_private.classroom_v2_game_player_base(p_room, p_player);
begin
  return base || jsonb_build_object('mode', (select r.game_mode from classroom_v2_private.rooms r where r.id=p_room), 'boss', classroom_v2_private.boss_json(p_room));
end $$;

revoke all on function public.classroom_v2_game_configure(uuid,text,text), public.classroom_v2_game_host(uuid), public.classroom_v2_game_player(uuid,uuid) from public, anon, authenticated;
grant execute on function public.classroom_v2_game_configure(uuid,text,text), public.classroom_v2_game_host(uuid), public.classroom_v2_game_player(uuid,uuid) to authenticated;
