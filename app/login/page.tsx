'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginInner() {
  const sb = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setErr(error.message);
    else router.replace(next);
  }

  return (
    <main className="flex flex-1 flex-col px-6 pt-16 pb-10 max-w-md w-full mx-auto">
      <h1 className="text-2xl font-bold">{sent ? 'Enter your code' : 'Sign in'}</h1>
      <p className="text-inksoft text-sm mt-1">
        {sent ? `We emailed a 6-digit code to ${email}.` : 'We’ll email you a one-time code — no password.'}
      </p>

      {!sent ? (
        <form onSubmit={sendCode} className="mt-6 space-y-4">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com" autoComplete="email" required
            className="w-full rounded-xl bg-panel border border-rule px-4 py-3 outline-none focus:border-plum"
          />
          <button disabled={busy || !email.includes('@')}
            className="w-full rounded-xl bg-plum hover:bg-plumdeep text-white px-4 py-4 font-semibold disabled:opacity-40">
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-6 space-y-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10))}
            placeholder="CODE" maxLength={10} autoFocus autoCapitalize="characters" autoComplete="one-time-code"
            className="w-full rounded-xl bg-panel border border-rule px-4 py-3 text-center text-2xl tracking-[0.3em] outline-none focus:border-plum"
          />
          <button disabled={busy || code.length < 6}
            className="w-full rounded-xl bg-plum hover:bg-plumdeep text-white px-4 py-4 font-semibold disabled:opacity-40">
            {busy ? 'Verifying…' : 'Verify & sign in'}
          </button>
          <button type="button" onClick={() => { setSent(false); setCode(''); }} className="w-full text-sm text-muted">
            Use a different email
          </button>
        </form>
      )}
      {err && <p className="mt-4 text-brick text-sm">{err}</p>}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
