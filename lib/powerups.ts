import type { SupabaseClient } from '@supabase/supabase-js';

export type Powerup = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  price: number;
  count: number;
};

// Which power-ups are usable in the untimed solo quiz (Quick Game / Topic drill).
export const QUICKGAME_POWERUPS = ['fifty_fifty', 'hint', 'double_sparks', 'skip'];

export async function getPowerups(sb: SupabaseClient): Promise<Powerup[]> {
  const { data, error } = await sb.rpc('get_powerups');
  if (error) throw new Error(error.message);
  return (data ?? []) as Powerup[];
}

export async function buyPowerup(sb: SupabaseClient, id: string, qty = 1): Promise<number> {
  const { data, error } = await sb.rpc('buy_powerup', { p_powerup: id, p_qty: qty });
  if (error) throw new Error(error.message);
  return data as number;
}

export async function usePowerup(sb: SupabaseClient, id: string): Promise<number> {
  const { data, error } = await sb.rpc('use_powerup', { p_powerup: id });
  if (error) throw new Error(error.message);
  return data as number;
}
