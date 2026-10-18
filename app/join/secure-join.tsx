'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useUser } from '@/lib/use-user';
import { useCountdown } from '@/lib/use-countdown';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import { classroomTransport, ClassroomRecoveryController } from '@/lib/classroom-recovery';

// Local-only integration candidate for the actual join route. The imported
// transport is disconnected. No legacy alias rejoin, roster, receipt cache,
// presence write, or claim RPC is used as a security fallback.
export default function JoinPage() {
  const { user, loading: userLoading } = useUser();
  const ownerId = user?.id ?? null;
  const controller = useMemo(() => new ClassroomRecoveryController(classroomTransport), []);
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [code, setCode] = useState('');
  const [alias, setAlias] = useState('');
  const [largeText, setLargeText] = useState(false);
  const [practice, setPractice] = useState<{ epoch: number; index: number; choice: number | null } | null>(null);
  useEffect(() => { controller.mount(); return () => controller.dispose(); }, [controller]);
  useEffect(() => { controller.setIdentity(ownerId, userLoading); }, [controller, ownerId, userLoading]);
  // Hide the prior identity immediately, before its effect cleanup is scheduled.
  const ready = !userLoading && view.known && view.identity === ownerId;
  const snapshot = ready ? view.snapshot : null;
  const q = snapshot?.question;
  const result = snapshot?.ownReceipt;
  const phase = ready ? view.phase : 'form';
  const timer = useCountdown(snapshot?.startedAt == null ? null : new Date(snapshot.startedAt).toISOString(), (snapshot?.durationMs ?? 15000) / 1000);
  const enabled = ready && classroomTransport.enabled;
  const refresh = () => { if (enabled) return controller.refresh(view); };
  const error = view.error && ready ? <Err>{view.error}</Err> : null;
  const notice = view.notice && ready ? <p role="status" className="mt-3 text-sm text-inksoft">{view.notice}</p> : null;
  const currentView = () => controller.getSnapshot().epoch === view.epoch;
  const reset = () => { if (currentView()) { controller.reset(); setPractice(null); } };
  const currentPractice = () => { const latest = controller.getSnapshot(); return currentView() && latest.phase === 'answered' && latest.snapshot?.index === snapshot?.index; };

  if (phase === 'form' || phase === 'connecting') return (
    <Shell>
      <H>Join a game</H>
      {!classroomTransport.enabled && <p role="status" className="mt-4 text-inksoft">Local review only. Secure classroom recovery is not connected in this candidate.</p>}
      <button onClick={() => { if (enabled && currentView()) return controller.restore(); }} disabled={!enabled || view.busy}
        className="mt-5 w-full rounded-2xl border border-gold bg-gold/15 px-4 py-3 text-left disabled:opacity-40">
        <span className="font-display font-extrabold text-golddeep">↩️ Reconnect my game</span>
        <span className="block text-sm text-inksoft">Use the secure session already issued to this browser. A name or game code cannot recover someone’s player.</span>
      </button>
      <form onSubmit={(e) => { e.preventDefault(); if (enabled && currentView()) return controller.join(code, alias); }} className="mt-6 space-y-4">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Game code" placeholder="CODE" maxLength={6} autoCapitalize="characters"
          className="w-full rounded-xl bg-panel border border-rule px-4 py-4 text-center text-3xl font-black tracking-[0.3em] outline-none focus:border-plum" />
        <input value={alias} onChange={(e) => setAlias(e.target.value)} aria-label="Your name" placeholder="Your name" maxLength={20}
          className="w-full rounded-xl bg-panel border border-rule px-4 py-3 outline-none focus:border-plum" />
        <button disabled={!enabled || view.busy || !/^[A-Z0-9]{6}$/.test(code) || !alias.trim()}
          className="w-full rounded-xl bg-plum hover:bg-plumdeep text-white px-4 py-4 font-semibold disabled:opacity-40">Join</button>
      </form>
      <p className="mt-3 text-sm text-muted">You can play as a guest.</p>
      {view.busy && ready && <p role="status" className="mt-3">Checking your game…</p>}
      {error}
    </Shell>
  );

  if (phase === 'unavailable' || phase === 'finishing') return (
    <Shell>
      <H>{phase === 'finishing' ? 'Loading your final score…' : 'Your game needs a fresh check'}</H>
      {error}
      <button disabled={!enabled} onClick={refresh} className="mt-4 underline disabled:opacity-40">Retry loading game</button>
      <button onClick={reset} className="mt-4 underline">Back to join</button>
    </Shell>
  );

  if (phase === 'lobby') return (
    <Shell><div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="text-5xl mb-4">⏳</div><H>You’re in!</H>
      <p className="text-inksoft mt-2">Waiting for the host to start…</p>
      <button disabled={!enabled} onClick={refresh} className="mt-4 underline disabled:opacity-40">Refresh game state</button>
      {error}
    </div></Shell>
  );

  if (phase === 'question' && snapshot && q) return (
    <Shell wide>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Question {snapshot.index + 1}/{snapshot.total}</span>
        <span className={`font-bold tabular-nums ${timer.remaining <= 5 ? 'text-brick' : 'text-ink'}`}>{timer.remaining}s</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-parchment-deep overflow-hidden"><div className="h-full bg-gold transition-[width] duration-200" style={{ width: `${timer.frac * 100}%` }} /></div>
      {snapshot.isDouble && <div className="mt-2 rounded-lg bg-gold/25 border border-gold px-3 py-1.5 text-center text-golddeep text-sm font-bold">⚡ DOUBLE POINTS</div>}
      <button type="button" aria-pressed={largeText} onClick={() => setLargeText(!largeText)} className="mt-3 text-sm underline">{largeText ? 'Standard text' : 'Larger text'}</button>
      <h2 className={`mt-3 ${largeText ? 'text-3xl md:text-4xl' : 'text-xl md:text-3xl'} md:text-center font-display font-bold leading-snug`}><MathText text={q.stem} /></h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {q.options.map((option, index) => <AnswerTile key={index} index={index} disabled={!enabled || view.busy || timer.expired}
          onClick={() => { if (enabled && !timer.expired) return controller.answer(view, index); }}>
          <span className={largeText ? 'text-2xl leading-relaxed' : undefined}><MathText text={option} /></span>
        </AnswerTile>)}
      </div>
      {timer.expired && <p className="mt-4 text-center text-inksoft">⏰ Time’s up. Waiting for the next question…</p>}
      <button onClick={refresh} disabled={!enabled} className="mt-4 text-sm underline disabled:opacity-40">Refresh game state</button>
      {error}{notice}
    </Shell>
  );

  if (phase === 'answered' && snapshot && result) {
    const frozen = result.keyProvenance === 'frozen' && q && result.correctIndex !== null;
    const practicing = frozen && practice?.epoch === view.epoch && practice.index === snapshot.index;
    return <Shell><div className="flex-1 flex flex-col items-center justify-center text-center">
      {frozen ? <>
        <div className="text-6xl mb-3">{result.isCorrect ? '✅' : '❌'}</div><H>{result.isCorrect ? 'Correct!' : 'Not quite'}</H>
        {!result.isCorrect && <p className="text-inksoft mt-2">Answer: <span className="text-ink font-semibold"><MathText text={q.options[result.correctIndex!]} /></span></p>}
        <p className="mt-3 text-sm text-inksoft">Your accepted choice: <MathText text={q.options[result.acceptedChoice]} /></p>
        <p className="mt-3 text-sm text-inksoft">This game does not supply an explanation yet. Ask your teacher to talk through the answer.</p>
        {!result.isCorrect && !practicing && <button onClick={() => { if (currentPractice()) setPractice({ epoch: view.epoch, index: snapshot.index, choice: null }); }} className="mt-4 underline">Try again, unscored</button>}
        {practicing && <section aria-label="Unscored learning retry" className="mt-5 w-full text-left">
          <h2 className="font-semibold">Learning check · no extra points</h2><p className={`mt-2 ${largeText ? 'text-2xl leading-relaxed' : ''}`}><MathText text={q.stem} /></p>
          <div className="mt-3 grid gap-2">{q.options.map((option, index) => <button key={index} disabled={practice.choice !== null}
            onClick={() => { if (currentPractice()) setPractice({ epoch: view.epoch, index: snapshot.index, choice: index }); }} className={`rounded-xl border border-rule p-3 text-left disabled:opacity-70 ${largeText ? 'text-2xl' : ''}`}><MathText text={option} /></button>)}</div>
          {practice.choice !== null && <p role="status" className="mt-3">{practice.choice === result.correctIndex ? 'That matches the answer. No score changed.' : 'Review the answer above with your teacher. No score changed.'}</p>}
        </section>}
      </> : <>
        <H>Answer recorded</H>
        <p className="mt-3 text-inksoft">Historical question content is unavailable. Your accepted answer and points are recorded, but we cannot show a verified answer key or offer a learning retry.</p>
      </>}
      <p className="text-berrydeep text-2xl font-bold mt-2">+{result.points} points recorded</p>
      {notice}
      <p className="text-muted mt-6 text-sm">Waiting for the next question…</p>
      <button onClick={refresh} disabled={!enabled} className="mt-3 text-sm underline disabled:opacity-40">Refresh game state</button>
      {error}
    </div></Shell>;
  }

  if (phase === 'complete' && view.standing) return (
    <Shell><div className="flex-1 flex flex-col items-center justify-center text-center">
      <p className="text-berrydeep font-semibold text-sm">GAME OVER</p>
      <div className="text-6xl my-3">{view.standing.rank <= 3 ? '🏆' : '🎉'}</div><H>#{view.standing.rank}</H>
      <p className="text-ink mt-2 text-xl font-bold">{view.standing.score} pts</p>
      <p role="status" className="mt-4 text-muted text-sm">XP saving is unavailable in this local candidate. No XP claim has been sent or confirmed.</p>
      <button onClick={refresh} disabled={!enabled} className="mt-4 underline">Refresh my result</button>
      <button onClick={reset} className="mt-8 text-sm text-muted underline">Play another</button>
    </div></Shell>
  );
  return <Shell><H>Checking your game…</H><button onClick={refresh} disabled={!enabled} className="mt-4 underline">Retry loading game</button>{error}</Shell>;
}
const Shell = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => <main className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${wide ? 'max-w-md md:max-w-4xl md:justify-center md:px-12' : 'max-w-md'}`}>{children}</main>;
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-bold">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p role="alert" className="mt-4 text-brick text-sm">{children}</p>;
