'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function currentSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}

export async function subscribePush(sb: SupabaseClient): Promise<void> {
  if (!pushSupported()) throw new Error('Notifications aren’t supported here');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were blocked');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
  const json = sub.toJSON();
  const { error } = await sb.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys!.p256dh,
    p_auth: json.keys!.auth,
  });
  if (error) throw new Error(error.message);
}

export async function unsubscribePush(sb: SupabaseClient): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sb.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}
