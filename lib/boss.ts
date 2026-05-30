import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject } from './questions';

export type Boss = {
  name: string;
  emoji: string;
  emoji_damaged: string;
  emoji_critical: string;
  attack_name: string;
  hp: number;
  max_hp: number;
  defeated: boolean;
  your_damage: number;
  contributors: number;
  week_key: string;
};

export async function getBoss(sb: SupabaseClient, subject: Subject): Promise<Boss | null> {
  const { data, error } = await sb.rpc('get_boss', { p_subject: subject });
  if (error) throw new Error(error.message);
  return (data?.[0] as Boss) ?? null;
}

// Emoji to show given current HP fraction.
export function bossFace(b: Boss): string {
  if (b.defeated) return '💀';
  const frac = b.hp / b.max_hp;
  if (frac <= 0.25) return b.emoji_critical;
  if (frac <= 0.6) return b.emoji_damaged;
  return b.emoji;
}
