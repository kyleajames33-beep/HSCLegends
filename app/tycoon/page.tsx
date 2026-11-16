'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { useSparksAward } from '@/lib/use-sparks-award';
import { getQuizQuestions, SUBJECTS, type Subject, type Question } from '@/lib/questions';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import CountUp from '@/components/count-up';
import { celebrate } from '@/lib/confetti';

// "Lab Tycoon" — the Gimkit-style upgrade loop, specified to HSC. Answer questions
// to earn Research $, spend it on upgrades that compound your earnings. Solo, with
// its own in-mode currency (does NOT touch Sparks). Beat your best in 2 minutes.
const SESSION = 120; // seconds
const MILESTONES = [500, 2000, 8000, 25000, 75000];
// Run targets track total income, so buying an upgrade never loses progress.
const RUN_TARGETS = [50, 150, 400, 1000];
const label = (s: Subject) => SUBJECTS.find((x) => x.id === s)?.label ?? s;
const fmt = (n: number) => '$' + Math.round(n).toLocaleString();

// Upgrade configs: value(level) and cost(level). Costs escalate → exponential pull.
const UP = {
  funding:  { name: 'Lab Funding', desc: '+$ per correct',        icon: '💵', cost: (l: number) => Math.round(10 * 1.6 ** l) },
  grant:    { name: 'Grant Multiplier', desc: '×earnings',         icon: '📈', cost: (l: number) => Math.round(25 * 2 ** l) },
  momentum: { name: 'Momentum', desc: '+streak bonus',             icon: '🔥', cost: (l: number) => Math.round(20 * 1.8 ** l) },
  auto:     { name: 'Auto-Lab', desc: 'passive $/sec',             icon: '🤖', cost: (l: number) => Math.round(60 * 1.8 ** l) },
} as const;
const INSURANCE_COST = 60;

type Phase = 'pick' | 'loading' | 'play' | 'done' | 'error';

export default function TycoonPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-12">
        <p className="text-xs font-black tracking-widest text-plum">SOLO ARCADE</p>
        <h1 className="mt-2 font-display text-4xl font-black text-ink">Lab Tycoon</h1>
        <p className="mt-4 text-inksoft">The connected question bank isn’t available here yet. You can still try a sample run.</p>
        <Link href="/demo" className="lg-btn lg-btn-primary mt-6 px-5 py-4 text-center">Play sample game →</Link>
        <Link href="/" className="mt-5 text-center text-sm text-inksoft underline">Home</Link>
      </main>
    );
  }
  return <ConfiguredTycoonPage />;
}

