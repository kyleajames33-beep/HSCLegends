'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import { celebrate } from '@/lib/confetti';
import Avatar from '@/components/avatar';
import {
  koQuickJoin, koJoin, koState, koMyState, koSubmit, koStart, koAdvance, koResults,
  subscribeRoom, type KoState, type KoMe, type KoResult,
} from '@/lib/knockout';

const ARENA = 'linear-gradient(165deg,#16182a 0%,#2d3142 45%,#4e4068 100%)';

export default function KnockoutPage() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [alias, setAlias] = useState('');
  const [subject, setSubject] = useState<Subject>('biology');
  const [year, setYear] = useState<11 | 12>(12);
  const [code, setCode] = useState('');

  const [room, setRoom] = useState('');
  const [player, setPlayer] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [st, setSt] = useState<KoState | null>(null);
  const [me, setMe] = useState<KoMe | null>(null);
  const [answered, setAnswered] = useState<{ correct: boolean; correct_index: number; points: number } | null>(null);
  const [results, setResults] = useState<KoResult[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [koFlash, setKoFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const roundRef = useRef({ round: -2, alive: 0 });

  const subRef = useRef<(() => void) | null>(null);
  const drive = useRef({ st: null as KoState | null, room: '', startFired: false, advanceRound: -2 });
  drive.current.st = st;
  drive.current.room = room;
  const answeredRound = useRef(-1);

  useEffect(() => {
    if (user && !alias) setAlias((user.email ?? '').split('@')[0].slice(0, 16));
  }, [user, alias]);
  useEffect(() => () => subRef.current?.(), []);

  async function sync(rm = room, pl = player) {
    if (!rm) return;
    const s = await koState(sb, rm);
    setSt(s);
    const pr = roundRef.current;
    if (s.status === 'active' && s.round > pr.round && pr.round >= 0 && pr.alive > s.alive) {
      setKoFlash(pr.alive - s.alive);
      setTimeout(() => setKoFlash(0), 1800);
    }
    roundRef.current = { round: s.round, alive: s.alive };
    if (pl) setMe(await koMyState(sb, pl));
    if (s.round !== answeredRound.current) setAnswered(null);
    if (s.status === 'finished' && results.length === 0) setResults(await koResults(sb, rm));
  }
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // self-driving clock: start the game when the lobby countdown ends; advance a
  // round when its timer expires (idempotent server-side).
  useEffect(() => {
    const t = setInterval(() => {
      const d = drive.current;
      const ms = Date.now();
      setNow(ms);
      if (!d.st || !d.room) return;
      if (d.st.status === 'lobby' && d.st.starts_at && ms >= new Date(d.st.starts_at).getTime() && !d.startFired) {
        d.startFired = true;
        koStart(sb, d.room).then(() => syncRef.current());
      }
      if (d.st.status === 'active' && d.st.round_started_at) {
        const deadline = new Date(d.st.round_started_at).getTime() + d.st.per_q_seconds * 1000;
        if (ms >= deadline + 400 && d.advanceRound !== d.st.round) {
          d.advanceRound = d.st.round;
          koAdvance(sb, d.room, d.st.round).then(() => syncRef.current());
        }
      }
    }, 500);
    return () => clearInterval(t);
  }, [sb]);

  const celebrated = useRef(false);
  useEffect(() => {
    if (st?.status === 'finished' && results.length && !celebrated.current) {
      const mine = results.find((r) => r.is_me);
      if (mine?.rank === 1) { celebrated.current = true; celebrate(true); }
    }
  }, [st?.status, results]);

  async function enter(rm: string, pl: string) {
    setRoom(rm); setPlayer(pl);
    drive.current.startFired = false; drive.current.advanceRound = -2;
    subRef.current?.();
    subRef.current = subscribeRoom(sb, rm, () => syncRef.current(rm, pl));
    await sync(rm, pl);
  }

  async function quickPlay() {
    if (!alias.trim()) return;
    setBusy(true); setErr('');
    try { const r = await koQuickJoin(sb, subject, year, alias); setCode(r.code); sb.rpc('increment_quest', { p_metric: 'arena_game', p_amount: 1 }).then(undefined, () => {}); await enter(r.room_id, r.player_id); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function joinByCode() {
    if (joinCode.length < 6 || !alias.trim()) return;
    setBusy(true); setErr('');
    try { const r = await koJoin(sb, joinCode, alias); setCode(joinCode); sb.rpc('increment_quest', { p_metric: 'arena_game', p_amount: 1 }).then(undefined, () => {}); await enter(r.room_id, r.player_id); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function answer(choice: number) {
    if (!st) return;
    setBusy(true);
    try {
      const r = await koSubmit(sb, player, st.round, choice);
      answeredRound.current = st.round;
      setAnswered(r);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  function reset() {
    subRef.current?.();
    setRoom(''); setPlayer(''); setSt(null); setMe(null); setResults([]); setAnswered(null); setJoinCode('');
  }

  const secs = (target: string | null, add = 0) =>
    target ? Math.max(0, Math.ceil((new Date(target).getTime() + add - now) / 1000)) : 0;

  // ---------- PICK ----------
  if (!room) {
    return (
      <Arena>
        <h1 className="text-3xl font-display font-extrabold">☠️ Knockout</h1>
        <p className="text-white/60 mt-1 text-sm">Battle royale. Answer right or get eliminated. Last Legend standing wins.</p>

        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Your name" maxLength={20}
          className="mt-5 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50" />

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {SUBJECTS.map((s) => (
            <button key={s.id} onClick={() => setSubject(s.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${subject === s.id ? 'bg-white text-ink' : 'bg-white/10 text-white/80'}`}>{s.label}</button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {[11, 12].map((y) => (
            <button key={y} onClick={() => setYear(y as 11 | 12)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${year === y ? 'bg-gold text-ink' : 'bg-white/10 text-white/80'}`}>Year {y}</button>
          ))}
        </div>

        <button onClick={quickPlay} disabled={busy || !alias.trim()}
          className="mt-6 w-full rounded-2xl bg-gold text-ink px-6 py-5 text-lg font-display font-extrabold active:translate-y-0.5 disabled:opacity-40"
          style={{ boxShadow: '0 4px 0 #a87f3f' }}>
          ⚡ Quick Play
        </button>

        <div className="mt-4 flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
            placeholder="CODE" className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 tracking-[0.2em] text-white placeholder-white/40 outline-none focus:border-white/50" />
          <button onClick={joinByCode} disabled={busy || joinCode.length < 6 || !alias.trim()}
            className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Join</button>
        </div>
        {err && <p className="mt-3 text-rose-300 text-sm">{err}</p>}
        <Link href="/" className="mt-6 text-center text-sm text-white/50 underline">Home</Link>
      </Arena>
    );
  }

  // ---------- LOBBY ----------
  if (st?.status === 'lobby') {
    const enough = st.players >= 2;
    const countdown = secs(st.starts_at);
    return (
      <Arena>
        <p className="text-white/60 text-sm font-semibold">SHARE TO JOIN</p>
        <div className="text-6xl font-display font-black tracking-[0.2em] text-center py-5">{code}</div>
        <p className="text-center text-2xl font-display font-extrabold">
          {enough ? (countdown > 0 ? `Starting in ${countdown}…` : 'Starting…') : 'Waiting for players…'}
        </p>
        <p className="text-center text-white/60 mt-1">{st.players} in the arena</p>
        {!enough && <p className="text-center text-white/40 text-sm mt-2">Needs at least 2 players to start.</p>}
        {err && <p className="mt-3 text-rose-300 text-sm text-center">{err}</p>}
        <button onClick={reset} className="mt-8 text-center text-sm text-white/50 underline">Leave</button>
      </Arena>
    );
  }

  // ---------- FINISHED ----------
  if (st?.status === 'finished') {
    const mine = results.find((r) => r.is_me);
    const rounds = mine ? (mine.alive ? st.total : (mine.eliminated_round ?? 0) + 1) : 0;
    const xp = mine ? 15 + rounds * 8 + (mine.alive ? 70 : 0) : 0;
    return (
      <Arena>
        <p className="text-gold font-display font-bold text-sm">KNOCKOUT OVER</p>
        <div className="text-center my-3">
          <div className="text-7xl">{mine?.rank === 1 ? '👑' : mine && mine.rank <= 3 ? '🏆' : '💀'}</div>
          <h1 className="mt-2 text-3xl font-display font-extrabold">{mine ? `#${mine.rank}` : 'Done'}</h1>
          {mine && (user
            ? <p className="mt-1 text-gold font-display font-bold">+{xp} XP · saved to your League</p>
            : <p className="mt-1 text-white/60 text-sm">Sign in before a game to earn XP.</p>)}
        </div>
        <ol className="space-y-2">
          {results.slice(0, 8).map((r) => (
            <li key={r.rank} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.is_me ? 'bg-gold/25 border border-gold/60' : 'bg-white/10'}`}>
              <span className="w-6 text-center">{r.rank === 1 ? '👑' : r.rank}</span>
              <Avatar seed={r.alias} size={34} className="rounded-full shrink-0" />
              <span className="font-medium flex-1 truncate">{r.alias}{r.is_me ? ' (you)' : ''}</span>
              <span className="tabular-nums font-bold">{r.score}</span>
            </li>
          ))}
        </ol>
        <button onClick={reset} className="mt-8 w-full rounded-2xl bg-gold text-ink px-6 py-4 font-display font-extrabold" style={{ boxShadow: '0 4px 0 #a87f3f' }}>
          Play again
        </button>
        <Link href="/" className="mt-3 text-center text-sm text-white/50 underline">Home</Link>
      </Arena>
    );
  }

  // ---------- ACTIVE (round) ----------
  const eliminated = me && !me.alive;
  const tLeft = secs(st?.round_started_at ?? null, (st?.per_q_seconds ?? 0) * 1000);
  return (
    <Arena wide>
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60">Q{(st?.round ?? 0) + 1}/{st?.total ?? 0}</span>
        <span className="font-bold">🟢 {st?.alive ?? 0} alive</span>
        <span className={`font-bold tabular-nums ${tLeft <= 3 ? 'text-rose-300' : 'text-white'}`}>{tLeft}s</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-black/30 overflow-hidden">
        <div className="h-full bg-gold transition-[width] duration-200"
          style={{ width: `${st?.per_q_seconds ? (tLeft / st.per_q_seconds) * 100 : 0}%` }} />
      </div>

      {koFlash > 0 && (
        <div className="mt-2 rounded-xl bg-rose-500/30 border border-rose-400/50 px-4 py-2 text-center font-display font-extrabold animate-pulse">
          💀 {koFlash} knocked out!
        </div>
      )}
      {eliminated && (
        <div className="mt-4 rounded-xl bg-black/30 border border-white/10 px-4 py-2 text-center text-sm">
          💀 You’re out{me?.eliminated_round != null ? ` — survived ${me.eliminated_round + 1} rounds` : ''}. Watching…
        </div>
      )}

      <h2 className="mt-4 text-xl md:text-3xl md:text-center font-display font-bold leading-snug"><MathText text={st?.stem ?? ''} /></h2>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(st?.options ?? []).map((o, i) => (
          <AnswerTile key={i} index={i}
            disabled={busy || !!answered || !!eliminated || tLeft <= 0}
            onClick={eliminated ? undefined : () => answer(i)}
            reveal={answered ? (i === answered.correct_index ? 'correct' : 'dim') : null}>
            <MathText text={o} />
          </AnswerTile>
        ))}
      </div>

      {answered && !eliminated && (
        <p className={`mt-4 text-center font-display font-extrabold ${answered.correct ? 'text-green-300' : 'text-rose-300'}`}>
          {answered.correct ? `✓ +${answered.points} — survive the round!` : '✗ Wrong — you might be out…'}
        </p>
      )}
      {err && <p className="mt-3 text-rose-300 text-sm text-center">{err}</p>}
    </Arena>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
function Arena({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex flex-1 flex-col w-full text-white" style={{ background: ARENA }}>
      <div
        className={`flex flex-1 flex-col w-full mx-auto px-6 pt-12 pb-10 ${
          wide ? 'max-w-md md:max-w-6xl md:justify-center md:px-12' : 'max-w-md'
        }`}
      >
        {children}
      </div>
    </main>
  );
}
