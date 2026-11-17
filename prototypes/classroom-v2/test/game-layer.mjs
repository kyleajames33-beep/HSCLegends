// Game-layer SQL check (staging-game-layer.sql) in in-memory PGlite with a forgeable mock auth.uid(). Run: node test/game-layer.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const dir = new URL('..', import.meta.url).pathname;
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;`);
await db.exec(fs.readFileSync(`${dir}/staging-candidate.sql`,'utf8'));
await db.exec(fs.readFileSync(`${dir}/staging-game-layer.sql`,'utf8'));
await db.exec(fs.readFileSync(`${dir}/staging-boss-battle.sql`,'utf8'));
const H='00000000-0000-4000-8000-0000000000a1', S1='00000000-0000-4000-8000-0000000000b1', S2='00000000-0000-4000-8000-0000000000b2';
const as = async (uid, sql, params=[]) => { await db.exec(`select set_config('test.uid','${uid}',false)`); return (await db.query(sql, params)).rows; };
const ok = (c,m)=>{ if(!c){console.error('FAIL',m);process.exitCode=1;} else console.log('ok',m); };
await db.exec(`insert into classroom_v2_private.hosts(actor) values('${H}')`);
const qs = JSON.stringify([{stem:'Q1',options:['a','b','c','d'],correct_index:0,content_revision:'t'},{stem:'Q2',options:['a','b'],correct_index:1,content_revision:'t'}]);
const [room] = await as(H, `select * from public.classroom_v2_create($1,$2::jsonb,30::smallint)`, [crypto.randomUUID(), qs]);
let host = (await as(H, `select public.classroom_v2_game_host($1) v`, [room.room_id]))[0].v;
ok(/^[A-HJKMNP-Z2-9]{6}$/.test(host.short_code), 'short code '+host.short_code);
ok(host.state==='lobby' && host.question===null && host.players.length===0, 'host lobby view');
const [p1] = await as(S1, `select * from public.classroom_v2_game_join($1,'Ann')`, [host.short_code.toLowerCase()]);
const [p2] = await as(S2, `select * from public.classroom_v2_game_join($1,'Ben')`, [host.short_code]);
ok(p1.player_id && p2.player_id, 'two students joined by short code (case-insensitive)');
let bad=null; try { await as(S1, `select * from public.classroom_v2_game_join('ZZZZZZ','x')`);} catch(e){bad=e.message}
ok(/ROOM_UNAVAILABLE/.test(bad||''), 'unknown code rejected');
ok((await as(H, `select public.classroom_v2_start($1,$2)`, [room.room_id, host.version]))[0].classroom_v2_start===true, 'start');
let pv = (await as(S1, `select public.classroom_v2_game_player($1,$2) v`, [room.room_id,p1.player_id]))[0].v;
ok(pv.question && !('correct_index' in pv.question) && pv.receipt===null, 'player sees question without key');
let forb=null; try{ await as(S2, `select public.classroom_v2_game_player($1,$2) v`, [room.room_id,p1.player_id]); }catch(e){forb=e.message}
ok(/FORBIDDEN/.test(forb||''), 'cannot read another player view');
try{ await as(S1, `select public.classroom_v2_game_host($1)`, [room.room_id]); forb=null;}catch(e){forb=e.message}
ok(/FORBIDDEN/.test(forb||''), 'student cannot read host view');
const qid = pv.question.id;
const [a1] = await as(S1, `select * from public.classroom_v2_answer($1,$2,$3,0::smallint)`, [room.room_id,p1.player_id,qid]);
const [a2] = await as(S2, `select * from public.classroom_v2_answer($1,$2,$3,2::smallint)`, [room.room_id,p2.player_id,qid]);
ok(a1.is_correct && a1.points>=500 && a1.points<=1000, 'speed points '+a1.points);
ok(!a2.is_correct && a2.points===0, 'wrong = 0');
host = (await as(H, `select public.classroom_v2_game_host($1) v`, [room.room_id]))[0].v;
ok(JSON.stringify(host.choice_counts)==='[1,0,1,0]' && host.answered===2, 'choice counts '+JSON.stringify(host.choice_counts));
ok(host.players[0].alias==='Ann' && host.players[0].last_points===a1.points, 'leaderboard order');
pv = (await as(S1, `select public.classroom_v2_game_player($1,$2) v`, [room.room_id,p1.player_id]))[0].v;
ok(pv.rank===1 && pv.streak===1 && pv.receipt.correct===true && pv.player_count===2, 'rank/streak '+pv.rank+'/'+pv.streak);
const pv2 = (await as(S2, `select public.classroom_v2_game_player($1,$2) v`, [room.room_id,p2.player_id]))[0].v;
ok(pv2.rank===2 && pv2.streak===0, 'loser rank/streak');
await as(H, `select public.classroom_v2_next($1,$2)`, [room.room_id, host.version]);
pv = (await as(S1, `select public.classroom_v2_game_player($1,$2) v`, [room.room_id,p1.player_id]))[0].v;
ok(pv.question.index===1 && pv.streak===1 && pv.receipt===null, 'Q2 open, streak kept while unanswered');
let taken=null; try { await as('00000000-0000-4000-8000-0000000000b3', `select * from public.classroom_v2_game_join($1,'ann')`, [host.short_code]); } catch(e){ taken=e.message }
ok(/ALIAS_TAKEN/.test(taken||''), 'duplicate name rejected (case-insensitive)');
const [late] = await as('00000000-0000-4000-8000-0000000000b4', `select * from public.classroom_v2_game_join($1,'Late Lily')`, [host.short_code]);
ok(late.state==='active', 'late join while active');
const lv = (await as('00000000-0000-4000-8000-0000000000b4', `select public.classroom_v2_game_player($1,$2) v`, [room.room_id, late.player_id]))[0].v;
ok(lv.question && lv.score===0 && lv.player_count===3, 'late joiner sees current question');
const [again] = await as(S1, `select * from public.classroom_v2_game_join($1,'Different name')`, [host.short_code]);
ok(again.player_id===p1.player_id, 'same actor rejoin keeps player');
host = (await as(H, `select public.classroom_v2_game_host($1) v`, [room.room_id]))[0].v;
await as(H, `select public.classroom_v2_finish($1,$2)`, [room.room_id, host.version]);
let closed=null; try { await as('00000000-0000-4000-8000-0000000000b5', `select * from public.classroom_v2_game_join($1,'Too late')`, [host.short_code]); } catch(e){ closed=e.message }
ok(/ROOM_UNAVAILABLE/.test(closed||''), 'cannot join a finished game');

// Boss Battle
const [b] = await as(H, `select * from public.classroom_v2_create($1,$2::jsonb,30::smallint)`, [crypto.randomUUID(), qs]);
ok((await as(H, `select public.classroom_v2_game_configure($1,'boss','chemistry') v`, [b.room_id]))[0].v===true, 'configure boss mode');
let deny=null; try { await as(S1, `select public.classroom_v2_game_configure($1,'classic',null)`, [b.room_id]); } catch(e){ deny=e.message }
ok(/FORBIDDEN/.test(deny||''), 'student cannot configure');
let bh = (await as(H, `select public.classroom_v2_game_host($1) v`, [b.room_id]))[0].v;
ok(bh.mode==='boss' && bh.boss.subject==='chemistry' && bh.boss.hp===null, 'boss in lobby, hp not frozen yet');
const [bp1] = await as(S1, `select * from public.classroom_v2_game_join($1,'Ann')`, [bh.short_code]);
const [bp2] = await as(S2, `select * from public.classroom_v2_game_join($1,'Ben')`, [bh.short_code]);
await as(H, `select public.classroom_v2_start($1,$2)`, [b.room_id, bh.version]);
bh = (await as(H, `select public.classroom_v2_game_host($1) v`, [b.room_id]))[0].v;
ok(bh.boss.hp===450*2*2 && bh.boss.damage===0, 'hp frozen at start: '+bh.boss.hp);
ok((await as(H, `select public.classroom_v2_game_configure($1,'classic',null) v`, [b.room_id]))[0].v===false, 'cannot change mode after start');
const bq = (await as(S1, `select public.classroom_v2_game_player($1,$2) v`, [b.room_id,bp1.player_id]))[0].v;
const [hit] = await as(S1, `select * from public.classroom_v2_answer($1,$2,$3,0::smallint)`, [b.room_id,bp1.player_id,bq.question.id]);
const bv = (await as(S2, `select public.classroom_v2_game_player($1,$2) v`, [b.room_id,bp2.player_id]))[0].v;
ok(bv.mode==='boss' && bv.boss.damage===hit.points && bv.boss.round_damage===hit.points, 'class damage visible to players: '+bv.boss.damage);
ok(bv.question && !('correct_index' in bv.question), 'boss view still hides the key');
const classic = (await as(H, `select public.classroom_v2_game_host($1) v`, [room.room_id]))[0].v;
ok(classic.mode==='classic' && classic.boss===null, 'classic rooms unaffected');

