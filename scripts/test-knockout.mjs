// Fast Knockout backend sanity check (no timed waits): quick-join 2 players,
// start, read the question (answer must NOT leak), submit one answer.
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const URL = 'https://rerfrskojieacxthfavb.supabase.co/rest/v1/rpc';
async function rpc(fn, body) {
  const r = await fetch(`${URL}/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn} -> ${r.status}: ${t}`);
  return t ? JSON.parse(t) : null;
}

const [a] = await rpc('ko_quick_join', { p_subject: 'biology', p_year: 12, p_alias: 'Alice' });
const [b] = await rpc('ko_quick_join', { p_subject: 'biology', p_year: 12, p_alias: 'Bob' });
console.log('1. quick-join: same room?', a.room_id === b.room_id, ' code=', a.code);

await rpc('ko_start', { p_room: a.room_id });
const [s] = await rpc('ko_state', { p_room: a.room_id });
console.log('2. started: status=%s round=%s alive=%s/%s', s.status, s.round, s.alive, s.players);
console.log('   answer leaked in state?', JSON.stringify(s).toLowerCase().includes('correct'));
console.log('   Q:', (s.stem || '').slice(0, 55), '| opts:', (s.options || []).length);

const res = await rpc('ko_submit', { p_player: a.player_id, p_round: s.round, p_choice: 0 });
console.log('3. submit ch0 ->', JSON.stringify(res[0]));

// cleanup this test room
await fetch(`https://rerfrskojieacxthfavb.supabase.co/rest/v1/ko_rooms?id=eq.${a.room_id}`, {
  method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
}).catch(() => {});
console.log('4. cleaned up test room');
