'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import { celebrate } from '@/lib/confetti';
import { useJuice, TimerBar, atEvent, type JuiceAt } from '@/components/juice';
import { VaultBoard } from '@/components/heist-vault';
import {
  heistQuickJoin, heistJoin, heistRejoin, heistState, heistSubmit, heistStart, heistAdvance, heistResults,
  heistMe, heistPlaceTrap, heistGetTraps, heistRaidStart, heistRaidEnd, heistLeaderboard,
  subscribeHeist, joinHeistLive, HEIST_BOARD, HEIST_COST,
  type HeistState, type HeistResult, type HeistRaid, type HeistRaidRow, type HeistTrap,
  type HeistLeader, type LivePos, type LiveSpot,
} from '@/lib/heist';
import { startHeartbeat, saveArenaSession, loadArenaSession, clearArenaSession, type ArenaSession } from '@/lib/presence';

const VAULT = 'linear-gradient(165deg,#16182a 0%,#243d5e 55%,#a87f3f 140%)';
const TEAM = { a: { name: 'Crimson', color: '#c47b8a', deep: '#9c5c6e' }, b: { name: 'Violet', color: '#8a86d6', deep: '#4e4068' } };
const B = HEIST_BOARD;

// ── Deterministic lasers — pure functions of wall-clock seconds, so every ──
// client computes the same sweep with zero sync traffic (design doc §8.2).
const l1x = (t: number) => 50 + 33 * Math.sin(t * 0.9);         // room 1: sweeping bar
const l2a = (t: number) => t * 1.1;                              // room 2: rotating beam
const l3a = (t: number) => -t * 1.6;                             // room 3: twin beams
function distToRay(px: number, py: number, cx: number, cy: number, ang: number, len: number) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const s = Math.max(0, Math.min(len, (px - cx) * dx + (py - cy) * dy));
  return Math.hypot(px - (cx + dx * s), py - (cy + dy * s));
}
function laserHit(px: number, py: number, t: number): boolean {
  if (py > 63 && py < B.entryY) return Math.abs(px - l1x(t)) < 2.2;
  if (py > 39 && py < 61) return distToRay(px, py, 50, 50, l2a(t), 20) < 2.2;
  if (py < 37) return distToRay(px, py, 50, 20, l3a(t), 15) < 2.2 || distToRay(px, py, 50, 20, l3a(t) + Math.PI, 15) < 2.2;
  return false;
}
function hitsWall(x: number, y: number): boolean {
  const r = B.playerR;
  if (x < r || x > 100 - r || y < r || y > 100 - r) return true;
  for (const w of B.walls) {
    const cx = Math.max(w.x, Math.min(w.x + w.w, x));
    const cy = Math.max(w.y, Math.min(w.y + w.h, y));
    if (Math.hypot(x - cx, y - cy) < r) return true;
  }
  return false;
}
function boardCoords(e: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
}
const trapSpotOk = (x: number, y: number) =>
  x >= 3 && x <= 97 && y >= 3 && y < 82 && B.pads.every((p) => Math.hypot(x - p.x, y - p.y) >= 10);

type Intruder = LivePos & { ts: number };
type Spot = LiveSpot & { ts: number };

