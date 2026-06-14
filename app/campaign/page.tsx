'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { getQuizQuestions, SUBJECTS, type Subject, type Question } from '@/lib/questions';
import BossArt from '@/components/boss-art';
import AnswerTile from '@/components/answer-tile';
import MathText from '@/components/math-text';
import { celebrate } from '@/lib/confetti';
import {
  getCampaign, campaignAttack, type CampaignBoss, type AttackResult,
} from '@/lib/campaign';

const label = (s: Subject) => SUBJECTS.find((x) => x.id === s)?.label ?? s;

export default function CampaignPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();

  const [bosses, setBosses] = useState<CampaignBoss[]>([]);
  const [active, setActive] = useState<Subject | null>(null);

  // Battle state.
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [stage, setStage] = useState(1);
  const [queue, setQueue] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [answered, setAnswered] = useState<{ correct: boolean; picked: number } | null>(null);
  const [outcome, setOutcome] = useState<AttackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user) return;
    getCampaign(sb).then(setBosses).catch((e) => setErr(msg(e)));
  }, [sb, user]);

  const q: Question | undefined = queue[qi];

  async function enter(boss: CampaignBoss) {
    setErr('');
    setActive(boss.subject);
    setHp(boss.hp); setMaxHp(boss.max_hp); setStage(boss.stage);
    setAnswered(null); setOutcome(null); setQi(0);
    setBusy(true);
    try {
      const qs = await getQuizQuestions(sb, { subject: boss.subject, count: 10 });
      setQueue(qs);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  async function answer(choice: number) {
    if (!active || !q || answered || outcome) return;
    const correct = choice === q.correct_index;
    setAnswered({ correct, picked: choice });
    setBusy(true);
    try {
      const r = await campaignAttack(sb, { subject: active, correct, difficulty: q.difficulty });
      setHp(r.hp); setMaxHp(r.max_hp); setStage(r.stage);
      // Feed mastery + quests for signed-in users (fire and forget).
      sb.rpc('record_attempt', {
        p_question_id: q.id, p_subject: q.subject, p_topic: q.topic, p_correct: correct,
      }).then(undefined, () => {});
      sb.rpc('increment_quest', { p_metric: 'answer' }).then(undefined, () => {});
      if (correct) sb.rpc('increment_quest', { p_metric: 'correct' }).then(undefined, () => {});
      if (r.defeated) {
        setOutcome(r);
        celebrate(true);
        setBosses((bs) => bs.map((b) =>
          b.subject === active
            ? { ...b, hp: r.hp, max_hp: r.max_hp, stage: r.stage, defeated_count: b.defeated_count + 1 }
            : b));
      } else {
        setBosses((bs) => bs.map((b) =>
          b.subject === active ? { ...b, hp: r.hp, max_hp: r.max_hp, stage: r.stage } : b));
      }
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  async function next() {
    if (!active) return;
    setAnswered(null);
    if (qi + 1 < queue.length) { setQi(qi + 1); return; }
    // Exhausted — refetch a fresh batch.
    setBusy(true);
    try {
      const qs = await getQuizQuestions(sb, { subject: active, count: 10 });
      setQueue(qs); setQi(0);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  function continueBattle() {
    setOutcome(null); setAnswered(null);
    next();
  }

  function toMap() {
    setActive(null); setOutcome(null); setAnswered(null); setQueue([]); setErr('');
  }

  // ---------- SIGN-IN GATE ----------
  if (!loading && !user) {
    return (
      <Shell>
        <H>⚔️ Campaign</H>
        <p className="mt-2 text-inksoft">Solo boss battles — defeat every subject’s boss, one question at a time. Sign in to begin your run.</p>
        <Link href="/login?next=/campaign" className="lg-btn lg-btn-primary mt-6 px-5 py-3 text-center">Sign in</Link>
        <Home />
      </Shell>
    );
  }

  // ---------- BATTLE ----------
  if (active) {
    const frac = maxHp > 0 ? hp / maxHp : 0;
    return (
      <Shell wide>
        <div className="flex items-center justify-between text-sm text-muted">
          <button onClick={toMap} className="underline">← Map</button>
          <span>{label(active)} · Stage {stage}</span>
        </div>

        <div className="mt-3 flex flex-col items-center">
          <BossArt subject={active} frac={frac} defeated={hp <= 0} className="h-40 w-40" />
          <div className="mt-3 w-full max-w-xs">
            <div className="flex justify-between text-xs text-muted">
              <span>HP</span><span className="tabular-nums">{Math.max(0, hp)} / {maxHp}</span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-parchment-deep overflow-hidden">
              <div className="h-full bg-brick transition-all duration-500" style={{ width: `${Math.max(0, frac) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Defeat banner */}
        {outcome?.defeated ? (
          <div className="lg-card mt-6 px-5 py-6 text-center">
            <div className="text-5xl">🏆</div>
            <p className="mt-2 font-display font-extrabold text-ink text-lg">
              {label(active)} boss defeated! +{outcome.reward} ✨
            </p>
            <p className="mt-1 text-inksoft">Stage {outcome.stage} unlocked (tougher!)</p>
            <button onClick={continueBattle} disabled={busy} className="lg-btn lg-btn-primary mt-5 w-full px-6 py-4">
              {busy ? 'Loading…' : 'Continue the fight'}
            </button>
            <button onClick={toMap} className="mt-3 text-sm text-berrydeep underline">Back to map</button>
          </div>
        ) : q ? (
          <>
            <h2 className="mt-5 text-xl md:text-2xl md:text-center font-display font-bold text-ink leading-snug">
              <MathText text={q.stem ?? ''} />
            </h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {(q.options ?? []).map((o, i) => (
                <AnswerTile key={i} index={i} disabled={busy || !!answered} onClick={() => answer(i)}
                  reveal={answered ? (i === q.correct_index ? 'correct' : i === answered.picked ? 'wrong' : 'dim') : null}>
                  <MathText text={o} />
                </AnswerTile>
              ))}
            </div>
            {answered && (
              <div className="mt-4">
                <p className={`font-display font-extrabold ${answered.correct ? 'text-leaf' : 'text-brick'}`}>
                  {answered.correct ? '✓ Hit!' : '✗ Missed — no damage'}
                </p>
                {q.explanation && (
                  <p className="mt-1 text-sm text-inksoft"><MathText text={q.explanation} /></p>
                )}
                <button onClick={next} disabled={busy} className="lg-btn lg-btn-primary mt-3 w-full px-4 py-4">
                  {busy ? 'Loading…' : 'Next'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="mt-8 text-center text-muted">{busy ? 'Loading questions…' : 'No questions available for this subject yet.'}</p>
        )}
        {err && <Err>{err}</Err>}
      </Shell>
    );
  }

  // ---------- MAP ----------
  return (
    <Shell>
      <H>⚔️ Campaign</H>
      <p className="text-inksoft text-sm mt-1">Take on each subject’s boss solo. Land correct answers to deal damage; defeat it to earn Sparks and unlock a tougher stage.</p>
      <div className="mt-5 space-y-3">
        {bosses.map((b) => {
          const frac = b.max_hp > 0 ? b.hp / b.max_hp : 0;
          return (
            <button key={b.subject} onClick={() => enter(b)} disabled={busy}
              className="lg-card flex w-full items-center gap-4 px-4 py-3.5 text-left disabled:opacity-60">
              <BossArt subject={b.subject} frac={frac} className="h-20 w-20 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display font-bold text-ink truncate">{label(b.subject)}</span>
                  <span className="text-xs text-muted shrink-0">Stage {b.stage}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-parchment-deep overflow-hidden">
                  <div className="h-full bg-brick" style={{ width: `${Math.max(0, frac) * 100}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted">{b.defeated_count} defeated</div>
              </div>
            </button>
          );
        })}
        {!bosses.length && <p className="text-muted text-sm">{loading ? 'Loading…' : 'Summoning bosses…'}</p>}
      </div>
      {err && <Err>{err}</Err>}
      <Home />
    </Shell>
  );
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const Shell = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => (
  <main
    className={`flex flex-1 flex-col px-6 pt-12 pb-10 w-full mx-auto ${
      wide ? 'max-w-md md:max-w-3xl md:px-12' : 'max-w-md'
    }`}
  >
    {children}
  </main>
);
const H = ({ children }: { children: React.ReactNode }) => <h1 className="text-2xl font-extrabold text-ink">{children}</h1>;
const Err = ({ children }: { children: React.ReactNode }) => <p className="mt-3 text-brick text-sm">{children}</p>;
const Home = () => <Link href="/" className="mt-6 text-center text-sm text-muted underline">Home</Link>;
