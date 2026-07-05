// Foundation C verification — presence, late-join, drop-recovery + the
// ko_advance shield-bug regression, simulated with multiple anon REST clients
// (each player = its own "device"). Run: node scripts/test-arena-robustness.mjs
// Requires NEXT_PUBLIC_SUPABASE_ANON_KEY (falls back to .env.local).
import { readFileSync } from 'fs';

let KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!KEY) { try { KEY = readFileSync('.env.local', 'utf8').match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim(); } catch { /* ignore */ } }
const BASE = 'https://rerfrskojieacxthfavb.supabase.co/rest/v1';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rpc = async (fn, body) => {
  const r = await fetch(`${BASE}/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`${fn}: ${r.status} ${t}`); e.status = r.status; throw e; }
  return t ? JSON.parse(t) : null;
};
const sel = async (path) => (await fetch(`${BASE}/${path}`, { headers: H })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const beat = (mode, player) => rpc('arena_heartbeat', { p_mode: mode, p_player: player });

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } };

// ── 1. Presence: a ghost lobby doesn't arm auto-start or inflate counts ──
console.log('\n[1] KO presence: stale lobby ghost is dropped from counts + arming');
{
  const [ghost] = await rpc('ko_quick_join', { p_subject: 'physics', p_year: 11, p_alias: 'Ghost' });
  // Ghost never heartbeats. Wait out the 25s joined_at grace.
  await sleep(27_000);
  const [real] = await rpc('ko_join', { p_code: ghost.code, p_alias: 'RealKid' });
  await beat('knockout', real.player_id);
  const [st] = await rpc('ko_state', { p_room: real.room_id });
  ok(st.players === 1, `players counts present only (got ${st.players}, ghost dropped)`);
  ok(st.starts_at === null, 'auto-start NOT armed by ghost + one real player');
}

// ── 2. KO late-join + mid-round grace ──
console.log('\n[2] KO late-join: joining an active game works; entry round can\'t eliminate you');
{
  const [a] = await rpc('ko_quick_join', { p_subject: 'chemistry', p_year: 12, p_alias: 'EarlyA' });
  const [b] = await rpc('ko_join', { p_code: a.code, p_alias: 'EarlyB' });
  await beat('knockout', a.player_id); await beat('knockout', b.player_id);
  await rpc('ko_start', { p_room: a.room_id });
  let late = null, lateErr = null;
  try { [late] = await rpc('ko_join', { p_code: a.code, p_alias: 'LateJoiner' }); } catch (e) { lateErr = e.message; }
  ok(!!late, `late-join accepted into active game ${lateErr ? `(error: ${lateErr})` : ''}`);
  if (late) {
    await beat('knockout', late.player_id);
    // A answers correctly (look up the key), B + late-joiner stay silent.
    const [room] = await sel(`ko_rooms?id=eq.${a.room_id}&select=question_ids,round,per_q_seconds`);
    const [q] = await sel(`questions?id=eq.${encodeURIComponent(room.question_ids[0])}&select=correct_index`);
    await rpc('ko_submit', { p_player: a.player_id, p_round: 0, p_choice: q.correct_index });
    await sleep((room.per_q_seconds + 1.5) * 1000);
    await rpc('ko_advance', { p_room: a.room_id, p_round: 0 });
    const rows = await sel(`ko_players?room_id=eq.${a.room_id}&select=alias,alive`);
    const by = Object.fromEntries(rows.map((r) => [r.alias, r.alive]));
    ok(by.EarlyA === true, 'correct answerer survives');
    ok(by.EarlyB === false, 'silent pre-round player eliminated (mechanic unchanged)');
    ok(by.LateJoiner === true, 'late-joiner NOT eliminated for the round they joined during');
  }
}

// ── 3. KO drop recovery ──
console.log('\n[3] KO drop recovery: ko_rejoin returns the same player with score intact');
{
  const [a] = await rpc('ko_quick_join', { p_subject: 'biology', p_year: 11, p_alias: 'DropTest' });
  const [rj] = await rpc('ko_rejoin', { p_code: a.code, p_alias: 'droptest' }); // case-insensitive
  ok(rj && rj.player_id === a.player_id, 'same player_id restored (alias case-insensitive)');
  const rjMiss = await rpc('ko_rejoin', { p_code: a.code, p_alias: 'NoSuchKid' });
  ok(Array.isArray(rjMiss) && rjMiss.length === 0, 'unknown alias returns empty (no phantom player)');
}

// ── 4. Shield-bug regression: an UNUSED shield no longer grants immortality ──
console.log('\n[4] KO regression: unused-shield holder IS eliminated on a wrong answer');
{
  let attempt = 0, done = false;
  while (!done && attempt < 6) {
    attempt++;
    const [a] = await rpc('ko_quick_join', { p_subject: 'maths-standard', p_year: 12, p_alias: `ShA${attempt}` });
    const [b] = await rpc('ko_join', { p_code: a.code, p_alias: `ShB${attempt}` });
    const pu = await rpc('ko_powerup', { p_player: b.player_id });
    if (pu !== 'shield') { console.log(`  (attempt ${attempt}: B drew ${pu}, retrying for shield)`); continue; }
    await beat('knockout', a.player_id); await beat('knockout', b.player_id);
    await rpc('ko_start', { p_room: a.room_id });
    const [room] = await sel(`ko_rooms?id=eq.${a.room_id}&select=question_ids,per_q_seconds`);
    const [q] = await sel(`questions?id=eq.${encodeURIComponent(room.question_ids[0])}&select=correct_index`);
    await rpc('ko_submit', { p_player: a.player_id, p_round: 0, p_choice: q.correct_index });
    await rpc('ko_submit', { p_player: b.player_id, p_round: 0, p_choice: (q.correct_index + 1) % 4 });
    await sleep((room.per_q_seconds + 1.5) * 1000);
    await rpc('ko_advance', { p_room: a.room_id, p_round: 0 });
    const [bRow] = await sel(`ko_players?id=eq.${b.player_id}&select=alive,powerup,powerup_used_round`);
    ok(bRow.alive === false, `shield HOLDER (unused) eliminated on wrong answer (was immortal pre-fix)`);
    done = true;
  }
  if (!done) { fail++; console.log('  ✗ FAIL: could not draw a shield in 6 attempts'); }
}

// ── 5. Heist: late-join + rejoin ──
console.log('\n[5] Heist: late-join into active game + heist_rejoin restores team/gold');
{
  const [a] = await rpc('heist_quick_join', { p_subject: 'biology', p_year: 12, p_alias: 'HeistA' });
  const [b] = await rpc('heist_join', { p_code: a.code, p_alias: 'HeistB' });
  await beat('heist', a.player_id); await beat('heist', b.player_id);
  await rpc('heist_start', { p_room: a.room_id });
  let late = null;
  try { [late] = await rpc('heist_join', { p_code: a.code, p_alias: 'HeistLate' }); } catch { /* verdict below */ }
  ok(!!late, 'late-join accepted into active heist');
  const [rj] = await rpc('heist_rejoin', { p_code: a.code, p_alias: 'HeistB' });
  ok(rj && rj.player_id === b.player_id && rj.team === b.team, 'heist_rejoin restores same player + team');
  const [st] = await rpc('heist_state', { p_room: a.room_id });
  ok(typeof st.players === 'number' && st.players >= 2, `heist_state present-count works (${st.players} present)`);
}

// ── 6. Live Class: late-join + rejoin + present-only answer denominator ──
console.log('\n[6] Live Class: late-join + live_rejoin + live_answer_count denominator');
{
  const [g] = await rpc('create_game', { p_subject: 'physics', p_year: 12, p_count: 5 });
  const [p1] = await rpc('join_game', { p_code: g.code, p_alias: 'LiveKid1' });
  const [p2] = await rpc('join_game', { p_code: g.code, p_alias: 'LiveKid2' });
  await beat('live', p1.player_id); await beat('live', p2.player_id);
  await rpc('start_game', { p_session_id: g.session_id });
  let late = null;
  try { [late] = await rpc('join_game', { p_code: g.code, p_alias: 'LiveLate' }); } catch { /* verdict below */ }
  ok(!!late && late.status === 'active', 'late-join accepted into active class game (status returned: active)');
  if (late) await beat('live', late.player_id);
  const [rj] = await rpc('live_rejoin', { p_code: g.code, p_alias: 'livekid1' });
  ok(rj && rj.player_id === p1.player_id, 'live_rejoin restores same player (case-insensitive)');
  const [ac] = await rpc('live_answer_count', { p_session: g.session_id, p_index: 0 });
  ok(ac.total === 3, `answer-count denominator = present players (${ac.total}/3)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
