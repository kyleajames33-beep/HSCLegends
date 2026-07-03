import type { SupabaseClient } from '@supabase/supabase-js';

export type FriendRow = {
  friend_id: string;
  name: string;
  avatar_style: string | null;
  avatar_seed: string | null;
  division: number;
  streak: number;
  week_xp: number;
  level: number;
};

export type FriendsBoardRow = {
  rank: number;
  name: string;
  week_xp: number;
  is_me: boolean;
  avatar_style: string | null;
  avatar_seed: string | null;
};

export async function getMyHandle(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb.rpc('get_my_handle');
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

export async function addFriend(sb: SupabaseClient, handle: string): Promise<{ friend_id: string; name: string }> {
  const { data, error } = await sb.rpc('add_friend', { p_handle: handle });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { friend_id: string; name: string };
}

export async function removeFriend(sb: SupabaseClient, friendId: string): Promise<void> {
  const { error } = await sb.rpc('remove_friend', { p_friend: friendId });
  if (error) throw new Error(error.message);
}

export async function getFriends(sb: SupabaseClient): Promise<FriendRow[]> {
  const { data, error } = await sb.rpc('get_friends');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: FriendRow) => ({
    ...r,
    week_xp: Number(r.week_xp),
    division: Number(r.division),
    streak: Number(r.streak),
    level: Number(r.level),
  }));
}

export async function getFriendsBoard(sb: SupabaseClient): Promise<FriendsBoardRow[]> {
  const { data, error } = await sb.rpc('get_friends_board');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: FriendsBoardRow) => ({ ...r, week_xp: Number(r.week_xp) }));
}
