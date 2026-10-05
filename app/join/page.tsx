'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { useCountdown } from '@/lib/use-countdown';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import {
  joinGame, liveRejoin, getLiveQuestion, submitAnswer, fetchPlayers, subscribeGame, claimGameXp,
  type LiveQuestion,
} from '@/lib/live';
import { readAcknowledgedAnswer, writeAcknowledgedAnswer, readPendingClaim, writePendingClaim, clearConfirmedClaim, cacheMessage, type PendingClaim } from '@/lib/live-session-cache';
import { checkedReceipt, finalStanding } from '@/lib/classroom-learning';
import { startHeartbeat, saveArenaSession, loadArenaSession, clearArenaSession, type ArenaSession } from '@/lib/presence';

type Phase = 'form' | 'lobby' | 'question' | 'answered' | 'finishing' | 'complete';
type Result = { is_correct: boolean; correct_index: number; points: number };
type ViewConnection = { epoch: number; ownerId: string | null; sessionId: string; playerId: string };

export default function JoinPage() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [xp, setXp] = useState<{ awarded: number; total: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [code, setCode] = useState('');
  const [alias, setAlias] = useState('');
  const [viewConnection, setViewConnection] = useState<ViewConnection | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [q, setQ] = useState<LiveQuestion | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [me, setMe] = useState<{ rank: number; score: number } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState('');
  const [claimError, setClaimError] = useState('');
  const [largeText, setLargeText] = useState(false);
  const [practice, setPractice] = useState<{ index: number; choice: number | null } | null>(null);
  const claimInFlight = useRef<{ epoch: number; ownerId: string; playerId: string } | null>(null);
  const pendingClaim = useRef<PendingClaim | null>(null);
  const context = useRef({ epoch: 0, ownerId: null as string | null, known: false, mounted: true, sessionId: '', playerId: '', gameOwner: null as string | null });
  const loadVersion = useRef(0);
  const activeQuestion = useRef(-1);
  const answerInFlight = useRef('');
  const [viewOwner, setViewOwner] = useState<string | null>(null);
  const ownerId = user?.id ?? null;
  const timer = useCountdown(q?.question_started_at ?? null, q?.per_question_seconds ?? 15);

  const answeredIdx = useRef<number>(-1);
  const subRef = useRef<(() => void) | null>(null);
  const hbRef = useRef<(() => void) | null>(null);
  const [resume, setResume] = useState<ArenaSession | null>(null);
  useEffect(() => {
    const current = context.current;
    current.mounted = true;
    return () => { current.mounted = false; current.epoch++; subRef.current?.(); hbRef.current?.(); };
  }, []);
  useEffect(() => {
    if (userLoading) return;
    const current = context.current;
    const changed = current.known && current.ownerId !== ownerId;
    if (changed) {
      current.epoch++; current.sessionId = ''; current.playerId = ''; current.gameOwner = null;
      pendingClaim.current = null; subRef.current?.(); hbRef.current?.();
      const epoch = current.epoch;
      void Promise.resolve().then(() => {
        if (context.current.mounted && context.current.epoch === epoch) {
          setPhase('form'); setViewConnection(null); setXp(null); setResult(null); setClaimError(''); setReceiptNotice(''); setBusy(false); setResume(loadArenaSession('live'));
        }
      });
    }
    current.ownerId = ownerId; current.known = true;
  }, [ownerId, userLoading]);

  function currentRequest(epoch: number, owner: string | null) {
    return context.current.mounted && context.current.epoch === epoch && context.current.ownerId === owner;
  }
  function currentConnection(connection: ViewConnection | null): connection is ViewConnection {
    return !!connection && currentRequest(connection.epoch, connection.ownerId)
      && context.current.sessionId === connection.sessionId && context.current.playerId === connection.playerId;
  }
  function beginConnection() {
    context.current.epoch++; context.current.sessionId = ''; context.current.playerId = ''; context.current.gameOwner = ownerId;
    pendingClaim.current = null; answerInFlight.current = ''; activeQuestion.current = -1; answeredIdx.current = -1;
    setViewOwner(ownerId); setViewConnection(null); setClaimError(''); setXp(null); setResult(null); setReceiptNotice(''); setPractice(null);
    return context.current.epoch;
  }

  // Drop recovery: a stashed session means a refresh/crash mid-game — offer to rejoin.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResume(loadArenaSession('live'));
  }, []);
  async function rejoin(s: ArenaSession) {
    if (userLoading) return;
    const epoch = beginConnection(); const owner = ownerId;
    let stateVersion: number | null = null;
    setBusy(true); setErr('');
    try {
      const r = await liveRejoin(sb, s.code, s.alias);
      if (!currentRequest(epoch, owner)) return;
      if (!r) throw new Error('Could not find your player in that game.');
      setAlias(s.alias); setCode(s.code);
      connect(r.session_id, r.player_id, epoch, owner);
      const request = loadState(r.session_id, r.player_id, epoch, owner); stateVersion = loadVersion.current;
      await request;
      if (currentRequest(epoch, owner) && stateVersion === loadVersion.current) setResume(null);
    } catch (e) {
      if (currentRequest(epoch, owner) && (stateVersion === null || stateVersion === loadVersion.current)) setErr(msg(e)); // keep the recovery offer for an explicit retry
    } finally { if (currentRequest(epoch, owner) && (stateVersion === null || stateVersion === loadVersion.current) && !answerInFlight.current) setBusy(false); }
  }

  function connect(sid: string, pid: string, epoch: number, owner: string | null) {
    context.current.sessionId = sid; context.current.playerId = pid;
    setViewConnection({ epoch, ownerId: owner, sessionId: sid, playerId: pid }); setPlayerId(pid);
    subRef.current?.();
    subRef.current = subscribeGame(sb, sid, { onSession: () => {
      const request = loadRef.current(sid, pid, epoch, owner); const version = loadVersion.current;
      void request.catch((e) => { if (currentRequest(epoch, owner) && version === loadVersion.current) setErr(msg(e)); });
    } });
    hbRef.current?.(); hbRef.current = startHeartbeat(sb, 'live', pid);
  }

  async function saveClaim(claim: PendingClaim, deferred: boolean) {
    const owner = context.current.ownerId; const epoch = context.current.epoch;
    if (!owner || !context.current.known || claim.ownerId !== owner || !currentRequest(epoch, owner)) return;
    if (!deferred && (context.current.gameOwner !== owner || context.current.playerId !== claim.playerId)) return;
    if (claimInFlight.current?.epoch === epoch) return;
    // Bind a deferred score to this sign-in before making a request. Never allow
    // another account to inherit a failed retry through a bare player ID.
    if (deferred && writePendingClaim(claim)) { setClaimError('Browser storage is unavailable. The deferred save was not attempted.'); return; }
    const request = { epoch, ownerId: owner, playerId: claim.playerId };
    claimInFlight.current = request; pendingClaim.current = claim;
    try {
      const r = await claimGameXp(sb, claim.playerId);
      if (!currentRequest(epoch, owner)) return;
      const storageError = clearConfirmedClaim(claim);
      setViewOwner(owner); setXp({ awarded: r.awarded, total: r.total_xp }); setPhase('complete');
      setClaimError(storageError ? 'Score saved, but browser recovery data could not be cleared. Do not retry this confirmed save.' : '');
    } catch (e) { if (currentRequest(epoch, owner)) setClaimError(`Your score has not been confirmed as saved. ${msg(e)}`); }
    finally { if (claimInFlight.current === request) claimInFlight.current = null; }
  }

  useEffect(() => {
    if (!user || userLoading || xp) return;
    let active = true;
    const epoch = context.current.epoch;
    void Promise.resolve().then(() => {
      if (!active || !currentRequest(epoch, user.id)) return;
      const stored = readPendingClaim();
      if (stored.error) { setClaimError(cacheMessage(stored.error)); return; }
      if (!stored.claim) return;
      if (stored.claim.ownerId && stored.claim.ownerId !== user.id) { setClaimError('A deferred score belongs to a different sign-in. Switch back to that account to retry it.'); return; }
      void saveClaim({ ...stored.claim, ownerId: user.id }, true);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userLoading, xp]);

  useEffect(() => {
    let active = true;
    const epoch = context.current.epoch;
    if (phase === 'complete' && user && !userLoading && playerId && !xp) void Promise.resolve().then(() => {
      if (active && currentRequest(epoch, user.id)) void saveClaim({ version: 1, playerId, ownerId: user.id }, false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, user, userLoading, playerId, xp]);

  function retryClaim() {
    const claim = pendingClaim.current;
    if (!claim || claim.ownerId !== ownerId) { setClaimError('Switch back to the account that started this save to retry.'); return; }
    setClaimError(''); void saveClaim(claim, true);
  }
  function saveScore() {
    const error = writePendingClaim({ version: 1, playerId, ownerId });
    if (error) setClaimError('Browser storage is unavailable. Your score cannot be carried through sign-in on this device.');
    else router.push('/login?next=/join');
  }
  async function retryResults() {
    // Capture this render's connection, never adopt a newer room's epoch when
    // an old button is invoked. Repeated reads can supersede a hung read; the
    // newest load version owns the result independently of answer submission.
    const connection = viewConnection;
    if (userLoading || !currentConnection(connection)) return;
    setErr('');
    const request = loadState(connection.sessionId, connection.playerId, connection.epoch, connection.ownerId);
    const version = loadVersion.current;
    try { await request; }
    catch (e) { if (currentConnection(connection) && version === loadVersion.current) setErr(msg(e)); }
  }

  async function loadState(sid: string, pid: string, epoch: number, owner: string | null) {
    const connection = { epoch, ownerId: owner, sessionId: sid, playerId: pid };
    if (!currentConnection(connection)) return;
    const version = ++loadVersion.current;
    let lq: LiveQuestion;
    try {
      lq = await getLiveQuestion(sb, sid);
      if (!lq) throw new Error('Game state is unavailable. Your saved game is kept; try rejoining.');
    } catch (e) {
      if (!currentConnection(connection) || version !== loadVersion.current) return;
      // A newer failed read supersedes the connection's initial read, including
      // its cleanup. Release that busy state without unlocking a current answer.
      if (!answerInFlight.current) setBusy(false);
      throw e;
    }
    if (!currentConnection(connection) || version !== loadVersion.current) return;
    if (lq.status !== 'active' || activeQuestion.current !== lq.index) {
      activeQuestion.current = lq.status === 'active' ? lq.index : -1;
      answerInFlight.current = ''; setBusy(false); setPractice(null);
    }
    if (lq.status === 'complete') {
      setPhase('finishing'); setBusy(true);
      let players;
      try { players = await fetchPlayers(sb, sid); }
      catch (e) { if (currentConnection(connection) && version === loadVersion.current) { setBusy(false); throw e; } else return; }
      if (!currentConnection(connection) || version !== loadVersion.current) return;
      let standing;
      try { standing = finalStanding(players, pid); }
      catch (e) { setBusy(false); throw e; }
      setMe(standing);
      setPhase('complete'); setBusy(false);
      clearArenaSession('live'); // nothing to rejoin
      return;
    }
    if (lq.status === 'lobby') { setPhase('lobby'); return; }
    activeQuestion.current = lq.index;
    setQ(lq);
    const cached = readAcknowledgedAnswer({ sessionId: sid, playerId: pid, index: lq.index, ownerId: owner });
    if (cached.receipt) {
      answeredIdx.current = lq.index; setResult(cached.receipt.result); setReceiptNotice('Last acknowledged answer saved on this device.'); setPhase('answered'); return;
    }
    if (cached.error) setErr(cacheMessage(cached.error));
    setReceiptNotice('');
    if (answeredIdx.current === lq.index) { setPhase('answered'); }
    else { setResult(null); setPhase('question'); }
  }
  const loadRef = useRef(loadState);
  useEffect(() => { loadRef.current = loadState; });

  async function join(e: React.FormEvent) {
    e.preventDefault(); if (userLoading) return;
    const epoch = beginConnection(); const owner = ownerId;
    let stateVersion: number | null = null;
    setBusy(true); setErr('');
    try {
      const j = await joinGame(sb, code, alias);
      if (!currentRequest(epoch, owner)) return;
      saveArenaSession('live', { code, room: j.session_id, player: j.player_id, alias });
      connect(j.session_id, j.player_id, epoch, owner);
      const request = loadState(j.session_id, j.player_id, epoch, owner); stateVersion = loadVersion.current;
      await request;
    } catch (e) { if (currentRequest(epoch, owner) && (stateVersion === null || stateVersion === loadVersion.current)) setErr(msg(e)); }
    finally { if (currentRequest(epoch, owner) && (stateVersion === null || stateVersion === loadVersion.current) && !answerInFlight.current) setBusy(false); }
  }

  async function answer(choice: number) {
    const connection = viewConnection;
    if (!q || userLoading || !currentConnection(connection)) return;
    const { epoch, ownerId: owner, sessionId, playerId } = connection; const index = q.index;
    const request = `${epoch}:${sessionId}:${playerId}:${index}`;
    if (activeQuestion.current !== index || answeredIdx.current === index
      || answerInFlight.current === request || !Number.isInteger(choice) || choice < 0 || choice >= (q.options?.length ?? 0)) return;
    answerInFlight.current = request; setBusy(true); setErr('');
    try {
      const response = await submitAnswer(sb, playerId, index, choice);
      if (!currentConnection(connection) || activeQuestion.current !== index) return;
      const r = checkedReceipt(response, choice, q.options?.length ?? 0);
      answeredIdx.current = index; setResult({ ...r });
      const warning = writeAcknowledgedAnswer({ version: 1, sessionId, playerId, index, ownerId: owner, result: { ...r } });
      setReceiptNotice(warning ? cacheMessage(warning) : ''); setPhase('answered');
    } catch (e) { if (currentConnection(connection) && activeQuestion.current === index) setErr(msg(e)); }
    finally {
      if (answerInFlight.current === request && currentConnection(connection)) { answerInFlight.current = ''; setBusy(false); }
    }
  }

  if (phase === 'form' || (!userLoading && viewOwner !== ownerId)) {
    return (
      <Shell>
        <H>Join a game</H>
        {resume && (
          <button onClick={() => rejoin(resume)} disabled={busy || userLoading}
            className="mt-5 w-full rounded-2xl border border-gold bg-gold/15 px-4 py-3 text-left active:translate-y-0.5 disabled:opacity-40">
            <span className="font-display font-extrabold text-golddeep">↩️ Rejoin game {resume.code}</span>
            <span className="block text-sm text-inksoft">Reconnect as {resume.alias} and check the server’s current game state.</span>
          </button>
        )}
        <form onSubmit={join} className="mt-6 space-y-4">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-label="Game code" placeholder="CODE" maxLength={6} autoCapitalize="characters"
            className="w-full rounded-xl bg-panel border border-rule px-4 py-4 text-center text-3xl font-black tracking-[0.3em] outline-none focus:border-plum" />
          <input value={alias} onChange={(e) => setAlias(e.target.value)}
            aria-label="Your name" placeholder="Your name" maxLength={20}
            className="w-full rounded-xl bg-panel border border-rule px-4 py-3 outline-none focus:border-plum" />
          <button disabled={busy || userLoading || code.length < 6 || !alias.trim()}
            className="w-full rounded-xl bg-plum hover:bg-plumdeep text-white px-4 py-4 font-semibold disabled:opacity-40">
            Join
          </button>
        </form>
        {err && <Err>{err}</Err>}
        {claimError && <Err>{claimError}</Err>}
        {claimError && user && !xp && <button onClick={retryClaim} className="mt-3 underline">Retry saving score</button>}
      </Shell>
    );
  }

  if (phase === 'finishing') {
    return <Shell><H>Loading final scores…</H>
      {err && <Err>{err}</Err>}
      <button disabled={userLoading} onClick={retryResults} className="mt-4 underline disabled:opacity-40">Retry loading results</button>
    </Shell>;
  }

  if (phase === 'lobby') {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-5xl mb-4">⏳</div>
          <H>You’re in, {alias}!</H>
          <p className="text-inksoft mt-2">Waiting for the host to start…</p>
          <button onClick={retryResults} disabled={userLoading} className="mt-4 underline disabled:opacity-40">Refresh game state</button>
          {err && <Err>{err}</Err>}
        </div>
      </Shell>
    );
  }

  if (phase === 'question' && q) {
    return (
      <Shell wide>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Question {q.index + 1}/{q.total}</span>
          <span className={`font-bold tabular-nums ${timer.remaining <= 5 ? 'text-brick' : 'text-ink'}`}>{timer.remaining}s</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-parchment-deep overflow-hidden">
          <div className="h-full bg-gold transition-[width] duration-200" style={{ width: `${timer.frac * 100}%` }} />
        </div>
        {q.is_double && (
          <div className="mt-2 rounded-lg bg-gold/25 border border-gold px-3 py-1.5 text-center text-golddeep text-sm font-bold animate-pulse">
            ⚡ DOUBLE POINTS — get this one!
          </div>
        )}
        <button type="button" aria-pressed={largeText} onClick={() => setLargeText(!largeText)} className="mt-3 text-sm underline">{largeText ? 'Standard text' : 'Larger text'}</button>
        <h2 className={`mt-3 ${largeText ? 'text-3xl md:text-4xl' : 'text-xl md:text-3xl'} md:text-center font-display font-bold leading-snug`}><MathText text={q.stem} /></h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {(q.options ?? []).map((o, i) => (
            <AnswerTile key={i} index={i} disabled={busy || userLoading || timer.expired} onClick={() => answer(i)}>
              <span className={largeText ? 'text-2xl leading-relaxed' : undefined}><MathText text={o} /></span>
            </AnswerTile>
          ))}
        </div>
        {timer.expired && <p className="mt-4 text-center text-inksoft">⏰ Time’s up — waiting for the next question…</p>}
        <button onClick={retryResults} disabled={userLoading} className="mt-4 text-sm underline disabled:opacity-40">Refresh game state</button>
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  if (phase === 'answered' && q) {
    return (
      <Shell>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          {result?.is_correct ? (
            <><div className="text-6xl mb-3">✅</div><H>Correct!</H><p className="text-berrydeep text-2xl font-bold mt-2">+{result.points}</p></>
          ) : (
            <><div className="text-6xl mb-3">❌</div><H>Not quite</H>
              <p className="text-inksoft mt-2">Answer: <span className="text-ink font-semibold"><MathText text={q.options?.[result?.correct_index ?? -1] ?? ''} /></span></p></>
          )}
          {result && <p className="mt-3 text-sm text-inksoft">This game does not supply an explanation yet. Ask your teacher to talk through the answer.</p>}
          {result && !result.is_correct && practice?.index !== q.index && <button onClick={() => { if (currentConnection(viewConnection) && activeQuestion.current === q.index) setPractice({ index: q.index, choice: null }); }} className="mt-4 underline">Try again, unscored</button>}
          {result && practice?.index === q.index && <section aria-label="Unscored learning retry" className="mt-5 w-full text-left">
            <h2 className="font-semibold">Learning check · no extra points</h2>
            <p className={`mt-2 ${largeText ? 'text-2xl leading-relaxed' : ''}`}><MathText text={q.stem} /></p>
            <div className="mt-3 grid gap-2">{(q.options ?? []).map((option, index) => <button key={index}
              disabled={practice.choice !== null} onClick={() => {
                if (currentConnection(viewConnection) && activeQuestion.current === q.index) setPractice({ index: q.index, choice: index });
              }} className={`rounded-xl border border-rule p-3 text-left disabled:opacity-70 ${largeText ? 'text-2xl' : ''}`}><MathText text={option} /></button>)}</div>
            {practice.choice !== null && <p role="status" className="mt-3">{practice.choice === result.correct_index ? 'That matches the answer. No score changed.' : 'Review the answer above with your teacher. No score changed.'}</p>}
          </section>}
          <p className="text-muted mt-6 text-sm">Waiting for the next question…</p>
          <button onClick={retryResults} disabled={userLoading} className="mt-3 text-sm underline disabled:opacity-40">Refresh game state</button>
          {err && <Err>{err}</Err>}
          {receiptNotice && <p role="status" className="mt-3 text-sm text-inksoft">{receiptNotice}</p>}
        </div>
      </Shell>
    );
  }

  // complete
  return (
    <Shell>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="text-berrydeep font-semibold text-sm">GAME OVER</p>
        <div className="text-6xl my-3">{me && me.rank <= 3 ? '🏆' : '🎉'}</div>
        <H>{me ? `#${me.rank}` : 'Done'}</H>
        <p className="text-ink mt-2 text-xl font-bold">{me?.score ?? xp?.awarded ?? 0} pts</p>

        {xp ? (
          <p className="mt-4 rounded-xl bg-leaf/15 border border-leaf/50 px-4 py-3 text-leaf text-sm">
            Saved! +{xp.awarded} XP · {xp.total} total
          </p>
        ) : user ? (
          <p className="mt-4 text-muted text-sm">Saving your score…</p>
        ) : (
          <button onClick={saveScore} className="mt-6 rounded-xl bg-plum hover:bg-plumdeep text-white px-6 py-3 font-semibold">
            Save my {me?.score ?? 0} pts
          </button>
        )}

        {claimError && <Err>{claimError}</Err>}
        {claimError && user && !xp && <button onClick={retryClaim} className="mt-3 underline">Retry saving score</button>}
        <Link href="/join" className="mt-8 text-sm text-muted underline">Play another</Link>
      </div>
    </Shell>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => (
  <main className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${wide ? 'max-w-md md:max-w-4xl md:justify-center md:px-12' : 'max-w-md'}`}>{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-bold">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p role="alert" className="mt-4 text-brick text-sm">{children}</p>;
