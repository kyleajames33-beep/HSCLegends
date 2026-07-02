import type { SupabaseClient } from '@supabase/supabase-js';

// Research HQ — persistent idle base. Reactor generates Sparks over time (up to
// the Vault cap); Lab speeds up upgrades. Costs/durations come from the server.
export type Base = {
  reactor_lvl: number; vault_lvl: number; lab_lvl: number;
  reactor_finishes_at: string | null; vault_finishes_at: string | null; lab_finishes_at: string | null;
  pending: number; cap: number; rate: number;        // Sparks ready, storage cap, Sparks/hour
  reactor_cost: number; vault_cost: number; lab_cost: number;     // next-upgrade Spark cost
  reactor_secs: number; vault_secs: number; lab_secs: number;     // next-upgrade duration (s)
};
export type Building = 'reactor' | 'vault' | 'lab';

export async function getBase(sb: SupabaseClient): Promise<Base> {
  const { data, error } = await sb.rpc('get_base');
  if (error) throw new Error(error.message);
  return data[0] as Base;
}

export async function baseCollect(sb: SupabaseClient): Promise<{ collected: number; balance: number }> {
  const { data, error } = await sb.rpc('base_collect');
  if (error) throw new Error(error.message);
  return data[0] as { collected: number; balance: number };
}

export async function baseUpgrade(sb: SupabaseClient, building: Building): Promise<{ balance: number; finishes_at: string }> {
  const { data, error } = await sb.rpc('base_upgrade', { p_building: building });
  if (error) throw new Error(error.message); // 'insufficient_coins' | 'already_upgrading'
  return data[0] as { balance: number; finishes_at: string };
}
