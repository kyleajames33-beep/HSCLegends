'use client';

import { useEffect, useEffectEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

// Sends a signed-in user with no year set to the one-time /welcome setup.
export default function OnboardingGate() {
  const router = useRouter();
  const { user, loading } = useUser();
  const userId = user?.id;
  const isCurrentAccount = useEffectEvent((owner: string) => !loading && userId === owner);
  useEffect(() => {
    if (loading || !userId) return;
    let active = true;
    const owner = userId;
    async function check() {
      try {
        const { data, error } = await createClient().from('user_profiles').select('year').eq('user_id', owner).maybeSingle();
        if (active && isCurrentAccount(owner) && !error && data && data.year == null) router.replace('/welcome');
      } catch { /* A failed profile read is not evidence that onboarding is needed. */ }
    }
    void check();
    return () => { active = false; };
  }, [userId, loading, router]);
  return null;
}
