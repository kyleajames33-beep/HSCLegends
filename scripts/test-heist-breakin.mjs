// Heist "Break-In" verification — the earn→raid→bank loop simulated with 4
// anon REST clients (each player = its own "device"), against the live DB.
// Deep economy edge-cases (caught/penalty/catcher/sentry-spend/teleport-void)
// are covered by the SQL simulation run at migration time; this script proves
// the anon-role surface: grants, arg marshalling, and a real multi-round match.
// Run: node scripts/test-heist-breakin.mjs  (~90s; drives real 18s rounds)
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } };
const fails = async (fn, args, match, name) => {
  try { await rpc(fn, args); ok(false, `${name} (no error thrown)`); }
  catch (e) { ok(String(e.message).includes(match), `${name} (${e.message.slice(0, 90)})`); }
};

// ── setup: private room, 4 players (join order alternates teams a,b,a,b) ──
console.log('\n[setup] private room + 4 players');
const [{ code, room_id: room }] = await rpc('heist_create', { p_subject: 'biology', p_year: 12, p_count: 12, p_public: false });
const P = [];
for (const alias of ['ProbeA', 'RaiderB', 'BankerA', 'HeistB']) {
  const [p] = await rpc('heist_join', { p_code: code, p_alias: alias });
  P.push({ alias, id: p.player_id, team: p.team });
}
ok(P[0].team === 'a' && P[1].team === 'b' && P[2].team === 'a' && P[3].team === 'b', 'teams balanced a/b/a/b');
await rpc('heist_start', { p_room: room });
let [st] = await rpc('heist_state', { p_room: room });
ok(st.status === 'active' && st.round === 0, 'game started');
ok(st.is_heist === false, 'is_heist retired (always false)');
ok(st.per_q_seconds === 18, 'pacing is 18s/question');
ok(st.raiders_a === 0 && st.raiders_b === 0, 'state exposes raid counts');

// ── 3 rounds: P0 probes the answer, everyone else answers correctly ──
console.log('\n[rounds] quiz engine: gold banks to the vault, energy charges');
let raiderEnergy = 0;
for (let r = 0; r < 3; r++) {
  [st] = await rpc('heist_state', { p_room: room });
  const probe = (await rpc('heist_submit', { p_player: P[0].id, p_round: r, p_choice: 0 }))[0];
  const ci = probe.correct_index;
  for (const p of P.slice(1)) {
    const res = (await rpc('heist_submit', { p_player: p.id, p_round: r, p_choice: ci }))[0];
    if (r === 0 && p === P[1]) {
      ok(res.correct === true && res.points >= 50, `correct answer scores (+${res.points}g)`);
      ok(res.energy >= 20 && res.energy <= 30, `correct answer charges energy (${res.energy}⚡)`);
      ok(res.stole === false, 'no auto-steal on submit');
    }
    if (p === P[1]) raiderEnergy = res.energy;
  }
  const deadline = new Date(st.round_started_at).getTime() + st.per_q_seconds * 1000;
  await sleep(Math.max(0, deadline - Date.now()) + 700);
  await rpc('heist_advance', { p_room: room, p_round: r });
}
[st] = await rpc('heist_state', { p_room: room });
ok(st.round === 3, 'self-driving clock advanced 3 rounds');
ok(st.gold_a > 100 && st.gold_b > 100, `both vaults funded (a=${st.gold_a}g b=${st.gold_b}g)`);
ok(raiderEnergy >= 60, `raider earned a raid over 3 answers (${raiderEnergy}⚡)`);

// ── grants / cheap validations ──
console.log('\n[surface] anon grants + server validations');
const [meB] = await rpc('heist_me', { p_player: P[1].id });
ok(meB && meB.energy === raiderEnergy && meB.team === 'b', 'heist_me snapshot');
const traps = await rpc('heist_get_traps', { p_room: room, p_team: 'a' });
ok(Array.isArray(traps) && traps.length === 0, 'heist_get_traps readable');
ok(Array.isArray(await rpc('heist_leaderboard', { p_days: 30 })), 'heist_leaderboard readable');
await fails('heist_place_trap', { p_player: P[0].id, p_x: 50, p_y: 60 }, 'energy', 'sentry rejected without energy');
await fails('heist_raid_start', { p_player: P[0].id }, 'energy', 'raid rejected without energy');
await fails('heist_raid_end', { p_raid: room, p_player: P[1].id, p_outcome: 'banked', p_rooms: 1, p_catcher: null, p_trap: null, p_cause: null }, 'Unknown raid', 'raid_end rejects unknown raid');

// ── the real thing: P1 (team b) breaks into vault A and banks room 1 ──
console.log('\n[raid] break-in: start → alarm visible → dwell → escape banked');
const [raid] = await rpc('heist_raid_start', { p_player: P[1].id });
ok(raid.target_team === 'a', 'raid targets the enemy vault');
ok(raid.energy === raiderEnergy - 60, `raid cost 60⚡ (${raiderEnergy}→${raid.energy})`);
ok(Array.isArray(raid.traps) && raid.traps.length === 0, 'sentry snapshot delivered');
[st] = await rpc('heist_state', { p_room: room });
ok(st.raiders_a === 1, 'alarm: state shows a live raid on vault A');
await fails('heist_raid_start', { p_player: P[1].id }, 'Already raiding', 'double raid blocked');

const goldABefore = st.gold_a, goldBBefore = st.gold_b;
await sleep(6000); // min plausible time for 1 room = 5s
const [end] = await rpc('heist_raid_end', { p_raid: raid.raid_id, p_player: P[1].id, p_outcome: 'banked', p_rooms: 1, p_catcher: null, p_trap: null, p_cause: null });
const expected = Math.max(5, Math.floor(goldABefore * 10 / 100));
ok(end.outcome === 'banked' && end.loot === expected, `banked 10% of vault A (${end.loot}g = ${expected}g)`);
[st] = await rpc('heist_state', { p_room: room });
ok(st.gold_a === goldABefore - end.loot && st.gold_b === goldBBefore + end.loot, 'gold moved vault→vault');
ok(st.raiders_a === 0, 'alarm cleared');
const [meB2] = await rpc('heist_me', { p_player: P[1].id });
ok(meB2.stolen === end.loot, `personal "stolen" credited (${meB2.stolen}g)`);
await fails('heist_raid_start', { p_player: P[1].id }, 'breath', '8s re-raid cooldown enforced');

// ── results shape (mid-game call is fine: it just ranks players) ──
const results = await rpc('heist_results', { p_room: room });
ok(results.length === 4 && 'stolen' in results[0] && 'catches' in results[0], 'results carry stolen/catches');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
