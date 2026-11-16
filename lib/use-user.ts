'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from './supabase/client';

const ACCOUNT_TIMEOUT_MS = 12_000;

// Reactive current-user hook. `loading` is true until the first session resolves.
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let sb: ReturnType<typeof createClient>;
    try { sb = createClient(); }
    catch {
      Promise.resolve().then(() => {
        if (active) { setError('Account services are unavailable.'); setLoading(false); }
      });
      return () => { active = false; };
    }
    // A sign-in/out or token refresh is newer than the initial lookup, even
    // if the lookup resolves afterwards. INITIAL_SESSION is only a local
    // snapshot; getUser is responsible for the initial verified lookup.
    let generation = 0;
    const initialGeneration = generation;
    const timeout = setTimeout(() => {
      if (!active || generation !== initialGeneration) return;
      generation++;
      setUser(null); setError('Account services are unavailable.'); setLoading(false);
    }, ACCOUNT_TIMEOUT_MS);
    let unsubscribe: (() => void) | undefined;
    try {
      const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
        if (!active || event === 'INITIAL_SESSION') return;
        generation++;
        clearTimeout(timeout);
        setUser(session?.user ?? null);
        setError(null);
        setLoading(false);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      void sb.auth.getUser().then(({ data, error: authError }) => {
        if (!active || generation !== initialGeneration) return;
        clearTimeout(timeout);
        if (authError && authError.name !== 'AuthSessionMissingError') {
          setUser(null); setError('Account services are unavailable.');
        } else {
          setUser(data.user); setError(null);
        }
        setLoading(false);
      }).catch(() => {
        if (active && generation === initialGeneration) {
          clearTimeout(timeout);
          setUser(null); setError('Account services are unavailable.'); setLoading(false);
        }
      });
    } catch {
      Promise.resolve().then(() => {
        if (active && generation === initialGeneration) {
          clearTimeout(timeout);
          setUser(null); setError('Account services are unavailable.'); setLoading(false);
        }
      });
    }
    return () => { active = false; clearTimeout(timeout); unsubscribe?.(); };
  }, []);

  return { user, loading, error };
}
