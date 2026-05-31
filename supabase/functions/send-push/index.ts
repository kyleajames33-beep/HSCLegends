// Sends a Web Push to the calling user's devices.
//
// NOTE: the LIVE deployed copy currently has the VAPID keys inline for the pilot.
// For production, set these as secrets and redeploy from this file:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

webpush.setVapidDetails(
  'mailto:kyle.a.james33@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { title, body, url } = await req.json().catch(() => ({}));
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', user.id);
    const payload = JSON.stringify({ title: title || 'HSC Legends', body: body || '', url: url || '/' });
    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
    return json({ sent });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
