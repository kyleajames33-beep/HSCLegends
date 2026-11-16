'use client';

import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Crosshair, Heart, RotateCcw, Shield, Sparkles, Trophy, Zap } from 'lucide-react';
import { ARENA_ROUNDS, ARENA_SCOPE, arenaQuestionsFromDraft, arenaRank, arenaRoundLimit, arenaWon, questionFor } from '@/lib/solo-arena';
import { ARENA_DRAFT_KEY, ARENA_SAVE_KEY, arenaSessionReducer, initialArenaSession, restoreArenaSession, serializeArenaSession } from '@/lib/solo-arena-recovery';
import styles from './solo-arena.module.css';

const saveListeners = new Set<() => void>();
function subscribeSave(listener: () => void) {
  saveListeners.add(listener);
  window.addEventListener('storage', listener);
  window.addEventListener('popstate', listener);
  return () => { saveListeners.delete(listener); window.removeEventListener('storage', listener); window.removeEventListener('popstate', listener); };
}
function readSave() { try { return sessionStorage.getItem(ARENA_SAVE_KEY) ?? ''; } catch { return ''; } }
function readDraft() {
  if (new URLSearchParams(window.location.search).get('draft') !== '1') return '';
  try { return sessionStorage.getItem(ARENA_DRAFT_KEY) || 'missing'; } catch { return 'missing'; }
}
function serverSave() { return ''; }

