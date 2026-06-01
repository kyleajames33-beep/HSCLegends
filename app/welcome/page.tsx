'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SUBJECTS, type Subject } from '@/lib/questions';

// First-run setup: capture year + subjects so the app can personalise.
export default function WelcomePage() {
  const sb = createClient();
  const router = useRouter();
  const [year, setYear] = useState<11 | 12 | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function toggle(s: Subject) {
    setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function save() {
    if (!year) return;
    setBusy(true); setErr('');
    const { error } = await sb.rpc('set_profile_basics', { p_year: year, p_subjects: subjects });
    setBusy(false);
    if (error) setErr(error.message);
    else router.replace('/');
  }

  return (
    <main className="flex flex-1 flex-col px-6 pt-14 pb-10 max-w-md w-full mx-auto">
      <p className="text-berrydeep font-semibold text-sm">WELCOME TO LEGENDS</p>
      <h1 className="mt-2 text-3xl font-bold">Quick setup</h1>
      <p className="mt-2 text-inksoft text-sm">Two taps and you’re in. We’ll tune your games to these.</p>

      <h2 className="mt-8 font-semibold">Your year</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {[11, 12].map((y) => (
          <button key={y} onClick={() => setYear(y as 11 | 12)}
            className={`rounded-xl px-4 py-4 font-semibold transition ${year === y ? 'bg-plum text-white' : 'bg-panel border border-rule'}`}>
            Year {y}
          </button>
        ))}
      </div>

      <h2 className="mt-7 font-semibold">Your subjects <span className="text-muted font-normal text-sm">(optional)</span></h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUBJECTS.map((s) => (
          <button key={s.id} onClick={() => toggle(s.id)}
            className={`rounded-full px-3 py-2 text-sm font-medium transition ${subjects.includes(s.id) ? 'bg-plum text-white' : 'bg-parchment-deep text-ink'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <button onClick={save} disabled={busy || !year}
        className="mt-auto rounded-2xl bg-plum hover:bg-plumdeep text-white px-6 py-5 text-lg font-semibold disabled:opacity-40">
        {busy ? 'Saving…' : "Let's go ▶"}
      </button>
      {err && <p className="mt-3 text-brick text-sm">{err}</p>}
    </main>
  );
}