function ConfiguredTycoonPage() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const sparks = useSparksAward(sb, user?.id);

  const [phase, setPhase] = useState<Phase>('pick');
  const [sel, setSel] = useState<{ subject: Subject; year: 11 | 12 } | null>(null);
  const [queue, setQueue] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);
  const runRef = useRef(0);
  const finishedRef = useRef(false);
  const remainingMsRef = useRef(SESSION * 1000);
  const autoCreditsRef = useRef(0);
  const lastTickRef = useRef(0);
  const questionVersionRef = useRef(0);
  const answeredRef = useRef(false);
  const shopVersionRef = useRef(0);

  // Economy
  const [cash, setCash] = useState(0);
  const [earnedTotal, setEarnedTotal] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [fundingLvl, setFundingLvl] = useState(0);
  const [grantLvl, setGrantLvl] = useState(0);
  const [momentumLvl, setMomentumLvl] = useState(0);
  const [autoLvl, setAutoLvl] = useState(0);
  const [insured, setInsured] = useState(false);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SESSION);
  const [lastEarn, setLastEarn] = useState<{ amt: number; key: number } | null>(null);
  const [best, setBest] = useState(0);
  const fxId = useRef(0);
  const milestoneRef = useRef(0);

  const q = queue[qi];
  // Retained callbacks must not submit against a later question or purchase
  // against an outdated balance before React has rendered the new one.
  const questionVersion = questionVersionRef.current;
  const shopVersion = shopVersionRef.current;
  const renderedRun = runRef.current;

  // Derived earning values.
  const perQ = 5 + fundingLvl * 5;                 // base $ per correct
  const mult = 1 + 0.5 * grantLvl;             // earnings multiplier
  const streakPct = 0.1 * momentumLvl;         // +% per streak step
  const earnFor = (s: number) => Math.max(1, Math.round(perQ * mult * (1 + s * streakPct)));

  useEffect(() => {
    const b = Number(localStorage.getItem('tycoon_best') || 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (b > 0) setBest(b);
  }, []);

  useEffect(() => () => { runRef.current += 1; }, []);

  // Keep fractional elapsed time across question feedback pauses. Restarting a
  // one-second timeout for every answer would let fast players stop the clock.
  useEffect(() => {
    if (phase !== 'play' || remainingMsRef.current <= 0 || picked !== null) return;
    lastTickRef.current = performance.now();
    const update = (publish: boolean) => {
      const now = performance.now();
      const elapsed = Math.max(0, Math.min(remainingMsRef.current, now - lastTickRef.current));
      lastTickRef.current = now;
      remainingMsRef.current -= elapsed;
      autoCreditsRef.current += elapsed * autoLvl / 1000;
      if (!publish) {
        if (remainingMsRef.current <= 0) setTimeLeft(0);
        return;
      }
      const autoCredits = Math.floor(autoCreditsRef.current);
      if (autoCredits > 0) {
        autoCreditsRef.current -= autoCredits;
        setCash((c) => c + autoCredits);
        setEarnedTotal((total) => total + autoCredits);
      }
      setTimeLeft(Math.ceil(remainingMsRef.current / 1000));
    };
    const timer = window.setInterval(() => update(true), 200);
    return () => { window.clearInterval(timer); update(false); };
  }, [phase, autoLvl, picked]);

  // Time's up → finish.
  useEffect(() => {
    if (phase === 'play' && timeLeft <= 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase]);

  // Confetti as the lab crosses cash milestones.
  useEffect(() => {
    if (phase !== 'play') return;
    while (milestoneRef.current < MILESTONES.length && cash >= MILESTONES[milestoneRef.current]) {
      milestoneRef.current += 1;
      celebrate(milestoneRef.current >= 3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cash]);

  async function start(subject: Subject, year: 11 | 12) {
    const run = ++runRef.current;
    questionVersionRef.current += 1; answeredRef.current = false;
    shopVersionRef.current += 1;
    finishedRef.current = false;
    remainingMsRef.current = SESSION * 1000; autoCreditsRef.current = 0;
    setErr(''); setSel({ subject, year }); setPhase('loading');
    sparks.reset();
    advancingRef.current = false; setAdvancing(false);
    setCash(0); setEarnedTotal(0); setCorrectCount(0);
    setFundingLvl(0); setGrantLvl(0); setMomentumLvl(0); setAutoLvl(0); setInsured(false);
    setStreak(0); setTimeLeft(SESSION); setQi(0); setPicked(null); setLastEarn(null);
    milestoneRef.current = 0;
    try {
      const qs = await getQuizQuestions(sb, { subject, year, count: 20 });
      if (run !== runRef.current) return;
      if (!qs.length) throw new Error('No questions for that selection yet.');
      setQueue(qs);
      setPhase('play');
    } catch (e) { if (run === runRef.current) { setErr(msg(e)); setPhase('error'); } }
  }

  function choose(idx: number) {
    if (finishedRef.current || questionVersion !== questionVersionRef.current || answeredRef.current || picked !== null || !q || timeLeft <= 0) return;
    if (remainingMsRef.current <= performance.now() - lastTickRef.current) {
      remainingMsRef.current = 0;
      setTimeLeft(0);
      return;
    }
    answeredRef.current = true;
    setPicked(idx);
    const correct = idx === q.correct_index;
    if (correct) {
      const ns = streak + 1;
      const amt = earnFor(ns);
      setStreak(ns);
      setCash((c) => c + amt);
      setEarnedTotal((t) => t + amt);
      setCorrectCount((c) => c + 1);
      fxId.current += 1;
      setLastEarn({ amt, key: fxId.current });
    } else {
      if (!insured) setStreak(0);
    }
    if (user) {
      sb.rpc('record_attempt', { p_question_id: q.id, p_subject: q.subject, p_topic: q.topic, p_correct: correct }).then(undefined, () => {});
      sb.rpc('increment_quest', { p_metric: 'answer', p_amount: 1 }).then(undefined, () => {});
      if (correct) sb.rpc('increment_quest', { p_metric: 'correct', p_amount: 1 }).then(undefined, () => {});
    }
  }

  async function advance() {
    if (finishedRef.current || questionVersion !== questionVersionRef.current || picked === null || advancingRef.current) return;
    if (qi + 1 < queue.length) { questionVersionRef.current += 1; answeredRef.current = false; setQi((n) => n + 1); setPicked(null); return; }
    const run = runRef.current;
    setErr('');
    advancingRef.current = true; setAdvancing(true);
    try {
      const qs = await getQuizQuestions(sb, { subject: sel!.subject, year: sel!.year, count: 20 });
      if (run !== runRef.current) return;
      if (!qs.length) throw new Error('No more questions available for this selection.');
      questionVersionRef.current += 1; answeredRef.current = false;
      setQueue(qs); setQi(0); setPicked(null);
    } catch (e) { if (run === runRef.current) setErr(msg(e)); }
    finally { if (run === runRef.current) { advancingRef.current = false; setAdvancing(false); } }
  }

  function buy(kind: 'funding' | 'grant' | 'momentum' | 'auto') {
    if (finishedRef.current || shopVersion !== shopVersionRef.current) return;
    const lvl = kind === 'funding' ? fundingLvl : kind === 'grant' ? grantLvl : kind === 'momentum' ? momentumLvl : autoLvl;
    const cost = UP[kind].cost(lvl);
    if (cash < cost) return;
    shopVersionRef.current += 1;
    setCash((c) => c - cost);
    if (kind === 'funding') setFundingLvl((l) => l + 1);
    else if (kind === 'grant') setGrantLvl((l) => l + 1);
    else if (kind === 'momentum') setMomentumLvl((l) => l + 1);
    else setAutoLvl((l) => l + 1);
  }
  function buyInsurance() {
    if (finishedRef.current || shopVersion !== shopVersionRef.current || insured || cash < INSURANCE_COST) return;
    shopVersionRef.current += 1;
    setCash((c) => c - INSURANCE_COST);
    setInsured(true);
  }

  function finish() {
    if (finishedRef.current || renderedRun !== runRef.current) return;
    finishedRef.current = true; runRef.current += 1;
    questionVersionRef.current += 1; shopVersionRef.current += 1;
    advancingRef.current = false; setAdvancing(false);
    setPhase('done');
    const isBest = cash > best;
    if (isBest) { setBest(cash); try { localStorage.setItem('tycoon_best', String(cash)); } catch { /* ignore */ } }
    celebrate(isBest);
    if (user && correctCount > 0) {
      void sparks.claim(correctCount * 2 + 5, 'tycoon');
    }
  }

  // ---------- PICK ----------
  if (phase === 'pick' || phase === 'loading') {
    return (
      <Shell>
        <H>🏦 Lab Tycoon</H>
        <p className="mt-1 text-inksoft text-sm">Answer HSC questions to earn Research $, then reinvest in upgrades that compound your earnings. Grow the biggest lab in 2 minutes.</p>
        {best > 0 && <p className="mt-2 font-display font-bold text-golddeep">🏆 Best: {fmt(best)}</p>}
        <h2 className="mt-6 font-display font-bold text-ink">Pick a subject</h2>
        <div className="mt-3 space-y-2.5">
          {SUBJECTS.map((s) => (
            <div key={s.id} className="lg-card flex items-center gap-2 px-4 py-2.5">
              <span className="flex-1 font-semibold text-ink">{s.label}</span>
              {[11, 12].map((y) => (
                <button key={y} disabled={phase === 'loading'} onClick={() => start(s.id, y as 11 | 12)}
                  className="lg-btn lg-btn-primary px-4 py-1.5 text-sm disabled:opacity-40">Y{y}</button>
              ))}
            </div>
          ))}
        </div>
        {phase === 'loading' && <p className="mt-6 text-plum font-semibold">Opening the lab…</p>}
        <Link href="/demo" className="mt-6 block rounded-xl border border-plum px-4 py-3 text-center font-display font-bold text-plum">Try sample game <span className="block text-xs font-normal text-inksoft">Play a short offline practice run</span></Link>
        <Home />
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <H>Couldn’t start</H>
        <p className="mt-2 text-inksoft">{err}</p>
        <button onClick={() => setPhase('pick')} className="lg-btn lg-btn-primary mt-6 px-5 py-2.5">Back</button>
      </Shell>
    );
  }

  // ---------- DONE ----------
  if (phase === 'done') {
    const isBest = cash >= best && cash > 0;
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">LAB CLOSED</p>
        <h1 className="lg-pop mt-2 text-5xl font-extrabold text-ink"><CountUp to={cash} prefix="$" /></h1>
        <p className="mt-2 text-inksoft">{isBest ? '🏆 New personal best!' : `Best: ${fmt(best)}`}</p>
        <div className="lg-card mt-5 px-4 py-4 text-center" style={{ boxShadow: '0 4px 0 #6b9b7c' }}>
          <div className="text-sm text-inksoft">{correctCount} correct · earned {fmt(earnedTotal)} total</div>
          {sparks.state.status === 'confirmed' && <div className="text-golddeep font-display font-extrabold mt-1">+<CountUp to={sparks.state.amount} /> ✨ Sparks</div>}
          {sparks.state.status === 'pending' && <p className="mt-1 text-sm text-inksoft" role="status">Saving Sparks…</p>}
          {sparks.state.status === 'unconfirmed' && <p className="mt-1 text-sm text-brick" role="status">Sparks could not be confirmed.</p>}
        </div>
        <div className="mt-6 space-y-3">
          <button onClick={() => sel && start(sel.subject, sel.year)} className="lg-btn lg-btn-primary block w-full px-4 py-4">Run it again</button>
          <button onClick={() => setPhase('pick')} className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink">Change subject</button>
          <Home />
        </div>
      </Shell>
    );
  }

  // ---------- PLAY ----------
  const tFrac = timeLeft / SESSION;
  const target = RUN_TARGETS.find((amount) => earnedTotal < amount);
  const targetMax = target ?? RUN_TARGETS[RUN_TARGETS.length - 1];
  const targetProgress = Math.min(100, Math.max(0, earnedTotal / targetMax * 100));
  const labLevel = 1 + fundingLvl + grantLvl + momentumLvl + autoLvl + Number(insured);
  const machines = [
    { icon: '🧪', name: 'FUNDING', level: fundingLvl },
    { icon: '⚡', name: 'GRANTS', level: grantLvl },
    { icon: '🔥', name: 'MOMENTUM', level: momentumLvl },
    { icon: '🤖', name: 'AUTO LAB', level: autoLvl },
  ];
  return (
    <main className="w-full flex-1 bg-[#101329] px-3 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs font-black tracking-[.2em] text-[#a3f3d2]">SOLO ARCADE / {label(sel!.subject).toUpperCase()} Y{sel!.year}</p><h1 className="text-3xl font-black italic tracking-tight sm:text-4xl">LAB <span className="text-[#a3f3d2]">TYCOON</span></h1></div>
          <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-center text-xs font-bold text-[#b3b8d5]">LAB LEVEL <strong className="block text-2xl text-white">{labLevel}</strong></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="TIME LEFT" value={`${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`} urgent={timeLeft <= 15} />
          <Stat label="LAB CASH" value={fmt(cash)} gold />
          <Stat label="STREAK" value={`🔥 ${streak}`} />
          <Stat label="CORRECT" value={String(correctCount)} />
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Time remaining" aria-valuemin={0} aria-valuemax={SESSION} aria-valuenow={timeLeft}><div className={`h-full transition-all duration-1000 ${timeLeft <= 15 ? 'bg-rose-400' : 'bg-[#a3f3d2]'}`} style={{ width: `${Math.max(0, tFrac) * 100}%` }} /></div>
        <div className="mt-3 rounded-xl border border-[#ffca6a]/30 bg-[#ffca6a]/10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-bold"><span className="tracking-wider text-[#ffda93]">{target ? 'NEXT LAB TARGET' : 'ALL LAB TARGETS CLEARED'}</span><span className="tabular-nums text-white">{target ? `${fmt(earnedTotal)} / ${fmt(target)} earned` : `${fmt(earnedTotal)} earned`}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30" role="progressbar" aria-label="Income toward next lab target" aria-valuemin={0} aria-valuemax={targetMax} aria-valuenow={Math.min(earnedTotal, targetMax)} aria-valuetext={target ? `${fmt(earnedTotal)} of ${fmt(target)} earned` : 'All lab targets cleared'}><div className="h-full rounded-full bg-[#ffca6a] transition-all motion-reduce:transition-none" style={{ width: `${targetProgress}%` }} /></div>
          <p className="mt-1.5 text-xs text-[#f0dec1]">{target ? `${fmt(target - earnedTotal)} to the next target · spending cash won't reduce progress` : 'Keep growing your lab until time runs out.'}</p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <section aria-label="Your lab" className="order-2 overflow-hidden rounded-2xl border border-[#5b6288] bg-[#202642] lg:order-1">
            <div className="relative overflow-hidden bg-gradient-to-b from-[#252b55] via-[#3c4771] to-[#1d2848] bg-cover bg-center px-4 pt-4" style={{ backgroundImage: 'linear-gradient(180deg,rgba(24,28,57,.76),rgba(24,28,57,.88)), url(/art/lab-arena.webp)' }}>
              <div className="flex justify-between text-xs font-black tracking-widest text-[#d2dbff]"><span>YOUR LAB</span><span>LVL {labLevel}</span></div>
              <div aria-hidden="true" className="absolute right-10 top-12 text-5xl text-[#9cebd3]/30">✦</div>
              <div className="relative mt-16 grid grid-cols-4 gap-2 pb-5">
                {machines.map((machine) => <div key={machine.name} className={`rounded-xl border p-2 text-center ${machine.level ? 'border-[#a3f3d2] bg-[#a3f3d2]/20 shadow-[0_0_24px_#68efb83b]' : 'border-white/10 bg-black/20 opacity-50'}`}><div className="text-3xl sm:text-4xl">{machine.icon}</div><div className="mt-2 text-[9px] font-black tracking-wide">{machine.name}</div><div className="mt-1 text-[10px] text-[#a3f3d2]">{machine.level ? `LVL ${machine.level}` : 'LOCKED'}</div></div>)}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-3"><span className="text-xs font-bold tracking-wider text-[#b3b8d5]">⚡ NEXT CORRECT ANSWER</span><strong className="text-xl text-[#a3f3d2]">+{fmt(earnFor(streak + 1))}</strong></div>
            <div className="border-t border-white/10 p-4"><div className="flex items-center justify-between"><h2 className="font-black tracking-wide">⚡ UPGRADE SHOP</h2><span className="text-xs text-[#b3b8d5]">Buy anytime</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ShopBtn icon={UP.funding.icon} name={UP.funding.name} desc={`+$5 per correct · now $${perQ}`} cost={UP.funding.cost(fundingLvl)} cash={cash} onClick={() => buy('funding')} lvl={fundingLvl} />
                <ShopBtn icon={UP.grant.icon} name={UP.grant.name} desc={`×earnings · now ×${mult.toFixed(1)}`} cost={UP.grant.cost(grantLvl)} cash={cash} onClick={() => buy('grant')} lvl={grantLvl} />
                <ShopBtn icon={UP.momentum.icon} name={UP.momentum.name} desc="+10% per streak" cost={UP.momentum.cost(momentumLvl)} cash={cash} onClick={() => buy('momentum')} lvl={momentumLvl} />
                <ShopBtn icon={UP.auto.icon} name={UP.auto.name} desc={`Passive · now +$${autoLvl}/s`} cost={UP.auto.cost(autoLvl)} cash={cash} onClick={() => buy('auto')} lvl={autoLvl} />
                <ShopBtn icon="🛡️" name="Tenure" desc={insured ? 'Streak protected' : 'Protect your streak'} cost={INSURANCE_COST} cash={cash} onClick={buyInsurance} lvl={0} owned={insured} />
              </div>
            </div>
          </section>
          <section className="order-1 rounded-2xl border border-[#5b6288] bg-[#202642] p-4 sm:p-6 lg:order-2">
            {q && <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black tracking-wider text-[#b3b8d5]"><span>QUESTION {qi + 1}</span><span className="rounded-full bg-[#a3f3d2]/15 px-3 py-1 text-[#a3f3d2]">+{fmt(earnFor(streak + 1))} FOR CORRECT</span></div>
              <p className="mt-5 text-xs font-bold uppercase tracking-widest text-[#ffca6a]">{q.topic}</p>
              <h2 className="mt-2 text-xl font-bold leading-snug sm:text-2xl"><MathText text={q.stem} /></h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">{q.options.map((opt, idx) => {
                const reveal = picked === null ? null : idx === q.correct_index ? 'correct' : idx === picked ? 'wrong' : 'dim';
                return <AnswerTile key={idx} index={idx} onClick={() => choose(idx)} disabled={picked !== null} reveal={reveal}><MathText text={opt} /></AnswerTile>;
              })}</div>
              {picked !== null && <div className="mt-5 rounded-xl border border-white/15 bg-black/20 p-4" aria-live="polite"><p className="font-black text-[#a3f3d2]">{picked === q.correct_index ? `✓ Correct! +${fmt(lastEarn?.amt ?? 0)} · ${streak} streak` : `✕ Not quite — the correct answer is highlighted. ${insured ? 'Tenure protected your streak.' : 'Your streak reset.'}`}</p><details className="mt-2 text-sm text-[#d2dbef]"><summary className="cursor-pointer font-bold">Why is that the answer?</summary><div className="mt-2"><MathText text={q.explanation} /></div></details>{err && <p className="mt-3 text-sm text-rose-200" role="alert">Couldn’t load more questions: {err} You can retry or end and bank your run.</p>}<button onClick={advance} disabled={advancing} className="mt-4 w-full rounded-xl bg-[#a3f3d2] px-4 py-3 font-black text-[#142939] shadow-[0_4px_0_#58ab8b] disabled:opacity-60">{advancing ? 'LOADING QUESTIONS…' : err ? 'RETRY LOADING →' : 'NEXT QUESTION →'}</button><p className="mt-3 text-center text-xs text-[#b3b8d5]">⏸ Timer paused for feedback</p></div>}
            </>}
          </section>
        </div>
        <button onClick={finish} className="mt-5 block w-full text-center text-sm text-[#b3b8d5] underline">End run &amp; bank it</button>
      </div>
    </main>
  );
}

function Stat({ label, value, gold, urgent }: { label: string; value: string; gold?: boolean; urgent?: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-[#202642] px-4 py-3"><div className="text-[10px] font-black tracking-widest text-[#b3b8d5]">{label}</div><div className={`mt-1 text-2xl font-black tabular-nums sm:text-3xl ${urgent ? 'text-rose-400' : gold ? 'text-[#ffca6a]' : 'text-white'}`}>{value}</div></div>;
}

function ShopBtn({ icon, name, desc, cost, cash, onClick, lvl, owned }: {
  icon: string; name: string; desc: string; cost: number; cash: number; onClick: () => void; lvl: number; owned?: boolean;
}) {
  const afford = cash >= cost && !owned;
  return (
    <button onClick={onClick} disabled={!afford}
      className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition active:translate-y-0.5 ${afford ? 'border-[#a3f3d2]/50 bg-[#a3f3d2]/10' : 'border-white/10 bg-white/5 opacity-60'}`}>
      <span className="text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-display font-bold text-white text-sm">
          {name}{lvl > 0 && <span className="text-[10px] text-[#a3f3d2]">Lv{lvl}</span>}
        </div>
        <div className="text-[11px] text-[#c3c9df] leading-tight">{desc}</div>
        <div className={`mt-0.5 text-xs font-bold ${owned ? 'text-[#a3f3d2]' : afford ? 'text-[#ffca6a]' : 'text-[#c3c9df]'}`}>{owned ? '✓ owned' : afford ? `${fmt(cost)} · BUY` : `${fmt(cost)} · ${fmt(cost - cash)} more`}</div>
      </div>
    </button>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children }: { children: React.ReactNode }) => (
  <main className="flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto max-w-md md:max-w-2xl">{children}</main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const Home = () => <Link href="/" className="mt-6 block text-center text-sm text-muted underline">Home</Link>;
