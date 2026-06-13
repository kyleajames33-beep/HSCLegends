// Full timed Knockout simulation: plays a real game to a winner, verifying the
// elimination + auto-advance + results logic. Takes ~1 min (waits out round timers).
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = 'https://rerfrskojieacxthfavb.supabase.co/rest/v1';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const rpc = async (fn, body) => {
  const r = await fetch(`${BASE}/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
};
const sel = async (path) => (await fetch(`${BASE}/${path}`, { headers: H })).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const players = [];
for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
  const [j] = await rpc('ko_quick_join', { p_subject: 'biology', p_year: 12, p_alias: name });
  players.push({ id: j.player_id, name, room: j.room_id });
}
const room = players[0].room;
console.log('joined %d players, same room: %s', players.length, players.every((p) => p.room === room));

await rpc('ko_start', { p_room: room });

for (let guard = 0; guard < 16; guard++) {
  const [s] = await rpc('ko_state', { p_room: room });
  if (s.status !== 'active') break;
  const live = await sel(`ko_players?room_id=eq.${room}&alive=eq.true&select=id`);
  const liveIds = live.map((p) => p.id);

  // scout learns the answer, then force >=1 correct and (if possible) >=1 wrong
  let ci = 0;
  for (let i = 0; i < liveIds.length; i++) {
    const pid = liveIds[i];
    let choice = 0;
    if (i === 0) choice = 0;
    else choice = i % 2 === 1 ? ci : (ci + 1) % 4; // odd index correct, even index wrong
    const r = await rpc('ko_submit', { p_player: pid, p_round: s.round, p_choice: choice }).catch(() => null);
    if (i === 0 && r) ci = r[0].correct_index;
  }

  await sleep((s.per_q_seconds + 1) * 1000);
  await rpc('ko_advance', { p_room: room, p_round: s.round });
  const aliveNow = (await sel(`ko_players?room_id=eq.${room}&alive=eq.true&select=id`)).length;
  console.log('round %d (%ds): %d alive after', s.round, s.per_q_seconds, aliveNow);
}

const res = await rpc('ko_results', { p_room: room });
console.log('\nFINAL:');
res.forEach((r) => console.log('  #%d %s — %d pts %s', r.rank, r.alias, r.score, r.alive ? '👑 WINNER' : `(out R${r.eliminated_round + 1})`));
await fetch(`${BASE}/ko_rooms?id=eq.${room}`, { method: 'DELETE', headers: H }).catch(() => {});
