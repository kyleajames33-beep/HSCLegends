'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SPECIMEN_SETS, specimenImageSrc } from '@/lib/specimens.mjs';
import { RARITY, submitSpecimenAnswer, getCollection } from '@/lib/cards';
import { celebrate } from '@/lib/confetti';
import AnswerTile from '@/components/answer-tile';
import LessonVideoLink from '@/components/lesson-video-link';

type SpecimenSet = (typeof SPECIMEN_SETS)[number];

// Specimen Lab: picture questions on artwork from HSCScience lesson videos. A first correct
// answer collects that specimen's card (cosmetic, earn-only). Questions run in authored order
// because some build on the one before (sealed soda, then cap off).
export default function SpecimenLab() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [set, setSet] = useState<SpecimenSet | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [newCards, setNewCards] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [rewardError, setRewardError] = useState('');

  // Which specimen cards the player already owns (signed-in only; quiet on failure).
  useEffect(() => {
    if (!user) return;
    getCollection(sb).then(
      (cards) => setOwned(new Set(cards.filter((c) => c.count > 0).map((c) => c.card_id))),
      () => setRewardError('Card could not be saved. Try this set again.'),
    ).finally(() => setSaving(false));
  }, [sb, user]);

  function begin(s: SpecimenSet) {
    setSet(s);
    setI(0);
    setPicked(null);
    setScore(0);
    setDone(false);
    setNewCards([]);
    setRewardError('');
  }

  function choose(idx: number) {
    if (!set || picked !== null || saving) return;
    const q = set.questions[i];
    const correct = idx === q.correctIndex;
    setPicked(idx);
    if (correct) setScore((s) => s + 1);
    if (!user) return;
    sb.rpc('increment_quest', { p_metric: 'answer', p_amount: 1 }).then(undefined, () => {});
    if (correct) sb.rpc('increment_quest', { p_metric: 'correct', p_amount: 1 }).then(undefined, () => {});
    setSaving(true);
    setRewardError('');
    submitSpecimenAnswer(sb, q.id, idx).then(
      (result) => {
        if (!result.correct) return;
        setOwned((o) => new Set(o).add(q.card.id));
        if (!result.is_new) return;
        setNewCards((n) => [...n, q.card.id]);
        celebrate(false);
      },
      () => setRewardError('Card could not be saved. Try this set again.'),
    ).finally(() => setSaving(false));
  }

  function next() {
    if (!set) return;
    if (i + 1 >= set.questions.length) {
      setDone(true);
      celebrate(score === set.questions.length);
    } else {
      setI((n) => n + 1);
      setPicked(null);
    }
  }

  if (!set) {
    return (
      <Shell>
        <h1 className="text-3xl font-extrabold text-ink">🔬 Specimen Lab</h1>
        <p className="mt-1 text-sm text-inksoft">
          Picture questions from HSCScience lesson videos. Get one right to collect its Specimen card.
        </p>
        {!user && <p className="mt-2 text-xs text-muted">Sign in to collect cards.</p>}
        <div className="mt-6 space-y-3">
          {SPECIMEN_SETS.map((s) => {
            const have = s.questions.filter((q) => owned.has(q.card.id)).length;
            return (
              <button
                key={s.id}
                onClick={() => begin(s)}
                className="lg-card flex w-full items-center gap-3 px-3 py-3 text-left transition active:translate-y-0.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={specimenImageSrc(s.questions[0].image)} alt="" className="h-14 w-14 shrink-0 object-contain" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-bold text-ink leading-tight">{s.title}</span>
                  <span className="block text-xs uppercase tracking-wide text-muted">
                    {s.subject} · {s.questions.length} specimens
                  </span>
                </span>
                {user && (
                  <span className="text-sm font-bold text-plum">
                    {have}/{s.questions.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <Link href="/collection" className="mt-6 text-center text-sm font-semibold text-plum underline">
          See your collection
        </Link>
      </Shell>
    );
  }

  if (done) {
    const total = set.questions.length;
    const collected = set.questions.filter((q) => newCards.includes(q.card.id));
    return (
      <Shell>
        <p className="text-berrydeep font-display font-bold tracking-wide text-sm">SPECIMEN LAB</p>
        <h1 className="mt-2 text-6xl font-extrabold text-ink">
          {score}/{total}
        </h1>
        <p className="mt-3 text-inksoft">{score === total ? 'Every specimen identified.' : 'Wrong ones stay uncollected. Try the set again.'}</p>

        {collected.length > 0 && (
          <div className="lg-card mt-5 px-4 py-4">
            <p className="text-center font-display font-extrabold text-sm text-leaf">
              +{collected.length} new Specimen card{collected.length === 1 ? '' : 's'}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {collected.map((q) => (
                <div key={q.card.id} className={`rounded-xl border-2 bg-panel p-1.5 text-center ${RARITY[q.card.rarity].border}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={specimenImageSrc(q.card.art)} alt={q.card.name} className="mx-auto h-12 object-contain" />
                  <p className="mt-1 text-[10px] font-bold leading-tight text-ink">{q.card.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <button onClick={() => begin(set)} className="lg-btn lg-btn-primary block w-full px-4 py-4">
            Play this set again
          </button>
          <button onClick={() => setSet(null)} className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink">
            Other sets
          </button>
          <Link href="/collection" className="lg-card block w-full px-4 py-3.5 text-center font-display font-bold text-ink">
            Collection
          </Link>
        </div>
      </Shell>
    );
  }

  const q = set.questions[i];
  const revealed = picked !== null;
  const right = picked === q.correctIndex;
  return (
    <Shell>
      <div className="flex items-center justify-between text-sm text-muted font-semibold">
        <span>
          Specimen {i + 1}/{set.questions.length}
        </span>
        <span className="uppercase tracking-wide">{set.subject}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-parchment-deep overflow-hidden">
        <div className="h-full bg-gold transition-all" style={{ width: `${(i / set.questions.length) * 100}%` }} />
      </div>

      <div className="lg-card mt-4 flex items-center justify-center px-3 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={q.id} src={specimenImageSrc(q.image)} alt={q.alt} className="lg-pop max-h-52 w-full object-contain" />
      </div>

      <h2 className="mt-4 text-lg font-display font-bold leading-snug text-ink">{q.stem}</h2>

      <div className="mt-4 grid gap-2.5">
        {q.options.map((opt, idx) => {
          const reveal = !revealed ? null : idx === q.correctIndex ? 'correct' : idx === picked ? 'wrong' : 'dim';
          return (
            <AnswerTile key={idx} index={idx} onClick={() => choose(idx)} disabled={revealed || saving} reveal={reveal}>
              {opt}
            </AnswerTile>
          );
        })}
      </div>

      {revealed && (
        <div className="mt-5">
          <p className={`font-display font-extrabold text-xl ${right ? 'text-leaf' : 'text-brick'}`}>
            {right ? '✅ Correct!' : '❌ Not quite'}
          </p>
          <p className="mt-1 text-sm text-inksoft">{q.explanation}</p>
          {newCards.includes(q.card.id) && (
            <p className={`lg-pop mt-2 text-sm font-extrabold ${RARITY[q.card.rarity].text}`}>
              🃏 Collected: {q.card.name} ({RARITY[q.card.rarity].label})
            </p>
          )}
          {rewardError && <p role="alert" className="mt-2 text-sm text-brick">{rewardError}</p>}
          <LessonVideoLink video={set.video} />
          <button onClick={next} disabled={saving} className="lg-btn lg-btn-primary mt-4 w-full px-4 py-4">
            {saving ? 'Saving answer…' : i + 1 >= set.questions.length ? 'Finish' : 'Next'}
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">{children}</main>;
}
