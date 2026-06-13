'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import Avatar, { AVATAR_STYLES, STYLE_LABEL, type AvatarStyle } from '@/components/avatar';
import { setAvatar, getMyAvatar } from '@/lib/avatar-prefs';

const randSeed = () => Math.random().toString(36).slice(2, 10);

export default function AvatarPage() {
  const sb = useMemo(() => createClient(), []);
  const { user, loading } = useUser();
  const router = useRouter();
  const [style, setStyle] = useState<AvatarStyle>('adventurer');
  const [seed, setSeed] = useState('legend');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyAvatar(sb, user.id).then(({ style: st, seed: sd }) => {
      if (st && AVATAR_STYLES.includes(st as AvatarStyle)) setStyle(st as AvatarStyle);
      setSeed(sd || user.id.slice(0, 8));
      setReady(true);
    });
  }, [user, sb]);

  if (!loading && !user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-inksoft">Sign in to customise your Legend.</p>
        <Link href="/login?next=/avatar" className="lg-btn lg-btn-primary mt-4 px-5 py-3">Sign in</Link>
      </main>
    );
  }

  async function save() {
    setBusy(true);
    try { await setAvatar(sb, style, seed); router.replace('/'); }
    finally { setBusy(false); }
  }

  return (
    <main className="flex flex-1 flex-col px-6 pt-12 pb-10 max-w-md w-full mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">Your Legend</h1>
        <Link href="/" className="text-sm text-muted underline">Home</Link>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <Avatar seed={seed} style={style} size={140} className="rounded-full" />
        <button onClick={() => setSeed(randSeed())} className="lg-btn lg-btn-berry mt-4 px-5 py-2.5 text-sm">
          🎲 Re-roll look
        </button>
      </div>

      <h2 className="mt-7 font-display font-bold text-ink">Style</h2>
      <div className="mt-3 grid grid-cols-4 gap-3">
        {AVATAR_STYLES.map((st) => (
          <button key={st} onClick={() => setStyle(st)}
            className={`rounded-2xl p-1.5 transition ${style === st ? 'ring-2 ring-plum bg-parchment-deep' : 'bg-panel'}`}>
            <Avatar seed={seed} style={st} size={56} className="rounded-full w-full h-auto" />
            <div className="text-[10px] text-muted mt-1">{STYLE_LABEL[st]}</div>
          </button>
        ))}
      </div>

      <button onClick={save} disabled={busy || !ready}
        className="lg-btn lg-btn-primary mt-auto w-full px-6 py-4 text-lg disabled:opacity-40">
        {busy ? 'Saving…' : 'Save my Legend'}
      </button>
    </main>
  );
}
