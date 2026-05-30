'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/use-user';

// Sends a signed-in user with no year set to the one-time /welcome setup.
export default function OnboardingGate() {
  const router = useRouter();
  const { user, loading } = useUser();
  useEffect(() => {
    if (loading || !user) return;
    createClient().from('user_profiles').select('year').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data && data.year == null) router.replace('/welcome');
      });
  }, [user, loading, router]);
  return null;
}
