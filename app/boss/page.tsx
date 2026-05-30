'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SUBJECTS, type Subject } from '@/lib/questions';
import { getBoss, bossFace, type Boss } from '@/lib/boss';

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
  const barColor = frac > 0.6 ? 'bg-green-500' : frac > 0.25 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Weekly Boss 👹</h1>
        <Link href="/" className="text-sm text-zinc-500 underline">Home</Link>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {SUBJECTS.map((s) => (
          <button key={s.id} onClick={() => setSubject(s.id)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${subject === s.id ? 'bg-indigo-600' : 'bg-zinc-800 text-zinc-300'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {loading || !boss ? (
        <p className="mt-10 text-zinc-500">Summoning…</p>
      ) : (
        <div className="mt-6 flex-1 flex flex-col">
          <div className="text-center">
            <div className={`text-8xl ${frac <= 0.25 && !boss.defeated ? 'animate-pulse' : ''}`}>{bossFace(boss)}</div>
            <h2 className="mt-2 text-2xl font-bold">{boss.name}</h2>
            <p className="text-zinc-500 text-sm">Signature move: {boss.attack_name}</p>
          </div>

          {boss.defeated ? (
            <p className="mt-5 rounded-xl bg-green-500/10 border border-green-500/40 px-4 py-3 text-center text-green-300 font-semibold">
              Defeated by the class this week! 🎉
            </p>
          ) : (
            <div className="mt-6">
              <div className="flex justify-between text-sm text-zinc-400 mb-1">
                <span>Class HP</span>
                <span className="tabular-nums">{boss.hp} / {boss.max_hp}</span>
              </div>
              <div className="h-4 rounded-full bg-zinc-800 overflow-hidden">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${frac * 100}%` }} />
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-zinc-900 px-4 py-3">
              <div className="text-2xl font-bold">{boss.your_damage}</div>
              <div className="text-xs text-zinc-500">your damage</div>
            </div>
            <div className="rounded-xl bg-zinc-900 px-4 py-3">
              <div className="text-2xl font-bold">{boss.contributors}</div>
              <div className="text-xs text-zinc-500">students fighting</div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-zinc-600">
            Every correct Quick Game answer deals 1 damage · resets Monday
          </p>

          <Link href="/play" className="mt-auto block rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-6 py-5 text-center text-lg font-semibold">
            ⚔ Attack — play Quick Game
          </Link>
        </div>
      )}
    </main>
  );
}