export default function SoloArena() {
  const [session, dispatch] = useReducer(arenaSessionReducer, undefined, initialArenaSession);
  const [resumeError, setResumeError] = useState(false);
  const state = session.game;
  const saved = useSyncExternalStore(subscribeSave, readSave, serverSave);
  const rawDraft = useSyncExternalStore(subscribeSave, readDraft, serverSave);
  const prepared = useMemo(() => rawDraft && rawDraft !== 'missing' ? arenaQuestionsFromDraft(rawDraft) : null, [rawDraft]);
  const draftRequested = Boolean(rawDraft);
  const customView = state.phase === 'ready' ? draftRequested : state.customDraft;
  const roundLimit = state.phase === 'ready' && prepared ? Math.min(ARENA_ROUNDS, prepared.length) : arenaRoundLimit(state);
  const canResume = state.phase === 'ready' && session.actions === null && !!saved && !!restoreArenaSession(saved, Number.MAX_SAFE_INTEGER - 1000);
  const heading = useRef<HTMLHeadingElement>(null);
  const q = questionFor(state);
  const receipt = state.receipts.at(-1);
  const alive = state.rivals.filter(r => r.lives > 0).length;
  const seconds = Math.ceil(state.remaining / 1000);
  useEffect(() => { heading.current?.focus(); }, [state.phase, state.round]);
  useEffect(() => {
    if (state.phase !== 'round') return;
    const run = state.run;
    const timer = window.setInterval(() => dispatch({ type: 'tick', run, now: Date.now() }), 200);
    return () => window.clearInterval(timer);
  }, [state.phase, state.round, state.run]);
  useEffect(() => {
    if (session.actions === null) return;
    try {
      if (session.actions.length === 0) sessionStorage.removeItem(ARENA_SAVE_KEY);
      else sessionStorage.setItem(ARENA_SAVE_KEY, serializeArenaSession(session.actions, session.baseRun));
      saveListeners.forEach(listener => listener());
    } catch { /* The game remains playable when browser storage is unavailable. */ }
  }, [session.actions, session.baseRun]);
  const outcome = state.phase === 'done' ? (arenaWon(state) ? 'Arena champion!' : state.lives === 0 ? 'Knocked out!' : 'Arena complete!') : '';
  const missed = state.receipts.filter(r => !r.correct);
  return (
    <main className={`arcade-surface ${styles.page}`}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <Link href="/games" prefetch={false} className={styles.back}><ArrowLeft size={17} aria-hidden /> Games</Link>
          <span className={styles.brand}>HSC LEGENDS <span aria-hidden>✦</span></span>
          <span className={styles.badge}>SOLO · OFFLINE</span>
        </header>
        <div className={styles.titleRow}><div><p className={styles.kicker}>{customView ? 'YOUR QUESTION DRAFT' : 'CHEMISTRY SURVIVAL ARENA'}</p><h1>KNOCKOUT <span>SOLO</span></h1></div><div className={styles.rivalLabel}>5 simulated rivals<br /><b>One arena. Stay standing.</b></div></div>
        {state.phase === 'ready' ? (
          <section className={styles.intro} aria-labelledby="arena-ready">
            <div className={styles.introArt}><div className={styles.artCaption}><span className={styles.badge}>{roundLimit} ROUNDS MAX</span><p>Outlast the arena.</p></div></div>
            <div className={styles.introPanel}>
              <p className={styles.kicker}>YOUR NEXT CHALLENGE</p><h2 ref={heading} tabIndex={-1} id="arena-ready">Three hearts.<br />Make them count.</h2>
              <p>Answer before the clock hits zero. Miss and lose a heart. Correct answers charge your powers.</p>
              <div className={styles.rules}><span><Heart aria-hidden /> 3 hearts</span><span><Zap aria-hidden /> 2 starting energy</span><span><Crosshair aria-hidden /> 20 sec / round</span></div>
              {draftRequested && <p role={prepared ? undefined : 'alert'}>{prepared ? `Previewing ${prepared.length} unreviewed teacher ${prepared.length === 1 ? 'question' : 'questions'} on this device.` : 'This question draft is unavailable or invalid. Return to the question tool to prepare it again.'}</p>}
              <button className={styles.primary} disabled={draftRequested && !prepared} onClick={() => dispatch({ type: 'start', now: Date.now(), seed: Math.floor(Math.random() * 1000000), ...(draftRequested ? { draft: rawDraft } : {}) })}>ENTER ARENA <ArrowRight aria-hidden size={19} /></button>
              {draftRequested && !prepared && <Link href="/question-import" prefetch={false} className={styles.otherGame}>Prepare questions →</Link>}
              {canResume && <><button className={styles.otherGame} onClick={() => { const now = Date.now(); if (!restoreArenaSession(saved, now)) { setResumeError(true); return; } dispatch({ type: 'resume', raw: saved, now }); }}>Resume previous game →</button><p>{resumeError ? 'This saved game can’t be resumed. Start a new game.' : 'Returning to a question keeps its clock running.'}</p></>}
              <details className={styles.details}><summary>Rules &amp; content</summary><p>Rivals are simulated on this device. Each has two hearts. Survive up to {roundLimit} rounds; surviving players rank ahead of eliminated players, then by correct answers and remaining hearts. Equal scores share a place.</p><p>Shield costs 2 energy and protects one miss this round. Scan costs 2 energy and removes up to two wrong answers. Each correct answer earns 1 energy, capped at 3. Feedback pauses the clock.</p><p>{customView ? 'Teacher-supplied draft questions, not yet educator-reviewed.' : `${ARENA_SCOPE}. Original sample questions awaiting educator review.`} No account rewards or online leaderboard.</p></details>
            </div>
          </section>
        ) : (
          <>
            <section className={styles.hud} aria-label="Arena status">
              <div><span>ROUND</span><strong>{Math.min(state.round + 1, roundLimit)}<small> / {roundLimit}</small></strong></div>
              <div className={seconds <= 5 && state.phase === 'round' ? styles.urgent : ''}><span>{state.phase === 'round' ? 'TIME LEFT' : 'CLOCK PAUSED'}</span><strong role="timer" aria-label={`${seconds} seconds remaining`}>{String(seconds).padStart(2, '0')}<small> SEC</small></strong></div>
              <div><span>YOUR HEARTS</span><strong className={styles.hearts} aria-label={`${state.lives} of 3 hearts`}>{[0, 1, 2].map(i => <Heart key={i} aria-hidden fill={i < state.lives ? 'currentColor' : 'none'} className={i < state.lives ? '' : styles.emptyHeart} />)}</strong></div>
              <div><span>ENERGY</span><strong className={styles.energy}>{state.energy}<small> / 3</small> <Zap size={20} aria-hidden /></strong></div>
            </section>
            <div className={styles.gameGrid}>
              <aside className={styles.arena} aria-label="Simulated rival standings">
                <div className={styles.arenaPicture}><div><span className={styles.badge}>SIMULATED RIVALS</span><p>{alive} / 5 standing</p></div></div>
                <div className={styles.roster}>{state.rivals.map(r => <div key={r.id} className={`${styles.rival} ${r.lives === 0 ? styles.eliminated : ''}`}><span className={styles.avatar} aria-hidden>{r.glyph}</span><span><b>{r.name}</b><small>{r.lives === 0 ? 'ELIMINATED' : r.last === 'correct' ? 'CORRECT +1' : r.last === 'miss' ? 'MISSED −1 HEART' : 'READY'}</small></span><span className={styles.rivalHearts} aria-label={`${r.lives} hearts`}>{'♥'.repeat(r.lives) || '—'}</span></div>)}</div>
                <p className={styles.standingsNote}>Rivals are computer simulations.<br />Your correct answers: <b>{state.correct}</b></p>
              </aside>
              <section className={styles.play} aria-label="Current round">
                {state.phase === 'round' ? <>
                  <div className={styles.questionMeta}><span>ROUND {state.round + 1}</span><span>{state.shield ? 'SHIELD ARMED' : '+1 ENERGY FOR CORRECT'}</span></div>
                  <p className={styles.topic}>{q.topic}</p><h2 ref={heading} tabIndex={-1}>{q.stem}</h2>{q.equation && <p className={styles.equation}>{q.equation}</p>}
                  <div className={styles.answers}>{q.answers.map((a, i) => <button key={i} onClick={() => dispatch({ type: 'answer', run: state.run, round: state.round, choice: i, now: Date.now() })} disabled={state.hidden.includes(i)}><span>{String.fromCharCode(65 + i)}</span>{state.hidden.includes(i) ? <span className={styles.scanned}>Removed by Scan</span> : a}</button>)}</div>
                  <div className={styles.powers}><button onClick={() => dispatch({ type: 'power', power: 'shield', run: state.run, round: state.round, now: Date.now() })} disabled={state.energy < 2 || state.shield}><Shield aria-hidden size={20} /><span><b>{state.shield ? 'Shield armed' : 'Shield · 2 energy'}</b><small>Protect one miss this round</small></span></button><button onClick={() => dispatch({ type: 'power', power: 'scan', run: state.run, round: state.round, now: Date.now() })} disabled={state.energy < 2 || state.hidden.length > 0}><Crosshair aria-hidden size={20} /><span><b>{state.hidden.length ? 'Scan used' : 'Scan · 2 energy'}</b><small>Remove up to two wrong answers</small></span></button></div>
                </> : state.phase === 'reveal' && receipt ? <>
                  <div className={`${styles.resultIcon} ${receipt.correct ? styles.good : styles.bad}`}>{receipt.correct ? <Sparkles aria-hidden size={32} /> : receipt.blocked ? <Shield aria-hidden size={32} /> : <Heart aria-hidden size={32} />}</div>
                  <p className={styles.kicker}>ROUND {state.round + 1} COMPLETE</p><h2 ref={heading} tabIndex={-1}>{receipt.correct ? 'Still standing.' : receipt.blocked ? 'Shield saved you.' : receipt.timeout ? 'Time ran out.' : 'One heart down.'}</h2>
                  <p className={styles.revealSummary}>{receipt.correct ? '+1 energy. A strong round.' : receipt.blocked ? 'Your shield absorbed the missed answer.' : state.lives > 0 ? `${state.lives} ${state.lives === 1 ? 'heart' : 'hearts'} left. You can recover.` : 'No hearts left. Review the answer and try again.'}</p>
                  <p className={styles.correctAnswer}><span>CORRECT ANSWER</span>{q.answers[q.answer]}</p><p className={styles.explanation}>{q.explanation}</p>
                  <button className={styles.primary} onClick={() => dispatch({ type: 'next', run: state.run, round: state.round, now: Date.now() })}>{state.lives === 0 || alive === 0 || state.round + 1 >= roundLimit ? 'SEE RESULTS' : 'NEXT ROUND'} <ArrowRight aria-hidden size={19} /></button>
                </> : <>
                  <div className={`${styles.resultIcon} ${arenaWon(state) ? styles.good : styles.bad}`}><Trophy aria-hidden size={32} /></div><p className={styles.kicker}>ARENA RESULTS</p><h2 ref={heading} tabIndex={-1}>{outcome}</h2>
                  <div className={styles.finalStats}><div><strong>#{arenaRank(state)}</strong><span>FINAL PLACE</span></div><div><strong>{state.correct}<small>/{state.receipts.length}</small></strong><span>CORRECT</span></div><div><strong>{state.lives}</strong><span>HEARTS LEFT</span></div></div>
                  <p className={styles.explanation}>{arenaWon(state) ? 'You finished at the top of the simulated field. Pick another strategy and play again.' : 'Every arena is another chance. Review the missed answers, then return for a fresh run.'}</p>
                  {missed.length > 0 && <details className={styles.details}><summary>Review {missed.length} missed {missed.length === 1 ? 'answer' : 'answers'}</summary>{missed.map((r, i) => { const item = state.questions[r.questionIndex]; return <div className={styles.reviewItem} key={i}><b>{item.stem}</b><p>{r.timeout ? 'Timed out' : `You chose: ${item.answers[r.picked ?? 0]}`}</p><p className={styles.reviewCorrect}>Correct: {item.answers[item.answer]}</p><p>{item.explanation}</p></div>; })}</details>}
                  <button className={styles.primary} onClick={() => dispatch({ type: 'reset', run: state.run })}>PLAY AGAIN <RotateCcw aria-hidden size={19} /></button><Link href="/demo" prefetch={false} className={styles.otherGame}>Try Lab Rush →</Link>
                </>}
              </section>
            </div>
            <p className={styles.contentNote}>Offline solo game · simulated rivals · {state.customDraft ? 'unreviewed teacher questions' : 'unreviewed Chemistry sample'} · no account rewards</p>
            <p className={styles.srOnly} role="status" aria-live="polite">{state.phase === 'reveal' ? `Round ${state.round + 1} complete. ${receipt?.correct ? 'Correct.' : receipt?.blocked ? 'Shield protected you.' : 'Missed answer.'} ${state.lives} hearts left.` : state.phase === 'done' ? outcome : ''}</p>
          </>
        )}
      </div>
    </main>
  );
}
