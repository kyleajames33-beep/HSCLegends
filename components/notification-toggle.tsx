'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';
import { pushSupported, currentSubscription, subscribePush, unsubscribePush } from '@/lib/push';

// Opt-in streak/boss reminders. Hidden when logged out or unsupported.
export default function NotificationToggle() {
  const sb = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setSupported(pushSupported());
    currentSubscription().then(setOn).catch(() => {});
  }, []);

  if (!user || !supported) return null;

  async function toggle() {
    setBusy(true); setMsg('');
    try {
      if (on) { await unsubscribePush(sb); setOn(false); }
      else { await subscribePush(sb); setOn(true); }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg('');
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'HSC Legends 🔥', body: 'Notifications are on — keep that streak alive!', url: '/' }),
      });
      setMsg(res.ok ? 'Sent! Check your notifications.' : 'Send failed.');
    } catch { setMsg('Send failed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="lg-card mt-3 px-4 py-3">
      <label className="flex items-center justify-between text-sm">
        <span className="text-ink font-semibold">🔔 Streak &amp; boss reminders</span>
        <button onClick={toggle} disabled={busy}
          className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-plum' : 'bg-rule'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </label>
      {on && <button onClick={test} disabled={busy} className="mt-2 text-xs text-berrydeep underline">Send a test</button>}
      {msg && <p className="mt-2 text-xs text-inksoft">{msg}</p>}
    </div>
  );
}
