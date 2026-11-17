// Reactor Clash SQL rules (staging-clash.sql) in in-memory PGlite with a forgeable mock auth.uid().
// Run: node prototypes/classroom-v2/test/clash.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const dir = new URL('..', import.meta.url).pathname;
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;`);
for (const f of ['staging-candidate.sql', 'staging-game-layer.sql', 'staging-boss-battle.sql', 'staging-host-tools.sql', 'staging-question-sets.sql', 'staging-clash.sql']) await db.exec(fs.readFileSync(`${dir}/${f}`, 'utf8'));
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const H = uid(1), S = [uid(11), uid(12), uid(13)];
const as = async (u, sql, params = []) => { await db.exec(`select set_config('test.uid','${u}',false)`); return (await db.query(sql, params)).rows; };
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const fails = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(e.message); } };
await db.exec(`insert into classroom_v2_private.hosts(actor) values('${H}')`);

const pool = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ stem: `Q${i}`, options: ['a', 'b', 'c', 'd'], correct_index: i % 4, content_revision: 't' })));
ok(await fails(() => as(S[0], `select * from public.clash_create($1::jsonb, 240)`, [pool]), /FORBIDDEN/), 'students cannot create rooms');
ok(await fails(() => as(H, `select * from public.clash_create('[{"stem":"x","options":["a"],"correct_index":0}]'::jsonb, 240)`), /INVALID_CONTENT/), 'invalid pool rejected');
const [room] = await as(H, `select * from public.clash_create($1::jsonb, 240)`, [pool]);
ok(/^[A-HJKMNP-Z2-9]{6}$/.test(room.short_code), 'room code ' + room.short_code);

const joins = [];
for (const [i, s] of S.entries()) joins.push((await as(s, `select * from public.clash_join($1, $2)`, [room.short_code.toLowerCase(), `P${i}`]))[0]);
ok(joins[0].team === 'blue' && joins[1].team === 'orange' && joins[2].team === 'blue', 'teams auto-balance');
ok(await fails(() => as(uid(14), `select * from public.clash_join($1, 'p0')`, [room.short_code]), /ALIAS_TAKEN/), 'names unique per room');
const again = (await as(S[0], `select * from public.clash_join($1, 'Other')`, [room.short_code]))[0];
ok(again.player_id === joins[0].player_id && again.token === joins[0].token, 'rejoin returns the same player and token');

const hv = (await as(H, `select public.clash_host_view($1) v`, [room.room_id]))[0].v;
ok(hv.players.length === 3 && hv.players.every(p => p.token), 'host sees players with tokens');
ok(await fails(() => as(S[0], `select public.clash_host_view($1)`, [room.room_id]), /FORBIDDEN/), 'students cannot see tokens');
ok(await fails(() => as(S[0], `select public.clash_question($1,$2)`, [room.room_id, joins[0].player_id]), /STALE_QUESTION/), 'no questions before start');
ok((await as(H, `select public.clash_start($1) v`, [room.room_id]))[0].v === true, 'host starts');

const q1 = (await as(S[0], `select public.clash_question($1,$2) v`, [room.room_id, joins[0].player_id]))[0].v;
ok(q1.stem && !('correct_index' in q1), 'question has no key');
const q1b = (await as(S[0], `select public.clash_question($1,$2) v`, [room.room_id, joins[0].player_id]))[0].v;
ok(q1b.issue_id === q1.issue_id, 'asking again returns the same open question (no re-roll)');
ok(await fails(() => as(S[1], `select public.clash_question($1,$2)`, [room.room_id, joins[0].player_id]), /FORBIDDEN/), "cannot ask for another player's question");
ok(await fails(() => as(S[1], `select public.clash_answer($1,$2,$3,0::smallint)`, [room.room_id, joins[1].player_id, q1.issue_id]), /STALE_QUESTION/), "cannot answer another player's question");
const idx = Number(q1.stem.slice(1));
const a1 = (await as(S[0], `select public.clash_answer($1,$2,$3,$4::smallint) v`, [room.room_id, joins[0].player_id, q1.issue_id, idx % 4]))[0].v;
ok(a1.correct === true && a1.correct_index === idx % 4, 'correct answer recorded');
const a1b = (await as(S[0], `select public.clash_answer($1,$2,$3,$4::smallint) v`, [room.room_id, joins[0].player_id, q1.issue_id, (idx + 1) % 4]))[0].v;
ok(a1b.correct === true && a1b.choice === idx % 4, 'answer cannot be changed after the fact');
const q2 = (await as(S[1], `select public.clash_question($1,$2) v`, [room.room_id, joins[1].player_id]))[0].v;
await as(S[1], `select public.clash_answer($1,$2,$3,$4::smallint) v`, [room.room_id, joins[1].player_id, q2.issue_id, (Number(q2.stem.slice(1)) + 1) % 4]);
let rec = (await as(H, `select public.clash_receipts($1, 0) v`, [room.room_id]))[0].v;
ok(rec.length === 2 && rec[0].player_id === joins[0].player_id && rec[0].correct && !rec[1].correct, 'host receives receipts in order');
rec = (await as(H, `select public.clash_receipts($1, $2) v`, [room.room_id, rec[0].seq]))[0].v;
ok(rec.length === 1, 'receipts since a sequence number');
ok(await fails(() => as(S[0], `select public.clash_receipts($1, 0)`, [room.room_id]), /FORBIDDEN/), 'students cannot read receipts');
const me = (await as(S[0], `select public.clash_me($1,$2) v`, [room.room_id, joins[0].player_id]))[0].v;
ok(me.state === 'active' && me.correct === 1, 'player view');
ok((await as(H, `select public.clash_finish($1, '{"winner":"blue"}'::jsonb) v`, [room.room_id]))[0].v === true, 'host finishes');
ok(await fails(() => as(S[0], `select public.clash_question($1,$2)`, [room.room_id, joins[0].player_id]), /STALE_QUESTION/), 'no questions after finish');
const rep = (await as(H, `select public.clash_report($1) v`, [room.room_id]))[0].v;
ok(rep.length === 3 && rep.find(r => r.alias === 'P1').missed.length === 1, 'report lists missed questions');
ok(await fails(() => as(uid(15), `select * from public.clash_join($1, 'Late')`, [room.short_code]), /ROOM_UNAVAILABLE/), 'cannot join a finished room');
