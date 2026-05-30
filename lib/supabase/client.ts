'use client';

import { createBrowserClient } from '@supabase/ssr';

// Browser Supabase client for HSC Legends. Points at the SAME project as
// hscscience.com.au so auth / XP / streaks / leaderboard are shared.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
