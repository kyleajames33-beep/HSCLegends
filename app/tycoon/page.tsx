'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Subject, type Question } from '@/lib/questions';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import CountUp from '@/components/count-up';
import { celebrate } from '@/lib/confetti';

// "Lab Tycoon" — the Gimkit-style upgrade loop, specified to HSC. Answer questions
// to earn Research $, spend it on upgrades that compound your earnings. Solo, with
// its own in-mode currency (does NOT touch Sparks). Beat your best in 2 minutes.
const SESSION = 120; // seconds
const REVEAL_MS = 650;
const MILESTONES = [500, 2000, 8000, 25000, 75000];
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
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();

  const [phase, setPhase] = useState<Phase>('pick');
  const [sel, setSel] = useState<{ subject: Subject; year: 11 | 12 } | null>(null);
  const [queue, setQueue] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [err, setErr] = useState('');

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

  // Derived earning values.
  const perQ = 1 + fundingLvl;                 // base $ per correct
  const mult = 1 + 0.5 * grantLvl;             // earnings multiplier
  const streakPct = 0.1 * momentumLvl;         // +% per streak step
  const earnFor = (s: number) => Math.max(1, Math.round(perQ * mult * (1 + s * streakPct)));

  useEffect(() => {
    const b = Number(localStorage.getItem('tycoon_best') || 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (b > 0) setBest(b);
  }, []);

  // Session countdown.
  useEffect(() => {
    if (phase !== 'play' || timeLeft <= 0) return;
    const t = window.setTimeout(() => {
      setTimeLeft((s) => s - 1);
      if (autoLvl > 0) { setCash((c) => c + autoLvl); setEarnedTotal((tt) => tt + autoLvl); }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [phase, timeLeft, autoLvl]);

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
    setErr(''); setSel({ subject, year }); setPhase('loading');
    setCash(0); setEarnedTotal(0); setCorrectCount(0);
    setFundingLvl(0); setGrantLvl(0); setMomentumLvl(0); setAutoLvl(0); setInsured(false);
    setStreak(0); setTimeLeft(SESSION); setQi(0); setPicked(null); setLastEarn(null);
    milestoneRef.current = 0;
    try {
      const qs = await getQuizQuestions(sb, { subject, year, count: 20 });
      if (!qs.length) throw new Error('No questions for that selection yet.');
      setQueue(qs);
      setPhase('play');
    } catch (e) { setErr(msg(e)); setPhase('error'); }
  }

  function choose(idx: number) {
    if (picked !== null || !q || timeLeft <= 0) return;
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
    window.setTimeout(advance, REVEAL_MS);
  }

  function advance() {
    setPicked(null);
    if (qi + 1 < queue.length) { setQi((n) => n + 1); return; }
    getQuizQuestions(sb, { subject: sel!.subject, year: sel!.year, count: 20 })
      .then((qs) => { setQueue(qs); setQi(0); })
      .catch(() => {});
  }

  function buy(kind: 'funding' | 'grant' | 'momentum' | 'auto') {
    const lvl = kind === 'funding' ? fundingLvl : kind === 'grant' ? grantLvl : kind === 'momentum' ? momentumLvl : autoLvl;
    const cost = UP[kind].cost(lvl);
    if (cash < cost) return;
    setCash((c) => c - cost);
    if (kind === 'funding') setFundingLvl((l) => l + 1);
    else if (kind === 'grant') setGrantLvl((l) => l + 1);
    else if (kind === 'momentum') setMomentumLvl((l) => l + 1);
    else setAutoLvl((l) => l + 1);
  }
  function buyInsurance() {
    if (insured || cash < INSURANCE_COST) return;
    setCash((c) => c - INSURANCE_COST);
    setInsured(true);
  }

  function finish() {
    setPhase('done');
    const isBest = cash > best;
    if (isBest) { setBest(cash); try { localStorage.setItem('tycoon_best', String(cash)); } catch { /* ignore */ } }
    celebrate(isBest);
    if (user && correctCount > 0) {
      sb.rpc('credit_coins', { p_amount: correctCount * 2 + 5, p_reason: 'tycoon', p_meta: null }).then(undefined, () => {});
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
          {user && correctCount > 0 && (
            <div className="text-golddeep font-display font-extrabold mt-1">+<CountUp to={correctCount * 2 + 5} /> ✨ Sparks</div>
          )}
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
  return (
    <main className="flex flex-1 flex-col px-5 pt-6 pb-8 w-full mx-auto max-w-md md:max-w-3xl">
      {/* HUD */}
      <div className="flex items-end justify-between">
        <div className="relative">
          <div className="text-xs text-muted">Research $</div>
          <div className="text-3xl font-display font-extrabold text-ink tabular-nums">{fmt(cash)}</div>
          <div className="text-xs font-bold text-leaf">+{fmt(earnFor(streak + 1))} per correct</div>
          {lastEarn && (
            <span key={lastEarn.key} className="fx-float text-xl font-black text-leaf" style={{ top: -10, left: 30 }}>+{lastEarn.amt}</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">{label(sel!.subject)} · Y{sel!.year}</div>
          <div className={`text-2xl font-mono font-bold tabular-nums ${timeLeft <= 15 ? 'text-brick' : 'text-ink'}`}>{timeLeft}s</div>
        </div>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-parchment-deep overflow-hidden">
        <div className="h-full transition-all duration-1000 ease-linear" style={{ width: `${Math.max(0, tFrac) * 100}%`, background: timeLeft <= 15 ? '#c4646b' : '#6b9b7c' }} />
      </div>

      {/* Question */}
      {q && (
        <>
          <h2 className="mt-5 text-lg md:text-2xl md:text-center font-display font-bold text-ink leading-snug"><MathText text={q.stem} /></h2>
          {streak >= 2 && <p className="mt-1 text-center text-sm font-display font-extrabold text-coraldeep">🔥 {streak} streak{streakPct > 0 ? ` · +${Math.round(streak * streakPct * 100)}%` : ''}</p>}
          <div className="mt-3 grid gap-2.5 md:grid-cols-2">
            {q.options.map((opt, idx) => {
              const reveal = picked === null ? null : idx === q.correct_index ? 'correct' : idx === picked ? 'wrong' : 'dim';
              return (
                <AnswerTile key={idx} index={idx} onClick={() => choose(idx)} disabled={picked !== null} reveal={reveal}>
                  <MathText text={opt} />
                </AnswerTile>
              );
            })}
          </div>
        </>
      )}

      {/* Upgrade shop — buy anytime */}
      <div className="mt-5">
        <p className="px-1 text-xs font-display font-bold tracking-wide text-muted">REINVEST</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ShopBtn icon={UP.funding.icon} name={UP.funding.name} desc={`+$ per correct (now $${perQ})`} cost={UP.funding.cost(fundingLvl)} cash={cash} onClick={() => buy('funding')} lvl={fundingLvl} />
          <ShopBtn icon={UP.grant.icon} name={UP.grant.name} desc={`×earnings (now ×${mult.toFixed(1)})`} cost={UP.grant.cost(grantLvl)} cash={cash} onClick={() => buy('grant')} lvl={grantLvl} />
          <ShopBtn icon={UP.momentum.icon} name={UP.momentum.name} desc={`+10% per streak (now +${Math.round(streakPct * 100)}%)`} cost={UP.momentum.cost(momentumLvl)} cash={cash} onClick={() => buy('momentum')} lvl={momentumLvl} />
          <ShopBtn icon={UP.auto.icon} name={UP.auto.name} desc={`passive (now +$${autoLvl}/s)`} cost={UP.auto.cost(autoLvl)} cash={cash} onClick={() => buy('auto')} lvl={autoLvl} />
          <ShopBtn icon="🛡️" name="Tenure" desc={insured ? 'Active — streak safe' : 'Wrong answers keep your streak'} cost={INSURANCE_COST} cash={cash} onClick={buyInsurance} lvl={insured ? -1 : 0} owned={insured} />
        </div>
      </div>

      <button onClick={finish} className="mt-5 text-center text-sm text-muted underline">End early & bank it</button>
    </main>
  );
}

function ShopBtn({ icon, name, desc, cost, cash, onClick, lvl, owned }: {
  icon: string; name: string; desc: string; cost: number; cash: number; onClick: () => void; lvl: number; owned?: boolean;
}) {
  const afford = cash >= cost && !owned;
  return (
    <button onClick={onClick} disabled={!afford}
      className={`lg-card flex items-start gap-2 px-3 py-2.5 text-left transition active:translate-y-0.5 ${afford ? '' : 'opacity-50'}`}>
      <span className="text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-display font-bold text-ink text-sm">
          {name}{lvl > 0 && <span className="text-[10px] text-plum">Lv{lvl}</span>}
        </div>
        <div className="text-[11px] text-muted leading-tight">{desc}</div>
        <div className={`mt-0.5 text-xs font-bold ${owned ? 'text-leaf' : afford ? 'text-golddeep' : 'text-muted'}`}>{owned ? '✓ owned' : `$${cost.toLocaleString()}`}</div>
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
