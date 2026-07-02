'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { koJoin, koState, koSubmit } from '@/lib/knockout';
import { heistJoin, heistState, heistSubmit } from '@/lib/heist';
import { joinGame, getLiveQuestion, submitAnswer } from '@/lib/live';

// Dev tool: spawn guest "bots" that join a live game by code and auto-answer,
// so multiplayer modes can be tested solo. Bots answer deterministically
// (choice = (botIndex + round) % options) — a spread of right/wrong, no RNG.
type Mode = 'knockout' | 'live' | 'heist';
type Bot = { alias: string; playerId: string };

export default function BotsPage() {
  const sb = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<Mode>('knockout');
  const [code, setCode] = useState('');
  const [count, setCount] = useState(5);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const botsRef = useRef<Bot[]>([]);
  const roomRef = useRef('');           // ko room_id or live session_id
  const lastRoundRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const add = (m: string) => setLog((l) => [m, ...l].slice(0, 50));

  async function spawn() {
    if (running) return;
    if (!code.trim()) { add('⚠️ Enter the game code first.'); return; }
    setRunning(true);
    setLog([]);
    lastRoundRef.current = -1;
    try {
      const bots: Bot[] = [];
      for (let i = 0; i < count; i++) {
        const alias = `Bot ${i + 1}`;
        if (mode === 'knockout') {
          const r = await koJoin(sb, code.trim(), alias);
          if (i === 0) roomRef.current = r.room_id;
          bots.push({ alias, playerId: r.player_id });
        } else if (mode === 'heist') {
          const r = await heistJoin(sb, code.trim(), alias);
          if (i === 0) roomRef.current = r.room_id;
          bots.push({ alias, playerId: r.player_id });
        } else {
          const r = await joinGame(sb, code.trim(), alias);
          if (i === 0) roomRef.current = r.session_id;
          bots.push({ alias, playerId: r.player_id });
        }
        add(`✅ ${alias} joined`);
      }
      botsRef.current = bots;
      add(`${bots.length} bots in. Now START the game on your screen — they'll auto-answer each round.`);
      timerRef.current = setInterval(tick, 1500);
    } catch (e) {
      add('❌ ' + (e instanceof Error ? e.message : 'join failed (check the code / mode)'));
      setRunning(false);
    }
  }

  async function tick() {
    const room = roomRef.current;
    if (!room) return;
    try {
      if (mode === 'knockout') {
        const st = await koState(sb, room);
        if (st.status === 'finished') { add('🏁 Game finished.'); stop(); return; }
        if (st.status !== 'active' || !st.options) return;
        if (st.round === lastRoundRef.current) return;
        lastRoundRef.current = st.round;
        const n = st.options.length;
        botsRef.current.forEach((b, i) => {
          koSubmit(sb, b.playerId, st.round, (i + st.round) % n).then(undefined, () => {});
        });
        add(`Round ${st.round + 1}: bots answered · ${st.alive} alive`);
      } else if (mode === 'heist') {
        const st = await heistState(sb, room);
        if (st.status === 'finished') { add('🏁 Heist finished.'); stop(); return; }
        if (st.status !== 'active' || !st.options) return;
        if (st.round === lastRoundRef.current) return;
        lastRoundRef.current = st.round;
        const n = st.options.length;
        botsRef.current.forEach((b, i) => {
          heistSubmit(sb, b.playerId, st.round, (i + st.round) % n).then(undefined, () => {});
        });
        add(`Round ${st.round + 1}: bots answered · 🔴${st.gold_a} 🟣${st.gold_b}${st.is_heist ? ' · HEIST!' : ''}`);
      } else {
        const q = await getLiveQuestion(sb, room);
        if (q.status === 'complete') { add('🏁 Game complete.'); stop(); return; }
        if (q.status !== 'active' || !q.options) return;
        if (q.index === lastRoundRef.current) return;
        lastRoundRef.current = q.index;
        const n = q.options.length;
        botsRef.current.forEach((b, i) => {
          submitAnswer(sb, b.playerId, q.index, (i + q.index) % n).then(undefined, () => {});
        });
        add(`Q${q.index + 1}: ${botsRef.current.length} bots answered`);
      }
    } catch { /* transient — ignore */ }
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
  }

  return (
    <main className="flex flex-1 flex-col px-6 pt-10 pb-10 w-full mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold text-ink">🤖 Bot Harness <span className="text-xs text-muted">(dev)</span></h1>
      <p className="mt-1 text-sm text-inksoft">Test multiplayer solo: bots join your game by code and auto-answer.</p>

      <ol className="mt-3 list-decimal pl-5 text-xs text-muted space-y-0.5">
        <li><b>Knockout:</b> <code>/knockout</code> → join → copy lobby code. <b>Heist:</b> <code>/heist</code> → join → copy code. <b>Live:</b> <code>/host</code> → create → copy code.</li>
        <li>Pick the matching mode below, paste the code, set how many bots, hit Spawn.</li>
        <li>Start/advance the game on your screen — bots answer automatically.</li>
      </ol>

      <div className="mt-5 flex gap-2">
        {(['knockout', 'heist', 'live'] as Mode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)} disabled={running}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${mode === m ? 'bg-plum text-white' : 'bg-parchment-deep text-ink'}`}>
            {m === 'knockout' ? '☠️ Knockout' : m === 'heist' ? '💰 Heist' : '🎪 Live'}
          </button>
        ))}
      </div>

      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="GAME CODE" disabled={running}
        className="lg-card mt-3 w-full px-4 py-3 font-mono text-lg tracking-widest text-ink placeholder:text-muted" />

      <div className="mt-3 flex items-center gap-3">
        <label className="text-sm text-inksoft">Bots:</label>
        <input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
          disabled={running} className="lg-card w-20 px-3 py-2 text-center font-bold text-ink" />
        {!running ? (
          <button onClick={spawn} className="lg-btn lg-btn-primary flex-1 px-4 py-2.5">🤖 Spawn bots</button>
        ) : (
          <button onClick={stop} className="lg-btn lg-btn-berry flex-1 px-4 py-2.5">Stop</button>
        )}
      </div>

      <div className="mt-5 rounded-2xl bg-ink/90 px-4 py-3 font-mono text-xs text-white/90 h-64 overflow-y-auto">
        {log.length === 0 ? <span className="text-white/40">activity log…</span> : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </main>
  );
}
