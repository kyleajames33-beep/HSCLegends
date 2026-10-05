'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useCountdown } from '@/lib/use-countdown';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import Avatar from '@/components/avatar';
import { SUBJECTS } from '@/lib/questions';
import { liveAnswerCount, type Player } from '@/lib/live';
import { arenaPresences, isPresent } from '@/lib/presence';
import { useUser } from '@/lib/use-user';
import { LiveHostController } from '@/lib/live-host-controller';
import { recordObservation, type QuestionObservation } from '@/lib/classroom-learning';
import type { ProjectorTeams } from '@/lib/live-session-cache';

export default function HostPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const controller = useMemo(() => new LiveHostController(sb), [sb]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const { phase, code, sessionId, players, teamMode, teams, q, busy, err, notice, resume } = state;
  const [ac, setAc] = useState<{ sessionId: string; index: number; answered: number; total: number; correct: number; error: string } | null>(null);
  const [presenceSnapshot, setPresenceSnapshot] = useState<{ sessionId: string; entries: Map<string, number>; error: string } | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [hideNames, setHideNames] = useState(false);
  const [observations, setObservations] = useState<QuestionObservation[]>([]);
  const presence = presenceSnapshot?.sessionId === sessionId && !presenceSnapshot.error ? presenceSnapshot.entries : null;
  const count = ac?.sessionId === sessionId && ac.index === q?.index && !ac.error ? ac : null;
  const ownerId = user?.id ?? null;
  const canControl = !loading && !!ownerId && state.ownerId === ownerId && state.ready;
  useEffect(() => { controller.setAccount(ownerId, loading); }, [controller, ownerId, loading]);
  useEffect(() => () => controller.dispose(), [controller]);

  // Presence is a recent heartbeat observation, not proof of connectivity.
  useEffect(() => {
    if (!canControl || phase === 'setup' || phase === 'complete' || !sessionId) return;
    let live = true; let version = 0;
    const tick = () => {
      const request = ++version;
      void arenaPresences(sb, sessionId).then((entries) => { if (live && request === version) setPresenceSnapshot({ sessionId, entries, error: '' }); })
        .catch(() => { if (live && request === version) setPresenceSnapshot({ sessionId, entries: new Map(), error: 'Presence unavailable' }); });
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => { live = false; clearInterval(t); };
  }, [phase, sessionId, sb, canControl]);

  // Teacher-paced by default. This holds advancement, not the server answer clock.
  const timer = useCountdown(q?.question_started_at ?? null, q?.per_question_seconds ?? 15);
  const advancedFor = useRef('');
  useEffect(() => {
    if (!canControl || !autoAdvance || phase !== 'active' || !q) return;
    if (timer.expired && advancedFor.current !== `${sessionId}:${q.index}`) {
      const t = setTimeout(() => { advancedFor.current = `${sessionId}:${q.index}`; void controller.advance(sessionId, q.index); }, 2000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.expired, q?.index, phase, canControl, controller, sessionId, autoAdvance]);

  // Host: poll how many players have answered the current question.
  useEffect(() => {
    if (!canControl || phase !== 'active' || !q) return;
    let live = true; let version = 0;
    const tick = () => {
      const request = ++version;
      void liveAnswerCount(sb, sessionId, q.index).then((c) => {
        if (!live || request !== version) return;
        setAc({ sessionId, index: q.index, ...c, error: '' });
        setObservations((previous) => recordObservation(previous, { sessionId, index: q.index, stem: q.stem ?? '', ...c, observedAt: Date.now() }));
      }).catch(() => { if (live && request === version) setAc({ sessionId, index: q.index, answered: 0, total: 0, correct: 0, error: 'Answer count unavailable' }); });
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q?.index, sessionId, canControl]);

  const teacherControls = <section aria-label="Teacher display controls" className="my-4 rounded-xl border border-rule p-3 text-sm">
    <button aria-pressed={autoAdvance} onClick={() => setAutoAdvance(!autoAdvance)} className="mr-4 underline">{autoAdvance ? 'Switch to teacher-paced' : 'Enable automatic advance'}</button>
    <button aria-pressed={hideNames} onClick={() => setHideNames(!hideNames)} className="underline">{hideNames ? 'Show student names' : 'Hide student names'}</button>
    <p className="mt-2 text-inksoft">{autoAdvance ? 'Automatic advance is on.' : 'Teacher-paced: choose Next or Finish when ready.'} The answer clock still runs; this does not pause or extend answer time.</p>
  </section>;

  if (phase === 'setup' || !canControl) {
    return (
      <Shell>
        <H>Host a game</H>
        <p className="text-inksoft text-sm mt-1">Pick a subject. Students join with the code on their phones.</p>
        {loading ? <p role="status" className="mt-4 text-sm">Checking your sign-in…</p> : !user && <Link href="/login?next=/host" className="mt-4 underline">Sign in to host or resume a game</Link>}
        {resume && <div className="mt-5 rounded-xl border border-rule p-4">
          <p className="font-semibold">Saved game {resume.code}</p>
          {ownerId !== resume.ownerId && <p className="mt-1 text-sm">Sign in with the account that created this game to resume.</p>}
          <button disabled={busy || loading || ownerId !== resume.ownerId} onClick={() => controller.restore()} className="mt-3 rounded-lg bg-plum px-4 py-2 text-white disabled:opacity-40">Resume game</button>
          <button disabled={busy} onClick={() => controller.forget()} className="ml-3 mt-3 text-sm underline">Forget saved game</button>
        </div>}
        {notice && <p role="status" className="mt-4 text-sm text-inksoft">{notice}</p>}
        {!resume && notice && <button onClick={() => controller.forget()} className="mt-2 text-sm underline">Clear saved recovery data</button>}
        <div className="mt-6 space-y-3">
          {SUBJECTS.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="flex-1 font-medium">{s.label}</span>
              {[11, 12].map((y) => (
                <button key={y} disabled={busy || loading || !user} onClick={() => controller.create(s.id, y as 11 | 12)}
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
        <p className="text-center text-inksoft">
          {(() => {
            if (!presence) return <>{players.length} joined · presence unavailable</>;
            const here = players.filter((p) => isPresent(presence, p.id)).length;
            return <>{players.length} joined · {here} seen recently · {players.length - here} without a recent heartbeat</>;
          })()}
        </p>

        {teacherControls}
        <button onClick={() => controller.toggleTeams()}
          className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold border ${teamMode ? 'bg-plum text-white border-plum' : 'bg-panel text-ink border-rule'}`}>
          👥 Team mode: {teamMode ? 'ON — read the teams out, then start' : 'OFF — tap for Red vs Blue'}
        </button>

        {teamMode ? (
          <div className="mt-4 grid grid-cols-2 gap-3 min-h-16">
            {(['a', 'b'] as const).map((t) => {
              const tm = teams;
              const mine = players.filter((p) => tm[p.id] === t);
              return (
                <div key={t} className="rounded-xl p-3 border" style={{ borderColor: `${TEAMS[t].color}66`, background: `${TEAMS[t].color}11` }}>
                  <div className="text-sm font-display font-extrabold mb-2" style={{ color: TEAMS[t].deep }}>{TEAMS[t].emoji} {TEAMS[t].name} · {mine.length}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {mine.map((p) => (
                      <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-white/70 pl-1 pr-2.5 py-0.5 text-sm">
                        <Avatar seed={hideNames ? p.id : p.alias} size={20} className="rounded-full" />{hideNames ? 'Player' : p.alias}
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
            {players.map((p) => {
              const away = presence !== null && !isPresent(presence, p.id);
              return (
                <span key={p.id} className={`flex items-center gap-1.5 rounded-full bg-parchment-deep pl-1 pr-3 py-1 text-sm ${away ? 'opacity-40' : ''}`}>
                  <Avatar seed={hideNames ? p.id : p.alias} size={22} className="rounded-full" />{hideNames ? 'Player' : p.alias}{away ? ' 📴' : ''}
                </span>
              );
            })}
          </div>
        )}

        <button disabled={busy || players.length === 0} onClick={() => controller.begin()}
          className="mt-8 w-full rounded-2xl bg-plum hover:bg-plumdeep text-white px-6 py-5 text-lg font-semibold disabled:opacity-40">
          Start game
        </button>
        {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
        {err && <Err>{err}</Err>}
        {err && q === null && <button disabled={busy || !canControl} onClick={() => controller.retryPlayers()}
          className="mt-3 rounded-xl border border-rule px-4 py-2 disabled:opacity-40">Retry players</button>}
      </Shell>
    );
  }

  if (phase === 'active' && q) {
    return (
      <Shell wide>
        {teacherControls}
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Question {q.index + 1}/{q.total}</span>
          <span role="status" className="font-bold tabular-nums text-plum">{count ? `${count.answered} answers · ${count.total} recently present` : 'Answer count unavailable'}</span>
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
          {teamMode && players.length > 0 && <div className="mb-4"><TeamBar players={players} teams={teams} /></div>}
          <div className="text-sm text-muted mb-2">Live scores</div>
          <Scoreboard players={players} teams={teamMode ? teams : undefined} hideNames={hideNames} />
        </div>
        <button disabled={busy} onClick={() => controller.advance()}
          className="mt-6 w-full rounded-xl bg-plum hover:bg-plumdeep text-white px-4 py-4 font-semibold disabled:opacity-40">
          {q.index + 1 >= q.total ? 'Finish' : 'Next question'}
        </button>
        {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  // complete
  return (
    <Shell>
      <p className="text-berrydeep font-semibold text-sm">FINAL</p>
      <H>Podium</H>
      {teacherControls}
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
      {teamMode && players.length > 0 && <div className="mt-5"><TeamBar players={players} teams={teams} showWinner /></div>}
      <div className="mt-6"><Scoreboard players={players} podium teams={teamMode ? teams : undefined} hideNames={hideNames} /></div>
      <section aria-label="Observed question summary" className="mt-6 rounded-xl border border-rule p-4">
        <h2 className="font-semibold">Questions to revisit</h2>
        <p className="mt-2 text-sm text-inksoft">Last counts observed on this projector, which can miss later answers or entire questions. This is not a final assessment or a diagnosis of misconceptions. The recently-present count is a different population from submitted answers, so missing answers cannot be calculated from it. Wrong choices and explanations are not supplied by this game.</p>
        {observations.filter((row) => row.sessionId === sessionId).length === 0 ? <p className="mt-3 text-sm">No question counts were observed on this projector.</p> : <ol className="mt-3 space-y-3">{observations.filter((row) => row.sessionId === sessionId).map((row) => <li key={row.index}>
          <p className="font-semibold">Question {row.index + 1}: {row.correct}/{row.answered} correct among observed answers</p>
          <p className="text-sm">{row.total} recently present at that observation. {row.answered - row.correct > 0 ? 'Revisit the reasoning together.' : 'No incorrect answer was observed.'}</p>
          <p className="mt-1 text-sm"><MathText text={row.stem} /></p>
        </li>)}</ol>}
      </section>
      <button onClick={() => controller.forget()} className="mt-8 block w-full rounded-xl bg-plum text-white px-4 py-4 text-center font-semibold">New game</button>
    </Shell>
  );
}

// Host-side team mode: assignment is purely a projector-display grouping — no server or
// scoring change. Assignments persist on this projector; only newcomers receive a team.
const TEAMS = {
  a: { name: 'Red', emoji: '🔴', color: '#d4607a', deep: '#a23f57' },
  b: { name: 'Blue', emoji: '🔵', color: '#5b8bd0', deep: '#3a5f96' },
} as const;
function teamTotals(players: Player[], teams: ProjectorTeams): { a: number; b: number } {
  return players.reduce((acc, p) => { const team = teams[p.id]; if (team) acc[team] += p.score; return acc; }, { a: 0, b: 0 });
}
function TeamBar({ players, teams, showWinner }: { players: Player[]; teams: ProjectorTeams; showWinner?: boolean }) {
  const { a, b } = teamTotals(players, teams);
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

function Scoreboard({ players, podium, teams, hideNames = false }: { players: Player[]; podium?: boolean; teams?: ProjectorTeams; hideNames?: boolean }) {
  if (!players.length) return <p className="text-muted text-sm">No scores yet.</p>;
  const medal = ['🥇', '🥈', '🥉'];
  const tm = teams;
  return (
    <ol className="space-y-2">
      {players.map((p) => {
        const rank = 1 + players.filter((other) => other.score > p.score).length;
        return <li key={p.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${podium && rank <= 3 ? 'bg-gold/20 border border-gold/60' : 'bg-panel'}`}>
          <span className="w-6 text-center">{(podium && medal[rank - 1]) || `${rank}.`}</span>
          <Avatar seed={hideNames ? p.id : p.alias} size={32} className="rounded-full shrink-0" />
          <span className="font-medium flex-1 truncate">{tm?.[p.id] ? <span style={{ color: TEAMS[tm[p.id]].deep }}>{TEAMS[tm[p.id]].emoji} </span> : null}{hideNames ? 'Player' : p.alias}</span>
          <span className="tabular-nums font-bold">{p.score}</span>
        </li>;
      })}
    </ol>
  );
}

const Shell = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => (
  <main className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${wide ? 'max-w-md md:max-w-6xl md:px-12' : 'max-w-md'}`}>{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-bold">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p role="alert" className="mt-4 text-brick text-sm">{children}</p>;
