'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { getBoss, bossFace, type Boss } from '@/lib/boss';

const ARENA = 'linear-gradient(160deg,#1a1d2e 0%,#2d3142 38%,#4e4068 74%,#9c5c6e 100%)';
const STARS =
  'radial-gradient(circle at 18% 22%, rgba(214,168,95,0.5) 0 2px, transparent 3px),' +
  'radial-gradient(circle at 80% 30%, rgba(255,255,255,0.35) 0 1.5px, transparent 2px),' +
  'radial-gradient(circle at 32% 72%, rgba(255,255,255,0.4) 0 1px, transparent 2px),' +
  'radial-gradient(circle at 90% 78%, rgba(214,168,95,0.5) 0 1.5px, transparent 2.5px)';

export default function BossPage() {
  const sb = useMemo(() => createClient(), []);
  const [subject, setSubject] = useState<Subject>('biology');
  const [boss, setBoss] = useState<Boss | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getBoss(sb, subject).then((b) => { setBoss(b); setLoading(false); });
  }, [subject, sb]);

  const frac = boss ? Math.max(0, boss.hp / boss.max_hp) : 1;
  const barColor = frac > 0.6 ? '#6b9b7c' : frac > 0.25 ? '#d6a85f' : '#c4646b';

  return (
    <main
      className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto text-white"
      style={{ background: ARENA, backgroundImage: `${STARS},${ARENA}` }}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-extrabold">Weekly Boss 👹</h1>
        <Link href="/" className="text-sm text-white/60 underline">Home</Link>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SUBJECTS.map((s) => (
          <button key={s.id} onClick={() => setSubject(s.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition ${subject === s.id ? 'bg-white text-ink' : 'bg-white/10 text-white/80'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {loading || !boss ? (
        <p className="mt-10 text-white/60">Summoning…</p>
      ) : (
        <div className="mt-6 flex-1 flex flex-col">
          <div className="text-center">
            <div
              className={`mx-auto flex h-40 w-40 items-center justify-center rounded-full text-8xl ${frac <= 0.25 && !boss.defeated ? 'animate-pulse' : ''}`}
              style={{ background: 'radial-gradient(ellipse at center,#2d3142 0%,#16182a 70%)', boxShadow: '0 0 60px rgba(156,92,110,0.6)' }}
            >
              {bossFace(boss)}
            </div>
            <h2 className="mt-4 text-3xl font-display font-extrabold">{boss.name}</h2>
            <p className="text-white/50 text-sm">Signature move: {boss.attack_name}</p>
          </div>

          {boss.defeated ? (
            <p className="mt-5 rounded-2xl bg-leaf/25 border border-leaf/50 px-4 py-3 text-center font-display font-bold">
              Defeated by the class this week! 🎉
            </p>
          ) : (
            <div className="mt-6">
              <div className="flex justify-between text-sm text-white/70 mb-1">
                <span>Class HP</span>
                <span className="tabular-nums font-mono">{boss.hp} / {boss.max_hp}</span>
              </div>
              <div className="h-5 rounded-full bg-black/40 overflow-hidden border border-white/10">
                <div className="h-full transition-all" style={{ width: `${frac * 100}%`, background: barColor }} />
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <div className="text-2xl font-display font-extrabold">{boss.your_damage}</div>
              <div className="text-xs text-white/50">your damage</div>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <div className="text-2xl font-display font-extrabold">{boss.contributors}</div>
              <div className="text-xs text-white/50">students fighting</div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-white/40">
            The whole class shares this HP bar · resets Monday
          </p>

          <Link href="/play"
            className="lg-btn mt-auto block rounded-2xl px-6 py-4 text-center text-ink active:translate-y-0.5"
            style={{ background: '#d6a85f', boxShadow: '0 4px 0 #a87f3f' }}>
            <div className="text-lg font-extrabold">⚔ Attack the boss</div>
            <div className="text-xs mt-0.5 opacity-80">Play a Quick Game — each correct answer deals 1 damage</div>
          </Link>
        </div>
      )}
    </main>
  );
}