export default function HeistPage() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const juice = useJuice();
  const [alias, setAlias] = useState('');
  const [subject, setSubject] = useState<Subject>('biology');
  const [year, setYear] = useState<11 | 12>(12);
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const [room, setRoom] = useState('');
  const [player, setPlayer] = useState('');
  const [myTeam, setMyTeam] = useState<'a' | 'b'>('a');
  const [st, setSt] = useState<HeistState | null>(null);
  const [answered, setAnswered] = useState<{ correct: boolean; correct_index: number; points: number } | null>(null);
  const [results, setResults] = useState<HeistResult[]>([]);
  const [leaders, setLeaders] = useState<HeistLeader[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // The Break-In layer
  const [me, setMe] = useState({ energy: 0, stolen: 0, catches: 0 });
  const [raid, setRaid] = useState<HeistRaid | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [teamTraps, setTeamTraps] = useState<HeistTrap[]>([]);
  const [callout, setCallout] = useState('');
  const raidRef = useRef<HeistRaid | null>(null);
  const intrudersRef = useRef(new Map<string, Intruder>());
  const spotsRef = useRef(new Map<string, Spot>());
  const liveRef = useRef<ReturnType<typeof joinHeistLive> | null>(null);
  const lastAt = useRef<JuiceAt | undefined>(undefined);

  const subRef = useRef<(() => void) | null>(null);
  const drive = useRef({ st: null as HeistState | null, room: '', startFired: false, advRound: -2 });
  const ansRound = useRef(-1);
  const celebrated = useRef(false);
  const hbRef = useRef<(() => void) | null>(null);
  const [resume, setResume] = useState<ArenaSession | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user && !alias) setAlias((user.email ?? '').split('@')[0].slice(0, 16));
  }, [user, alias]);
  useEffect(() => () => { subRef.current?.(); hbRef.current?.(); liveRef.current?.leave(); }, []);

  // Drop recovery: a stashed session means a refresh/crash mid-game — offer to rejoin.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResume(loadArenaSession('heist'));
  }, []);
  async function rejoin(s: ArenaSession) {
    setBusy(true); setErr('');
    try {
      const r = await heistRejoin(sb, s.code, s.alias);
      if (!r) throw new Error('Could not find your player in that game.');
      setAlias(s.alias); setCode(s.code); setResume(null);
      await enter(r.room_id, r.player_id, r.team);
    } catch (e) {
      clearArenaSession('heist'); setResume(null); setErr(msg(e));
    } finally { setBusy(false); }
  }

  const calloutT = useRef(0);
  function showCallout(m: string) {
    setCallout(m);
    window.clearTimeout(calloutT.current);
    calloutT.current = window.setTimeout(() => setCallout(''), 3200);
  }

  async function sync(rm = room) {
    if (!rm) return;
    const s = await heistState(sb, rm);
    setSt(s);
    if (s.round !== ansRound.current) setAnswered(null);
    if (s.status === 'finished') clearArenaSession('heist'); // nothing to rejoin
    if (s.status === 'finished' && results.length === 0) {
      setResults(await heistResults(sb, rm));
      heistLeaderboard(sb).then(setLeaders, () => {});
    }
  }
  const syncRef = useRef(sync);

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

  // Post-render mirrors: timers/subscriptions/broadcast handlers read the
  // latest state + handlers through these refs (never during render).
  useEffect(() => {
    drive.current.st = st; drive.current.room = room;
    raidRef.current = raid;
    syncRef.current = sync; answerRef.current = answer; endRaidRef.current = endRaid;
  });

  // Game over force-ends a raid in flight (server voids it anyway).
  useEffect(() => {
    if (st?.status === 'finished' && raidRef.current) endRaidRef.current('expired', 0, null, null, null);
  }, [st?.status]);

  async function refreshTraps(rm: string, team: 'a' | 'b') {
    try { setTeamTraps(await heistGetTraps(sb, rm, team)); } catch { /* cosmetic */ }
  }
  async function refreshMe(pl = player) {
    try { const m = await heistMe(sb, pl); if (m) setMe({ energy: m.energy, stolen: m.stolen, catches: m.catches }); } catch { /* next sync */ }
  }

  function onRaidEvent(r: HeistRaidRow, team: 'a' | 'b', rm: string, pl: string) {
    if (r.raider_id === pl) return; // own raids narrated by endRaid()
    const mine = r.target_team === team; // my vault is the target
    if (r.status === 'active') {
      if (mine) { showCallout(`🚨 ${r.raider_alias} is INSIDE your vault — man the spotlight!`); juice.flash('red'); }
      else showCallout(`🥷 ${r.raider_alias} slipped into their vault…`);
    } else if (r.status === 'banked') {
      if (mine) { showCallout(`💀 ${r.raider_alias} escaped with ${r.loot}g of YOUR gold!`); juice.flash('red'); juice.shake(); }
      else { showCallout(`💰 ${r.raider_alias} banked ${r.loot}g for your team!`); juice.flash('gold'); }
    } else if (r.status === 'caught') {
      if (mine) { showCallout(`🚔 ${r.raider_alias} was CAUGHT — their team pays up!`); juice.flash('gold'); refreshMe(pl); }
      else showCallout(`💀 ${r.raider_alias} got caught — 20g insurance paid out.`);
    }
    if (r.status !== 'active') {
      intrudersRef.current.delete(r.id);
      if (mine) refreshTraps(rm, team); // a sentry may have been spent
    }
  }

  async function enter(rm: string, pl: string, team: 'a' | 'b') {
    setRoom(rm); setPlayer(pl); setMyTeam(team);
    setRaid(null); setPlacing(false); setCallout('');
    drive.current.startFired = false; drive.current.advRound = -2;
    intrudersRef.current.clear(); spotsRef.current.clear();
    subRef.current?.();
    subRef.current = subscribeHeist(sb, rm, () => syncRef.current(rm), (r) => onRaidEvent(r, team, rm, pl));
    hbRef.current?.();
    hbRef.current = startHeartbeat(sb, 'heist', pl);
    liveRef.current?.leave();
    liveRef.current = joinHeistLive(sb, rm, {
      pos: (p) => intrudersRef.current.set(p.raid, { ...p, ts: Date.now() }),
      spot: (s) => spotsRef.current.set(s.player, { ...s, ts: Date.now() }),
    });
    await Promise.all([sync(rm), refreshMe(pl), refreshTraps(rm, team)]);
  }

  async function quickPlay() {
    if (!alias.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await heistQuickJoin(sb, subject, year, alias);
      setCode(r.code);
      saveArenaSession('heist', { code: r.code, room: r.room_id, player: r.player_id, alias, team: r.team });
      sb.rpc('increment_quest', { p_metric: 'arena_game', p_amount: 1 }).then(undefined, () => {});
      await enter(r.room_id, r.player_id, r.team);
    }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function joinByCode() {
    if (joinCode.length < 6 || !alias.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await heistJoin(sb, joinCode, alias);
      setCode(joinCode);
      saveArenaSession('heist', { code: joinCode, room: r.room_id, player: r.player_id, alias, team: r.team });
      sb.rpc('increment_quest', { p_metric: 'arena_game', p_amount: 1 }).then(undefined, () => {});
      await enter(r.room_id, r.player_id, r.team);
    }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  async function answer(choice: number) {
    const s = drive.current.st;
    if (!s || answered || busy || raidRef.current) return;
    if (s.round_started_at && Date.now() > new Date(s.round_started_at).getTime() + s.per_q_seconds * 1000) return;
    setBusy(true);
    try {
      const r = await heistSubmit(sb, player, s.round, choice);
      ansRound.current = s.round; setAnswered(r);
      setMe((v) => ({ ...v, energy: r.energy }));
      if (r.correct) juice.correct(`+${r.points}g`, lastAt.current);
      else juice.wrong('✗', lastAt.current);
    }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  const answerRef = useRef(answer);

  // Laptop-native: answer with the 1–4 keys.
  useEffect(() => {
    if (!room) return;
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) answerRef.current(i);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [room]);

  async function startRaid() {
    if (busy || raid || me.energy < HEIST_COST.raid || Date.now() < cooldownUntil) return;
    setBusy(true); setErr('');
    try {
      const r = await heistRaidStart(sb, player);
      setPlacing(false); setRaid(r);
      setMe((v) => ({ ...v, energy: r.energy }));
    } catch (e) { showCallout(`⚠️ ${msg(e)}`); } finally { setBusy(false); }
  }

  async function endRaid(outcome: 'banked' | 'caught' | 'expired', rooms = 0, catcher: string | null = null, trap: string | null = null, cause: string | null = null) {
    const r = raidRef.current; if (!r) return;
    setRaid(null); setCooldownUntil(Date.now() + 8000);
    try {
      const res = await heistRaidEnd(sb, r.raid_id, player, outcome, rooms, catcher, trap, cause);
      if (res.outcome === 'banked') { juice.correct(`+${res.loot}g`, { x: 72, y: 40 }); showCallout(`💰 Clean getaway — ${res.loot}g banked!`); }
      else if (res.outcome === 'caught') { juice.wrong(cause === 'spotlight' ? 'SPOTTED!' : cause === 'sentry' ? 'ZAPPED!' : 'FRIED!', { x: 72, y: 40 }); showCallout(`🚨 Caught! Your team paid ${res.penalty}g insurance.`); }
      else if (outcome === 'banked') showCallout('The window closed — nothing banked.');
    } catch (e) { setErr(msg(e)); }
    refreshMe(); syncRef.current();
  }
  const endRaidRef = useRef(endRaid);

  async function placeTrap(x: number, y: number) {
    if (me.energy < HEIST_COST.sentry || !trapSpotOk(x, y)) return;
    try {
      const r = await heistPlaceTrap(sb, player, x, y);
      setMe((v) => ({ ...v, energy: r.energy }));
      setTeamTraps((ts) => [...ts, { id: r.trap_id, x, y }]);
      setPlacing(false);
      juice.burst({ tone: 'blue', at: { x: 72, y: 45 } });
    } catch (e) { showCallout(`⚠️ ${msg(e)}`); setPlacing(false); }
  }

  function reset() {
    subRef.current?.();
    hbRef.current?.(); hbRef.current = null;
    liveRef.current?.leave(); liveRef.current = null;
    clearArenaSession('heist');
    setRoom(''); setPlayer(''); setSt(null); setResults([]); setLeaders([]); setAnswered(null);
    setRaid(null); setPlacing(false); setTeamTraps([]); setMe({ energy: 0, stolen: 0, catches: 0 });
    celebrated.current = false;
  }

  const secs = (target: string | null, add = 0) => target ? Math.max(0, Math.ceil((new Date(target).getTime() + add - now) / 1000)) : 0;

  // PICK
  if (!room) {
    return (
      <Vault>
        <h1 className="text-3xl font-display font-extrabold">🥷 Heist</h1>
        <p className="text-white/60 mt-1 text-sm">Answer questions to bank gold and charge energy — then break into the other team&apos;s vault and rob it in person. Laptop + keyboard recommended.</p>
        {resume && (
          <button onClick={() => rejoin(resume)} disabled={busy}
            className="mt-5 w-full rounded-2xl border border-gold/60 bg-gold/20 px-4 py-3 text-left active:translate-y-0.5 disabled:opacity-40">
            <span className="font-display font-extrabold text-gold">↩️ Rejoin heist {resume.code}</span>
            <span className="block text-sm text-white/70">Pick up where you left off as {resume.alias} — your gold is safe.</span>
          </button>
        )}

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
        <button onClick={quickPlay} disabled={busy || !alias.trim()} className="mt-6 w-full rounded-2xl bg-gold text-ink px-6 py-5 text-lg font-display font-extrabold active:translate-y-0.5 disabled:opacity-40" style={{ boxShadow: '0 4px 0 #a87f3f' }}>🥷 Quick Play</button>
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
        <p className="text-center text-white/60 mt-1">{st.players} in · you&apos;re on <span style={{ color: TEAM[myTeam].color }} className="font-bold">{TEAM[myTeam].name}</span></p>
        <div className="mt-6 rounded-2xl bg-white/5 border border-white/15 p-4 text-sm text-white/70 space-y-1.5">
          <p className="font-display font-extrabold text-white">How the Break-In works</p>
          <p>✅ Correct answers bank gold for your vault and charge your ⚡ energy.</p>
          <p>🥷 Spend 60⚡ to <b>raid their vault</b> — WASD to move, dodge lasers, hold SPACE on gold pads, escape to bank.</p>
          <p>⚡ Spend 30⚡ on a <b>sentry</b> to guard your own floor.</p>
          <p>🔦 When the alarm sounds, drag the <b>spotlight</b> with your mouse to catch intruders.</p>
        </div>
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
        {juice.overlay}
        <p className="text-gold font-display font-bold text-sm">HEIST OVER</p>
        <div className="text-center my-2">
          <div className="lg-pop text-6xl">{winner == null ? '🤝' : meWon ? '🏆' : '💔'}</div>
          <h1 className="mt-1 text-3xl font-display font-extrabold">{winner == null ? 'Draw!' : `${TEAM[winner].name} wins!`}</h1>
        </div>
        <GoldBar a={st.gold_a} b={st.gold_b} />
        <div className="mt-5 text-sm text-white/60">Top crew</div>
        <ol className="mt-2 space-y-2">
          {results.slice(0, 8).map((r, i) => (
            <li key={i} className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${r.is_me ? 'bg-gold/25 border border-gold/60' : 'bg-white/10'}`}>
              <span className="font-medium">
                <span style={{ color: TEAM[r.team].color }}>●</span> {r.alias}{r.is_me ? ' (you)' : ''}
                {(r.stolen > 0 || r.catches > 0) && (
                  <span className="ml-2 text-xs text-white/50">
                    {r.stolen > 0 ? `🥷 ${r.stolen}g stolen` : ''}{r.stolen > 0 && r.catches > 0 ? ' · ' : ''}{r.catches > 0 ? `🚔 ${r.catches} caught` : ''}
                  </span>
                )}
              </span>
              <span className="tabular-nums font-bold">{r.gold}g</span>
            </li>
          ))}
        </ol>
        {leaders.length > 0 && (
          <>
            <div className="mt-6 text-sm text-white/60">🏴‍☠️ Master Thieves — season board</div>
            <ol className="mt-2 space-y-1.5">
              {leaders.slice(0, 5).map((l, i) => (
                <li key={i} className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${l.is_me ? 'bg-gold/25 border border-gold/60' : 'bg-white/5'}`}>
                  <span>#{i + 1} {l.alias}{l.is_me ? ' (you)' : ''} <span className="text-white/40 text-xs">· {l.games} heists · {l.wins} wins</span></span>
                  <span className="tabular-nums font-bold text-gold">{l.stolen}g stolen</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <button onClick={reset} className="mt-6 w-full rounded-2xl bg-gold text-ink px-6 py-4 font-display font-extrabold" style={{ boxShadow: '0 4px 0 #a87f3f' }}>Play again</button>
        <Link href="/" className="mt-3 text-center text-sm text-white/50 underline">Home</Link>
      </Vault>
    );
  }

  // ACTIVE — quiz engine on the left, the vault floor on the right.
  const tLeft = secs(st?.round_started_at ?? null, (st?.per_q_seconds ?? 0) * 1000);
  const alarmed = (myTeam === 'a' ? st?.raiders_a : st?.raiders_b) ?? 0;      // raids on MY vault
  const heat = (myTeam === 'a' ? st?.raiders_b : st?.raiders_a) ?? 0;         // raids on theirs
  const enemyVault = (myTeam === 'a' ? st?.gold_b : st?.gold_a) ?? 0;
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const canRaid = !raid && me.energy >= HEIST_COST.raid && cooldown === 0 && heat < 3 && st?.status === 'active';

  return (
    <Vault wide>
      {juice.overlay}
      <div className={juice.shakeClass}>
        <div className="flex items-center justify-between text-sm gap-4">
          <span className="text-white/60 whitespace-nowrap">Q{(st?.round ?? 0) + 1}/{st?.total ?? 0}</span>
          <div className="flex-1"><TimerBar secondsLeft={tLeft} totalSeconds={st?.per_q_seconds ?? 18} trackClass="bg-black/30" /></div>
          <span style={{ color: TEAM[myTeam].color }} className="font-bold whitespace-nowrap">Team {TEAM[myTeam].name}</span>
        </div>
        <div className="mt-2"><GoldBar a={st?.gold_a ?? 0} b={st?.gold_b ?? 0} raidersA={st?.raiders_a ?? 0} raidersB={st?.raiders_b ?? 0} /></div>
        {callout && (
          <div className="lg-pop mt-2 rounded-xl border border-gold bg-gold/25 px-3 py-1.5 text-center font-display font-extrabold text-gold">{callout}</div>
        )}

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_440px] items-start">
          {/* Quiz pane — the engine. Raiding costs you these questions. */}
          <div className={raid ? 'opacity-40 pointer-events-none select-none' : ''}>
            {raid ? (
              <p className="mb-2 text-center font-display font-extrabold text-gold">🥷 You&apos;re inside their vault — your crew is answering without you!</p>
            ) : null}
            <h2 className="text-xl md:text-2xl font-display font-bold leading-snug"><MathText text={st?.stem ?? ''} /></h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" onClickCapture={(e) => { lastAt.current = atEvent(e); }}>
              {(st?.options ?? []).map((o, i) => (
                <AnswerTile key={i} index={i} disabled={busy || !!answered || tLeft <= 0 || !!raid} onClick={() => answer(i)}
                  reveal={answered ? (i === answered.correct_index ? 'correct' : 'dim') : null}>
                  <MathText text={o} />
                </AnswerTile>
              ))}
            </div>
            {answered && (
              <p className={`mt-4 text-center font-display font-extrabold ${answered.correct ? 'text-gold' : 'text-rose-300'}`}>
                {answered.correct ? `+${answered.points}g banked · +⚡ energy` : '✗ Wrong — +5⚡ for trying'}
              </p>
            )}
            <p className="mt-3 text-center text-xs text-white/35">Keys 1–4 answer · WASD moves during a raid</p>
            {err && <p className="mt-3 text-rose-300 text-sm text-center">{err}</p>}
          </div>

          {/* Action pane — defend by default; flips to the enemy vault during a raid. */}
          <div className={`rounded-2xl border p-3 ${alarmed > 0 && !raid ? 'border-rose-400/80' : 'border-white/15'} bg-black/25`}
            style={alarmed > 0 && !raid ? { boxShadow: '0 0 0 3px rgba(251,113,133,0.25), 0 0 24px rgba(251,113,133,0.35)' } : undefined}>
            <EnergyBar energy={me.energy} />
            <div className="mt-2 flex gap-2">
              <button onClick={startRaid} disabled={!canRaid || busy}
                className="flex-1 rounded-xl bg-gold text-ink px-3 py-2.5 font-display font-extrabold active:translate-y-0.5 disabled:opacity-40"
                style={{ boxShadow: '0 3px 0 #a87f3f' }}>
                🥷 RAID · {HEIST_COST.raid}⚡{cooldown > 0 ? ` (${cooldown}s)` : heat >= 3 ? ' (swarming)' : ''}
              </button>
              <button onClick={() => setPlacing((p) => !p)} disabled={!!raid || me.energy < HEIST_COST.sentry}
                className={`flex-1 rounded-xl px-3 py-2.5 font-display font-extrabold active:translate-y-0.5 disabled:opacity-40 ${placing ? 'bg-sky-300 text-ink' : 'bg-white/15 text-white'}`}>
                ⚡ SENTRY · {HEIST_COST.sentry}⚡
              </button>
            </div>
            {raid ? (
              <RaidGame key={raid.raid_id} raid={raid} player={player} alias={alias} enemyVault={enemyVault}
                sendPos={(p) => liveRef.current?.sendPos(p)} spotsRef={spotsRef}
                onEnd={(o, rooms, catcher, trap, cause) => endRaidRef.current(o, rooms, catcher, trap, cause)} />
            ) : (
              <DefenseBoard myTeam={myTeam} player={player} traps={teamTraps} placing={placing}
                alarmed={alarmed > 0} intrudersRef={intrudersRef}
                sendSpot={(s) => liveRef.current?.sendSpot(s)} onPlace={placeTrap} />
            )}
          </div>
        </div>
      </div>
    </Vault>
  );
}

// ── The raid: WASD through their vault. All hazards resolve on THIS client ──
// (the raider's view is authoritative; the server clamps the stakes).
function RaidGame({ raid, player, alias, enemyVault, sendPos, spotsRef, onEnd }: {
  raid: HeistRaid; player: string; alias: string; enemyVault: number;
  sendPos: (p: LivePos) => void;
  spotsRef: React.RefObject<Map<string, Spot>>;
  onEnd: (o: 'banked' | 'caught' | 'expired', rooms: number, catcher: string | null, trap: string | null, cause: string | null) => void;
}) {
  // Mutable simulation lives in a ref (touched only inside effects); each
  // frame publishes an immutable render snapshot through setView.
  const [view, setView] = useState(() => ({
    x: 50, y: 93, tSec: 0, timeLeft: B.raidSeconds as number,
    grabbed: [] as number[], grabPad: -1, grabT: 0, det: 0, spots: [] as Spot[],
  }));
  const eng = useRef({
    x: 50, y: 93, keys: new Set<string>(),
    grabbed: [] as number[], grabPad: -1, grabT: 0,
    det: 0, detBy: null as string | null,
    leftEntry: false, done: false, lastSend: 0, last: 0, t0: 0,
  });
  const endRef = useRef(onEnd);
  useEffect(() => { endRef.current = onEnd; });

  useEffect(() => {
    const KEYMAP: Record<string, string> = {
      w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down',
      a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', ' ': 'grab',
    };
    const dn = (e: KeyboardEvent) => {
      const k = KEYMAP[e.key.toLowerCase()];
      if (k) { eng.current.keys.add(k); e.preventDefault(); }
      if (e.key === 'Escape' && !eng.current.done) { eng.current.done = true; endRef.current('expired', 0, null, null, null); }
    };
    const up = (e: KeyboardEvent) => { const k = KEYMAP[e.key.toLowerCase()]; if (k) eng.current.keys.delete(k); };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  useEffect(() => {
    let raf = 0;
    const finish = (o: 'banked' | 'caught', catcher: string | null, trap: string | null, cause: string | null) => {
      const s = eng.current;
      if (s.done) return;
      s.done = true;
      endRef.current(o, s.grabbed.length, catcher, trap, cause);
    };
    const tick = (tms: number) => {
      const s = eng.current;
      if (s.done) return;
      if (!s.t0) s.t0 = Date.now();
      const dt = Math.min(0.05, s.last ? (tms - s.last) / 1000 : 0.016);
      s.last = tms;
      const tSec = Date.now() / 1000;
      const elapsed = (Date.now() - s.t0) / 1000;

      // move (loot slows you)
      let vx = 0, vy = 0;
      if (s.keys.has('up')) vy -= 1; if (s.keys.has('down')) vy += 1;
      if (s.keys.has('left')) vx -= 1; if (s.keys.has('right')) vx += 1;
      if (vx || vy) {
        const n = Math.hypot(vx, vy), sp = (25 - 2.5 * s.grabbed.length) * dt;
        const nx = s.x + (vx / n) * sp, ny = s.y + (vy / n) * sp;
        if (!hitsWall(nx, s.y)) s.x = nx;
        if (!hitsWall(s.x, ny)) s.y = ny;
      }
      if (s.y < B.entryY - 3) s.leftEntry = true;

      // hazards — resolved here, on the raider's client
      if (elapsed > B.raidSeconds) { s.done = true; endRef.current('expired', 0, null, null, null); return; }
      if (s.y < B.entryY && laserHit(s.x, s.y, tSec)) return finish('caught', null, null, 'laser');
      for (const t of raid.traps) {
        if (Math.hypot(s.x - t.x, s.y - t.y) < B.sentryR + B.playerR) return finish('caught', null, t.id, 'sentry');
      }
      // spotlight: cumulative detection while lit (entry zone is immune)
      let lit = false;
      if (s.y < B.entryY) {
        const cut = Date.now() - 600;
        for (const [, sp] of spotsRef.current ?? new Map<string, Spot>()) {
          if (sp.team !== raid.target_team || sp.ts < cut) continue;
          if (Math.hypot(s.x - sp.x, s.y - sp.y) < B.spotR) { lit = true; s.detBy = sp.player; break; }
        }
      }
      s.det = lit ? s.det + dt : Math.max(0, s.det - dt * 0.8);
      if (s.det >= B.catchSeconds) return finish('caught', s.detBy, null, 'spotlight');

      // grab: hold SPACE on an uncracked pad
      let padIdx = -1;
      for (let i = 0; i < B.pads.length; i++) {
        if (!s.grabbed.includes(i) && Math.hypot(s.x - B.pads[i].x, s.y - B.pads[i].y) < B.padR) { padIdx = i; break; }
      }
      if (padIdx >= 0 && s.keys.has('grab')) {
        if (s.grabPad !== padIdx) { s.grabPad = padIdx; s.grabT = 0; }
        s.grabT += dt;
        if (s.grabT >= B.grabSeconds) { s.grabbed.push(padIdx); s.grabPad = -1; s.grabT = 0; }
      } else { s.grabPad = -1; s.grabT = 0; }

      // escape with loot = banked
      if (s.leftEntry && s.y >= B.entryY && s.grabbed.length > 0) { s.done = true; endRef.current('banked', s.grabbed.length, null, null, null); return; }

      // broadcast ~10Hz
      if (tms - s.lastSend > 100) {
        s.lastSend = tms;
        sendPos({ raid: raid.raid_id, player, alias, team: raid.target_team, x: s.x, y: s.y, rooms: s.grabbed.length, det: s.det / B.catchSeconds });
      }
      const spotCut = Date.now() - 600;
      setView({
        x: s.x, y: s.y, tSec, timeLeft: Math.max(0, Math.ceil(B.raidSeconds - elapsed)),
        grabbed: [...s.grabbed], grabPad: s.grabPad, grabT: s.grabT, det: s.det,
        spots: [...(spotsRef.current?.values() ?? [])].filter((sp) => sp.team === raid.target_team && sp.ts >= spotCut),
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carryPct = view.grabbed.reduce((a, i) => a + B.pads[i].pct, 0);
  const carryEst = Math.max(5 * view.grabbed.length, Math.floor((enemyVault * carryPct) / 100));
  const enemy = TEAM[raid.target_team];

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs font-bold">
        <span style={{ color: enemy.color }}>BREAKING INTO {enemy.name.toUpperCase()}&apos;S VAULT</span>
        <span className={`tabular-nums ${view.timeLeft <= 10 ? 'text-rose-300 fx-urgent' : 'text-white/70'}`}>⏱ {view.timeLeft}s</span>
      </div>
      <VaultBoard
        tSec={view.tSec}
        teamColor={enemy.color}
        grabbed={view.grabbed}
        raiderX={view.x}
        raiderY={view.y}
        grabProgress={view.grabPad >= 0 ? view.grabT / B.grabSeconds : 0}
        detectionProgress={view.det / B.catchSeconds}
        onPointerMove={undefined}
        onClick={undefined}
      >
        {raid.traps.map((t) => <Sentry key={t.id} x={t.x} y={t.y} color={enemy.color} />)}
        {view.spots.map((sp) => <Spotlight key={sp.player} x={sp.x} y={sp.y} />)}
      </VaultBoard>
      <div className="mt-1.5 flex items-center justify-between text-xs text-white/70">
        <span>{view.grabbed.length > 0 ? <>💰 carrying ~<b className="text-gold">{carryEst}g</b> — escape out the bottom!</> : 'Hold SPACE on a gold pad to crack it'}</span>
        <span className="text-white/40">ESC bails</span>
      </div>
    </div>
  );
}

// ── Defense: your vault, live intruders, mouse spotlight, sentry placement ──
function DefenseBoard({ myTeam, player, traps, placing, alarmed, intrudersRef, sendSpot, onPlace }: {
  myTeam: 'a' | 'b'; player: string; traps: HeistTrap[]; placing: boolean; alarmed: boolean;
  intrudersRef: React.RefObject<Map<string, Intruder>>;
  sendSpot: (s: LiveSpot) => void;
  onPlace: (x: number, y: number) => void;
}) {
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const lastSend = useRef(0);
  // Per-frame render snapshot (lasers animate; intruders arrive via broadcast refs).
  const [view, setView] = useState(() => ({
    tSec: 0, intruders: [] as Intruder[], mouse: null as { x: number; y: number } | null,
  }));

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cut = Date.now() - 1500;
      setView({
        tSec: Date.now() / 1000,
        intruders: [...(intrudersRef.current?.values() ?? [])].filter((p) => p.team === myTeam && p.ts >= cut),
        mouse: mouse.current ? { ...mouse.current } : null,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [intrudersRef, myTeam]);

  const mine = TEAM[myTeam];
  const m = view.mouse;
  const ghostOk = m ? trapSpotOk(m.x, m.y) : false;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs font-bold">
        <span style={{ color: mine.color }}>{mine.name.toUpperCase()}&apos;S VAULT {placing ? '— click to place a sentry' : ''}</span>
        {alarmed
          ? <span className="text-rose-300 fx-urgent">🚨 INTRUDER — spotlight them!</span>
          : <span className="text-white/40">🔦 mouse = spotlight</span>}
      </div>
      <VaultBoard
        tSec={view.tSec}
        teamColor={mine.color}
        grabbed={[]}
        onPointerMove={(e) => {
          const c = boardCoords(e);
          mouse.current = c;
          const t = Date.now();
          if (!placing && t - lastSend.current > 100) { lastSend.current = t; sendSpot({ player, team: myTeam, x: c.x, y: c.y }); }
        }}
        onClick={(e) => { if (placing) { const c = boardCoords(e); onPlace(c.x, c.y); } }}
      >
        {traps.map((t) => <Sentry key={t.id} x={t.x} y={t.y} color={mine.color} />)}
        {view.intruders.map((p) => (
          <g key={p.raid}>
            <circle cx={p.x} cy={p.y} r={B.playerR} fill="#fff" stroke="#16182a" strokeWidth={0.8} />
            {p.rooms > 0 && <circle cx={p.x} cy={p.y} r={B.playerR + 1} fill="none" stroke="#ffd34d" strokeWidth={0.9} />}
            {p.det > 0 && (
              <circle cx={p.x} cy={p.y} r={B.playerR + 2.2} fill="none" stroke="#ff5555" strokeWidth={1}
                strokeDasharray={`${p.det * 2 * Math.PI * (B.playerR + 2.2)} 999`} />
            )}
            <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={3.4} fill="#ff8a8a" fontWeight={800}>{p.alias}</text>
          </g>
        ))}
        {m && !placing && <Spotlight x={m.x} y={m.y} />}
        {m && placing && (
          <circle cx={m.x} cy={m.y} r={B.sentryR} fill={ghostOk ? 'rgba(125,211,252,0.35)' : 'rgba(255,85,85,0.3)'}
            stroke={ghostOk ? '#7dd3fc' : '#ff5555'} strokeWidth={0.7} strokeDasharray="2 1.5" />
        )}
      </VaultBoard>
      <div className="mt-1.5 flex items-center justify-between text-xs text-white/70">
        <span>⚡ {traps.length}/6 sentries live</span>
        <span className="text-white/40">{view.intruders.length > 0 ? 'Hold the beam on them to catch!' : 'All quiet…'}</span>
      </div>
    </div>
  );
}


function Sentry({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={B.sentryR} fill={color} opacity="0.22" />
      <circle cx={x} cy={y} r={B.sentryR} fill="none" stroke={color} strokeWidth="0.6" strokeDasharray="1.6 1.2" />
      <text x={x} y={y + 1.6} textAnchor="middle" fontSize="4.4">⚡</text>
    </g>
  );
}

function Spotlight({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={B.spotR} fill="#ffd34d" opacity="0.18" />
      <circle cx={x} cy={y} r={B.spotR} fill="none" stroke="#ffd34d" strokeWidth="0.5" opacity="0.8" />
    </g>
  );
}

function EnergyBar({ energy }: { energy: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1">
        <span className="text-sky-200">⚡ ENERGY</span>
        <span className="tabular-nums text-white/80">{energy}/100</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-black/40">
        <div className="h-full transition-all duration-500" style={{ width: `${energy}%`, background: 'linear-gradient(90deg,#7dd3fc,#ffd34d)' }} />
        {/* cost ticks: sentry 30, raid 60 */}
        <div className="absolute inset-y-0 border-l border-white/50" style={{ left: `${HEIST_COST.sentry}%` }} />
        <div className="absolute inset-y-0 border-l border-white/80" style={{ left: `${HEIST_COST.raid}%` }} />
      </div>
    </div>
  );
}

function GoldBar({ a, b, raidersA = 0, raidersB = 0 }: { a: number; b: number; raidersA?: number; raidersB?: number }) {
  const total = a + b || 1;
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1">
        <span style={{ color: TEAM.a.color }}>🔴 {a}g{raidersA > 0 ? ` · 🥷×${raidersA}` : ''}</span>
        <span style={{ color: TEAM.b.color }}>{raidersB > 0 ? `🥷×${raidersB} · ` : ''}{b}g 🟣</span>
      </div>
      <div className="flex h-5 rounded-full overflow-hidden bg-black/30">
        <div style={{ width: `${(a / total) * 100}%`, background: TEAM.a.color }} className="transition-all" />
        <div style={{ width: `${(b / total) * 100}%`, background: TEAM.b.color }} className="transition-all" />
      </div>
    </div>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
function Vault({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex flex-1 flex-col w-full text-white" style={{ background: VAULT }}>
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
