'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { getDailyDone } from '@/lib/daily';

// The front door: ONE thing to do today — the next unplayed daily quiz from the
// student's prescribed set (their subjects + year). Replaces the old grid-of-equals.
export default function MissionCard() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const [year, setYear] = useState<number | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await sb.from('user_profiles').select('year, subjects').eq('user_id', user.id).maybeSingle();
      setYear(data?.year ?? null);
      setSubjects(((data?.subjects ?? []) as string[]).filter((s) => SUBJECTS.some((x) => x.id === s)) as Subject[]);
      setDone(await getDailyDone(sb).catch(() => []));
      setReady(true);
    })();
  }, [user, sb]);

  if (loading) return <div className="h-52 rounded-3xl bg-parchment-deep animate-pulse" />;

  if (!user) {
    return (
      <Hero eyebrow="TODAY’S MISSION" title="Start your streak" sub="Sign in to save XP, streaks and cards." boss="biology">
        <Cta href="/login">Sign in</Cta>
      </Hero>
    );
  }
  if (!ready) return <div className="h-52 rounded-3xl bg-parchment-deep animate-pulse" />;

  if (!year || subjects.length === 0) {
    return (
      <Hero eyebrow="TODAY’S MISSION" title="Pick your subjects" sub="We’ll set you a daily quiz for each one." boss="biology">
        <Cta href="/welcome">Set up</Cta>
      </Hero>
    );
  }

  const label = (id: Subject) => SUBJECTS.find((x) => x.id === id)?.label ?? id;
  const next = subjects.find((s) => !done.includes(s));
  const doneCount = subjects.filter((s) => done.includes(s)).length;
  const chips = (
    <div className="flex flex-wrap gap-1.5">
      {subjects.map((s) => {
        const d = done.includes(s);
        return (
          <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${d ? 'bg-white text-[#3e6b4e]' : 'bg-white/20 text-white'}`}>
            {d ? '✓ ' : ''}{label(s)}
          </span>
        );
      })}
    </div>
  );

  if (!next) {
    return (
      <div className="rounded-3xl px-5 py-5 text-white" style={{ background: '#4a7a5b', boxShadow: '0 5px 0 #355a42' }}>
        <p className="text-xs font-display font-bold tracking-[0.12em] text-white/85">TODAY’S MISSION</p>
        <p className="mt-1 text-2xl font-display font-extrabold leading-tight">All {subjects.length} done. Streak safe 🔥</p>
        <p className="mt-1 text-sm text-white/90">Want more? Practice any subject for extra XP.</p>
        <div className="mt-3">{chips}</div>
        <Cta href="/play">Free practice</Cta>
      </div>
    );
  }

  return (
    <Hero eyebrow={`TODAY’S MISSION · ${doneCount + 1} OF ${subjects.length}`} title={`${label(next)} daily quiz`}
      sub={`Hits the ${label(next)} boss and keeps your streak alive.`} boss={next}>
      {subjects.length > 1 && <div className="mt-3">{chips}</div>}
      <Cta href={`/play?daily=1&subject=${next}&year=${year}`}>▶ Start</Cta>
    </Hero>
  );
}

function Hero({ eyebrow, title, sub, boss, children }: {
  eyebrow: string; title: string; sub: string; boss: Subject; children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-plum px-5 py-5 text-white" style={{ boxShadow: '0 5px 0 #4e4068' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/bosses/${boss}/idle.png`} alt="" aria-hidden
        className="pointer-events-none absolute -bottom-3 -right-4 h-40 w-32 object-contain opacity-95" />
      <div className="relative max-w-[70%]">
        <p className="text-xs font-display font-bold tracking-[0.12em] text-white/85">{eyebrow}</p>
        <p className="mt-1 text-[1.65rem] font-display font-extrabold leading-[1.1]">{title}</p>
        <p className="mt-1.5 text-sm text-white/90">{sub}</p>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}
      className="lg-btn mt-4 inline-flex min-h-12 items-center justify-center px-8 text-lg transition active:translate-y-0.5"
      style={{ background: '#d6a85f', color: '#3d2700', boxShadow: '0 4px 0 #a87f3f' }}>
      {children}
    </Link>
  );
}
