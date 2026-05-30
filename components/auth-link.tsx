'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

// Compact auth indicator: "Sign in" when logged out, name + sign-out when in.
export default function AuthLink() {
  const { user, loading } = useUser();
  if (loading) return <span className="text-zinc-700">·</span>;
  if (!user)
    return (
      <Link href="/login" className="underline">
        Sign in
      </Link>
    );
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        location.reload();
      }}
      className="underline"
    >
      {user.email ?? 'Signed in'} · sign out
    </button>
  );
}
