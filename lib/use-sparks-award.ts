'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type AwardState =
  | { status: 'idle'; owner: string | null }
  | { status: 'pending'; owner: string }
  | { status: 'confirmed'; owner: string; amount: number }
  | { status: 'unconfirmed'; owner: string };

// UI acknowledgement only. credit_coins is a legacy non-idempotent RPC that
// accepts a client amount; this hook does not make it server-authoritative.
export function useSparksAward(sb: SupabaseClient, owner: string | undefined) {
  const [state, setState] = useState<AwardState>({ status: 'idle', owner: owner ?? null });
  const generation = useRef(0);
  const attempted = useRef<number | null>(null);
  const inFlight = useRef(false);

  // Invalidate old work on logout/account switch and on unmount. Do not retry:
  // a transport failure can occur after the server committed the award.
  useEffect(() => () => { generation.current += 1; }, [owner]);

  function reset() {
    generation.current += 1;
    attempted.current = null;
    inFlight.current = false;
    setState({ status: 'idle', owner: owner ?? null });
    return generation.current;
  }
  function token() { return generation.current; }
  function isCurrent(value: number) { return generation.current === value; }

  async function claim(amount: number, reason: string, run = generation.current) {
    if (!owner || !isCurrent(run) || attempted.current === run || inFlight.current) return;
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    attempted.current = run;
    inFlight.current = true;
    setState({ status: 'pending', owner });
    try {
      const { data, error } = await sb.rpc('credit_coins', { p_amount: amount, p_reason: reason, p_meta: null });
      if (!isCurrent(run)) return;
      // This RPC returns the new balance, not an award receipt. Require an
      // actual scalar acknowledgement rather than treating null as success.
      const validBalance = (typeof data === 'number' && Number.isFinite(data) && Number.isInteger(data) && data >= 0)
        || (typeof data === 'string' && /^\d+$/.test(data));
      setState(!error && validBalance ? { status: 'confirmed', owner, amount } : { status: 'unconfirmed', owner });
    } catch {
      if (isCurrent(run)) setState({ status: 'unconfirmed', owner });
    } finally {
      if (isCurrent(run)) inFlight.current = false;
    }
  }

  return { state: state.owner === (owner ?? null) ? state : { status: 'idle' as const, owner: owner ?? null }, reset, token, isCurrent, claim };
}
