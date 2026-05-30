// End-to-end test of the Live Class Game RPCs via the anon key (no UI).
const URL = 'https://rerfrskojieacxthfavb.supabase.co/rest/v1/rpc';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REST = 'https://rerfrskojieacxthfavb.supabase.co/rest/v1';

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
async function select(path) {
  const r = await fetch(`${REST}/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  return r.json();
}

const [{ code, session_id }] = await rpc('create_game', { p_subject: 'biology', p_year: 11, p_count: 3 });
console.log('1. created game  code=%s  session=%s', code, session_id);

const [alice] = await rpc('join_game', { p_code: code, p_alias: 'Alice' });
const [bob] = await rpc('join_game', { p_code: code, p_alias: 'Bob' });
console.log('2. joined: Alice=%s  Bob=%s', alice.player_id.slice(0, 8), bob.player_id.slice(0, 8));

await rpc('start_game', { p_session_id: session_id });
console.log('3. started');

for (let idx = 0; idx < 3; idx++) {
  const [q] = await rpc('get_live_question', { p_session_id: session_id });
  const hasAnswer = JSON.stringify(q).includes('correct');
  console.log(`\n   Q${idx + 1}/${q.total}: ${q.stem.slice(0, 55)}…  (answer leaked? ${hasAnswer})`);
  const a = await rpc('submit_answer', { p_player_id: alice.player_id, p_index: idx, p_choice: 0 });
  const b = await rpc('submit_answer', { p_player_id: bob.player_id, p_index: idx, p_choice: 1 });
  console.log('     Alice ch0 ->', JSON.stringify(a[0]), '| Bob ch1 ->', JSON.stringify(b[0]));
  // double-submit guard
  try { await rpc('submit_answer', { p_player_id: alice.player_id, p_index: idx, p_choice: 2 }); console.log('     !! double-submit allowed'); }
  catch { console.log('     double-submit correctly rejected'); }
  await rpc('next_question', { p_session_id: session_id });
}

const players = await select(`game_players?session_id=eq.${session_id}&select=alias,score&order=score.desc`);
const session = await select(`game_sessions?id=eq.${session_id}&select=status`);
console.log('\n4. final status=%s', session[0].status);
console.log('   leaderboard:', players.map((p) => `${p.alias}:${p.score}`).join('  '));
