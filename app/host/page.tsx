'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCountdown } from '@/lib/use-countdown';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import Avatar from '@/components/avatar';
import { SUBJECTS, type Subject } from '@/lib/questions';
import {
  createGame, startGame, nextQuestion, getLiveQuestion, fetchPlayers, liveAnswerCount,
  subscribeGame, type LiveQuestion, type Player,
} from '@/lib/live';

export default function HostPage() {
  const sb = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<'setup' | 'lobby' | 'active' | 'complete'>('setup');
  const [code, setCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [ac, setAc] = useState({ answered: 0, total: 0, correct: 0 });
  const [teamMode, setTeamMode] = useState(false);
  const [q, setQ] = useState<LiveQuestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const subRef = useRef<(() => void) | null>(null);

  useEffect(() => () => subRef.current?.(), []);

  async function refreshQuestion() {
    const lq = await getLiveQuestion(sb, sessionId);
    setQ(lq);
    if (lq.status === 'complete') setPhase('complete');
    else if (lq.status === 'active') setPhase('active');
  }

  async function create(subject: Subject, year: 11 | 12) {
    setBusy(true); setErr('');
    try {
      const g = await createGame(sb, subject, year, 10);
      setCode(g.code); setSessionId(g.session_id); setPhase('lobby');
      subRef.current = subscribeGame(sb, g.session_id, {
        onPlayers: async () => setPlayers(await fetchPlayers(sb, g.session_id)),
        onSession: () => refreshQuestionRef.current(),
      });
      setPlayers(await fetchPlayers(sb, g.session_id));
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  // keep a stable ref so the subscription callback always sees current sessionId
  const refreshQuestionRef = useRef(refreshQuestion);
  refreshQuestionRef.current = refreshQuestion;

  // Per-question countdown; host auto-advances ~2s after time runs out.
  const timer = useCountdown(q?.question_started_at ?? null, q?.per_question_seconds ?? 15);
  const advancedFor = useRef(-2);
  useEffect(() => {
    if (phase !== 'active' || !q) return;
    if (timer.expired && advancedFor.current !== q.index) {
      advancedFor.current = q.index;
      const t = setTimeout(() => advance(), 2000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.expired, q?.index, phase]);

  // Host: poll how many players have answered the current question.
  useEffect(() => {
    if (phase !== 'active' || !q) return;
    let live = true;
    const tick = () => liveAnswerCount(sb, sessionId, q.index).then((c) => { if (live) setAc(c); }).catch(() => {});
    tick();
    const t = setInterval(tick, 1500);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q?.index, sessionId]);

  async function begin() {
    setBusy(true);
    try { await startGame(sb, sessionId); await refreshQuestion(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }
  async function advance() {
    setBusy(true);
    try { await nextQuestion(sb, sessionId); await refreshQuestion(); setPlayers(await fetchPlayers(sb, sessionId)); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  if (phase === 'setup') {
    return (
      <Shell>
        <H>Host a game</H>
        <p className="text-inksoft text-sm mt-1">Pick a subject. Students join with the code on their phones.</p>
        <div className="mt-6 space-y-3">
          {SUBJECTS.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="flex-1 font-medium">{s.label}</span>
              {[11, 12].map((y) => (
                <button key={y} disabled={busy} onClick={() => create(s.id, y as 11 | 12)}
                  className="rounded-lg bg-parchment-deep hover:bg-plum text-white px-4 py-2 text-sm font-semibold disabled:opacity-40">
                  Y{y}
                </button>
              ))}
            </div>
          ))}
        </div>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  if (phase === 'lobby') {
    return (
      <Shell>
        <p className="text-berrydeep text-sm font-semibold">JOIN AT /join</p>
        <div className="mt-2 text-6xl font-black tracking-[0.2em] text-center py-6">{code}</div>
        <p className="text-center text-inksoft">{players.length} player{players.length === 1 ? '' : 's'} in</p>

        <button onClick={() => setTeamMode((v) => !v)}
          className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold border ${teamMode ? 'bg-plum text-white border-plum' : 'bg-panel text-ink border-rule'}`}>
          👥 Team mode: {teamMode ? 'ON — read the teams out, then start' : 'OFF — tap for Red vs Blue'}
        </button>

        {teamMode ? (
          <div className="mt-4 grid grid-cols-2 gap-3 min-h-16">
            {(['a', 'b'] as const).map((t) => {
              const tm = teamMap(players);
              const mine = players.filter((p) => tm[p.id] === t);
              return (
                <div key={t} className="rounded-xl p-3 border" style={{ borderColor: `${TEAMS[t].color}66`, background: `${TEAMS[t].color}11` }}>
                  <div className="text-sm font-display font-extrabold mb-2" style={{ color: TEAMS[t].deep }}>{TEAMS[t].emoji} {TEAMS[t].name} · {mine.length}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {mine.map((p) => (
                      <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-white/70 pl-1 pr-2.5 py-0.5 text-sm">
                        <Avatar seed={p.alias} size={20} className="rounded-full" />{p.alias}
                      </span>
                    ))}
                    {mine.length === 0 && <span className="text-xs text-muted">waiting…</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 justify-center min-h-16">
            {players.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-parchment-deep pl-1 pr-3 py-1 text-sm">
                <Avatar seed={p.alias} size={22} className="rounded-full" />{p.alias}
              </span>
            ))}
          </div>
        )}

        <button disabled={busy || players.length === 0} onClick={begin}
          className="mt-8 w-full rounded-2xl bg-plum hover:bg-plumdeep text-white px-6 py-5 text-lg font-semibold disabled:opacity-40">
          Start game
        </button>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  if (phase === 'active' && q) {
    return (
      <Shell wide>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Question {q.index + 1}/{q.total}</span>
          <span className="font-bold tabular-nums text-plum">🙋 {ac.answered}/{ac.total}{ac.total > 0 && ac.answered >= ac.total ? ' · all in!' : ''}</span>
          <span className={`font-bold tabular-nums ${timer.remaining <= 5 ? 'text-brick' : 'text-ink'}`}>{timer.remaining}s</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-parchment-deep overflow-hidden">
          <div className="h-full bg-gold transition-[width] duration-200" style={{ width: `${timer.frac * 100}%` }} />
        </div>
        {q.is_double && (
          <div className="mt-2 rounded-lg bg-gold/25 border border-gold px-3 py-1.5 text-center text-golddeep text-sm font-bold animate-pulse">
            ⚡ DOUBLE POINTS
          </div>
        )}
        <h2 className="mt-3 text-2xl md:text-4xl md:text-center font-display font-bold leading-snug"><MathText text={q.stem} /></h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(q.options ?? []).map((o, i) => (
            <AnswerTile key={i} index={i}><MathText text={o} /></AnswerTile>
          ))}
        </div>
        <div className="mt-6">
          {teamMode && players.length > 0 && <div className="mb-4"><TeamBar players={players} /></div>}
          <div className="text-sm text-muted mb-2">Live scores</div>
          <Scoreboard players={players} teams={teamMode} />
        </div>
        <button disabled={busy} onClick={advance}
          className="mt-6 w-full rounded-xl bg-plum hover:bg-plumdeep text-white px-4 py-4 font-semibold disabled:opacity-40">
          {q.index + 1 >= q.total ? 'Finish' : 'Next question'}
        </button>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  // complete
  return (
    <Shell>
      <p className="text-berrydeep font-semibold text-sm">FINAL</p>
      <H>Podium</H>
      {teamMode && players.length > 0 && <div className="mt-5"><TeamBar players={players} showWinner /></div>}
      <div className="mt-6"><Scoreboard players={players} podium teams={teamMode} /></div>
      <Link href="/host" className="mt-8 block w-full rounded-xl bg-plum text-white px-4 py-4 text-center font-semibold">
        New game
      </Link>
    </Shell>
  );
}

// Host-side team mode: assignment is purely a projector-display grouping — no server or
// scoring change. Teams are split by stable UUID order (balanced, doesn't shuffle as scores move).
const TEAMS = {
  a: { name: 'Red', emoji: '🔴', color: '#d4607a', deep: '#a23f57' },
  b: { name: 'Blue', emoji: '🔵', color: '#5b8bd0', deep: '#3a5f96' },
} as const;
function teamMap(players: Player[]): Record<string, 'a' | 'b'> {
  const m: Record<string, 'a' | 'b'> = {};
  [...players].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)).forEach((p, i) => { m[p.id] = i % 2 === 0 ? 'a' : 'b'; });
  return m;
}
function teamTotals(players: Player[]): { a: number; b: number } {
  const tm = teamMap(players);
  return players.reduce((acc, p) => { acc[tm[p.id]] += p.score; return acc; }, { a: 0, b: 0 });
}
function TeamBar({ players, showWinner }: { players: Player[]; showWinner?: boolean }) {
  const { a, b } = teamTotals(players);
  const total = a + b || 1;
  const winner = a > b ? 'a' : b > a ? 'b' : null;
  return (
    <div>
      {showWinner && (
        <div className="text-center font-display font-extrabold text-xl mb-2">
          {winner == null ? '🤝 Tie game!' : `${TEAMS[winner].emoji} ${TEAMS[winner].name} team wins!`}
        </div>
      )}
      <div className="flex justify-between text-sm font-bold mb-1">
        <span style={{ color: TEAMS.a.deep }}>{TEAMS.a.emoji} {TEAMS.a.name} {a}</span>
        <span style={{ color: TEAMS.b.deep }}>{TEAMS.b.name} {b} {TEAMS.b.emoji}</span>
      </div>
      <div className="flex h-5 rounded-full overflow-hidden bg-parchment-deep">
        <div style={{ width: `${(a / total) * 100}%`, background: TEAMS.a.color }} className="transition-all" />
        <div style={{ width: `${(b / total) * 100}%`, background: TEAMS.b.color }} className="transition-all" />
      </div>
    </div>
  );
}

function Scoreboard({ players, podium, teams }: { players: Player[]; podium?: boolean; teams?: boolean }) {
  if (!players.length) return <p className="text-muted text-sm">No scores yet.</p>;
  const medal = ['🥇', '🥈', '🥉'];
  const tm = teams ? teamMap(players) : null;
  return (
    <ol className="space-y-2">
      {players.map((p, i) => (
        <li key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${podium && i < 3 ? 'bg-gold/20 border border-gold/60' : 'bg-panel'}`}>
          <span className="w-6 text-center">{(podium && medal[i]) || `${i + 1}.`}</span>
          <Avatar seed={p.alias} size={32} className="rounded-full shrink-0" />
          <span className="font-medium flex-1 truncate">{tm ? <span style={{ color: TEAMS[tm[p.id]].deep }}>{TEAMS[tm[p.id]].emoji} </span> : null}{p.alias}</span>
          <span className="tabular-nums font-bold">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => (
  <main className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${wide ? 'max-w-md md:max-w-6xl md:px-12' : 'max-w-md'}`}>{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-bold">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-brick text-sm">{children}</p>;
