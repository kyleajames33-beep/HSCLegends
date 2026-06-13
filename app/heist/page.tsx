'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import { celebrate } from '@/lib/confetti';
import {
  heistQuickJoin, heistJoin, heistState, heistSubmit, heistStart, heistAdvance, heistResults,
  subscribeHeist, type HeistState, type HeistResult,
} from '@/lib/heist';

const VAULT = 'linear-gradient(165deg,#16182a 0%,#243d5e 55%,#a87f3f 140%)';
const TEAM = { a: { name: 'Crimson', color: '#c47b8a', deep: '#9c5c6e' }, b: { name: 'Violet', color: '#8a86d6', deep: '#4e4068' } };

export default function HeistPage() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [alias, setAlias] = useState('');
  const [subject, setSubject] = useState<Subject>('biology');
  const [year, setYear] = useState<11 | 12>(12);
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const [room, setRoom] = useState('');
  const [player, setPlayer] = useState('');
  const [myTeam, setMyTeam] = useState<'a' | 'b'>('a');
  const [st, setSt] = useState<HeistState | null>(null);
  const [answered, setAnswered] = useState<{ correct: boolean; correct_index: number; points: number; stole: boolean } | null>(null);
  const [results, setResults] = useState<HeistResult[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const subRef = useRef<(() => void) | null>(null);
  const drive = useRef({ st: null as HeistState | null, room: '', startFired: false, advRound: -2 });
  drive.current.st = st; drive.current.room = room;
  const ansRound = useRef(-1);
  const celebrated = useRef(false);

  useEffect(() => { if (user && !alias) setAlias((user.email ?? '').split('@')[0].slice(0, 16)); }, [user, alias]);
  useEffect(() => () => subRef.current?.(), []);

  async function sync(rm = room) {
    if (!rm) return;
    const s = await heistState(sb, rm);
    setSt(s);
    if (s.round !== ansRound.current) setAnswered(null);
    if (s.status === 'finished' && results.length === 0) setResults(await heistResults(sb, rm));
  }
  const syncRef = useRef(sync); syncRef.current = sync;

  useEffect(() => {
    const t = setInterval(() => {
      const d = drive.current; const ms = Date.now(); setNow(ms);
      if (!d.st || !d.room) return;
      if (d.st.status === 'lobby' && d.st.starts_at && ms >= new Date(d.st.starts_at).getTime() && !d.startFired) {
        d.startFired = true; heistStart(sb, d.room).then(() => syncRef.current());
      }
      if (d.st.status === 'active' && d.st.round_started_at) {
        const dl = new Date(d.st.round_started_at).getTime() + d.st.per_q_seconds * 1000;
        if (ms >= dl + 400 && d.advRound !== d.st.round) { d.advRound = d.st.round; heistAdvance(sb, d.room, d.st.round).then(() => syncRef.current()); }
      }
    }, 500);
    return () => clearInterval(t);
  }, [sb]);

  useEffect(() => {
    if (st?.status === 'finished' && !celebrated.current) {
      const meWon = (myTeam === 'a' && st.gold_a > st.gold_b) || (myTeam === 'b' && st.gold_b > st.gold_a);
      if (meWon) { celebrated.current = true; celebrate(true); }
    }
  }, [st?.status, st?.gold_a, st?.gold_b, myTeam]);

  async function enter(rm: string, pl: string, team: 'a' | 'b') {
    setRoom(rm); setPlayer(pl); setMyTeam(team);
    drive.current.startFired = false; drive.current.advRound = -2;
    subRef.current?.();
    subRef.current = subscribeHeist(sb, rm, () => syncRef.current(rm));
    await sync(rm);
  }
  async function quickPlay() {
    if (!alias.trim()) return;
    setBusy(true); setErr('');
    try { const r = await heistQuickJoin(sb, subject, year, alias); setCode(r.code); await enter(r.room_id, r.player_id, r.team); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function joinByCode() {
    if (joinCode.length < 6 || !alias.trim()) return;
    setBusy(true); setErr('');
    try { const r = await heistJoin(sb, joinCode, alias); setCode(joinCode); await enter(r.room_id, r.player_id, r.team); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function answer(choice: number) {
    if (!st || answered) return;
    setBusy(true);
    try { const r = await heistSubmit(sb, player, st.round, choice); ansRound.current = st.round; setAnswered(r); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  function reset() { subRef.current?.(); setRoom(''); setPlayer(''); setSt(null); setResults([]); setAnswered(null); celebrated.current = false; }

  const secs = (target: string | null, add = 0) => target ? Math.max(0, Math.ceil((new Date(target).getTime() + add - now) / 1000)) : 0;

  // PICK
  if (!room) {
    return (
      <Vault>
        <h1 className="text-3xl font-display font-extrabold">💰 Heist</h1>
        <p className="text-white/60 mt-1 text-sm">Two teams. Bank gold — and on HEIST rounds, rob the other team blind. Most gold wins.</p>
        <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Your name" maxLength={20}
          className="mt-5 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-white/50" />
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {SUBJECTS.map((s) => (
            <button key={s.id} onClick={() => setSubject(s.id)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${subject === s.id ? 'bg-white text-ink' : 'bg-white/10 text-white/80'}`}>{s.label}</button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {[11, 12].map((y) => (<button key={y} onClick={() => setYear(y as 11 | 12)} className={`rounded-full px-3 py-1 text-sm font-semibold ${year === y ? 'bg-gold text-ink' : 'bg-white/10 text-white/80'}`}>Year {y}</button>))}
        </div>
        <button onClick={quickPlay} disabled={busy || !alias.trim()} className="mt-6 w-full rounded-2xl bg-gold text-ink px-6 py-5 text-lg font-display font-extrabold active:translate-y-0.5 disabled:opacity-40" style={{ boxShadow: '0 4px 0 #a87f3f' }}>💰 Quick Play</button>
        <div className="mt-4 flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))} placeholder="CODE" className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 tracking-[0.2em] text-white placeholder-white/40 outline-none focus:border-white/50" />
          <button onClick={joinByCode} disabled={busy || joinCode.length < 6 || !alias.trim()} className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Join</button>
        </div>
        {err && <p className="mt-3 text-rose-300 text-sm">{err}</p>}
        <Link href="/" className="mt-6 text-center text-sm text-white/50 underline">Home</Link>
      </Vault>
    );
  }

  // LOBBY
  if (st?.status === 'lobby') {
    const cd = secs(st.starts_at);
    return (
      <Vault>
        <p className="text-white/60 text-sm font-semibold">SHARE TO JOIN</p>
        <div className="text-6xl font-display font-black tracking-[0.2em] text-center py-5">{code}</div>
        <p className="text-center text-2xl font-display font-extrabold">{st.players >= 2 ? (cd > 0 ? `Starting in ${cd}…` : 'Starting…') : 'Waiting for crew…'}</p>
        <p className="text-center text-white/60 mt-1">{st.players} in · you’re on <span style={{ color: TEAM[myTeam].color }} className="font-bold">{TEAM[myTeam].name}</span></p>
        <button onClick={reset} className="mt-8 text-center text-sm text-white/50 underline">Leave</button>
      </Vault>
    );
  }

  // FINISHED
  if (st?.status === 'finished') {
    const winner = st.gold_a > st.gold_b ? 'a' : st.gold_b > st.gold_a ? 'b' : null;
    const meWon = winner === myTeam;
    return (
      <Vault>
        <p className="text-gold font-display font-bold text-sm">HEIST OVER</p>
        <div className="text-center my-2">
          <div className="text-6xl">{winner == null ? '🤝' : meWon ? '🏆' : '💔'}</div>
          <h1 className="mt-1 text-3xl font-display font-extrabold">{winner == null ? 'Draw!' : `${TEAM[winner].name} wins!`}</h1>
        </div>
        <GoldBar a={st.gold_a} b={st.gold_b} />
        <div className="mt-5 text-sm text-white/60">Top crew</div>
        <ol className="mt-2 space-y-2">
          {results.slice(0, 8).map((r, i) => (
            <li key={i} className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${r.is_me ? 'bg-gold/25 border border-gold/60' : 'bg-white/10'}`}>
              <span className="font-medium"><span style={{ color: TEAM[r.team].color }}>●</span> {r.alias}{r.is_me ? ' (you)' : ''}</span>
              <span className="tabular-nums font-bold">{r.gold}g</span>
            </li>
          ))}
        </ol>
        <button onClick={reset} className="mt-6 w-full rounded-2xl bg-gold text-ink px-6 py-4 font-display font-extrabold" style={{ boxShadow: '0 4px 0 #a87f3f' }}>Play again</button>
        <Link href="/" className="mt-3 text-center text-sm text-white/50 underline">Home</Link>
      </Vault>
    );
  }

  // ACTIVE
  const tLeft = secs(st?.round_started_at ?? null, (st?.per_q_seconds ?? 0) * 1000);
  return (
    <Vault>
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60">Q{(st?.round ?? 0) + 1}/{st?.total ?? 0}</span>
        <span style={{ color: TEAM[myTeam].color }} className="font-bold">Team {TEAM[myTeam].name}</span>
        <span className={`font-bold tabular-nums ${tLeft <= 3 ? 'text-rose-300' : 'text-white'}`}>{tLeft}s</span>
      </div>
      <div className="mt-2"><GoldBar a={st?.gold_a ?? 0} b={st?.gold_b ?? 0} /></div>
      {st?.is_heist && (
        <div className="mt-3 rounded-xl bg-gold/25 border border-gold px-4 py-2 text-center font-display font-extrabold text-gold animate-pulse">
          💰 HEIST ROUND — a correct answer ROBS the other team!
        </div>
      )}
      <h2 className="mt-4 text-xl font-display font-bold leading-snug"><MathText text={st?.stem ?? ''} /></h2>
      <div className="mt-4 space-y-3">
        {(st?.options ?? []).map((o, i) => (
          <AnswerTile key={i} index={i} disabled={busy || !!answered || tLeft <= 0} onClick={() => answer(i)}
            reveal={answered ? (i === answered.correct_index ? 'correct' : 'dim') : null}>
            <MathText text={o} />
          </AnswerTile>
        ))}
      </div>
      {answered && (
        <p className={`mt-4 text-center font-display font-extrabold ${answered.correct ? 'text-gold' : 'text-rose-300'}`}>
          {answered.correct ? (answered.stole ? `💰 Robbed them for ${answered.points}g!` : `+${answered.points}g banked`) : '✗ Wrong — nothing this round'}
        </p>
      )}
      {err && <p className="mt-3 text-rose-300 text-sm text-center">{err}</p>}
    </Vault>
  );
}

function GoldBar({ a, b }: { a: number; b: number }) {
  const total = a + b || 1;
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1">
        <span style={{ color: TEAM.a.color }}>🔴 {a}g</span>
        <span style={{ color: TEAM.b.color }}>{b}g 🟣</span>
      </div>
      <div className="flex h-5 rounded-full overflow-hidden bg-black/30">
        <div style={{ width: `${(a / total) * 100}%`, background: TEAM.a.color }} className="transition-all" />
        <div style={{ width: `${(b / total) * 100}%`, background: TEAM.b.color }} className="transition-all" />
      </div>
    </div>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
function Vault({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto text-white" style={{ background: VAULT }}>{children}</main>;
}
