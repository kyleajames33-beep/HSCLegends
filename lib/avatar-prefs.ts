import type { SupabaseClient } from '@supabase/supabase-js';

export async function setAvatar(sb: SupabaseClient, style: string, seed: string) {
  const { error } = await sb.rpc('set_avatar', { p_style: style, p_seed: seed });
  if (error) throw new Error(error.message);
}

export async function getMyAvatar(
  sb: SupabaseClient, userId: string
): Promise<{ style: string | null; seed: string | null }> {
  const { data } = await sb.from('user_profiles').select('avatar_style,avatar_seed').eq('user_id', userId).maybeSingle();
  return { style: data?.avatar_style ?? null, seed: data?.avatar_seed ?? null };
}
