import type { SupabaseClient } from '@supabase/supabase-js';

export type ClassRow = { id: string; name: string; code: string; year: number | null; is_teacher: boolean; members: number };
export type ClassMemberStat = { name: string; weekly_xp: number; streak: number; boss_damage: number };

export async function createClass(sb: SupabaseClient, name: string, year: 11 | 12): Promise<{ id: string; code: string }> {
  const { data, error } = await sb.rpc('create_class', { p_name: name, p_year: year });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function joinClass(sb: SupabaseClient, code: string): Promise<{ class_id: string; name: string }> {
  const { data, error } = await sb.rpc('join_class', { p_code: code });
  if (error) throw new Error(error.message);
  return data[0];
}

export async function getMyClasses(sb: SupabaseClient): Promise<ClassRow[]> {
  const { data, error } = await sb.rpc('get_my_classes');
  if (error) throw new Error(error.message);
  return (data ?? []) as ClassRow[];
}

export async function getClassDashboard(sb: SupabaseClient, classId: string): Promise<ClassMemberStat[]> {
  const { data, error } = await sb.rpc('get_class_dashboard', { p_class_id: classId });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClassMemberStat[];
}
