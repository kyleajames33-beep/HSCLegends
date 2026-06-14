// Streak re-engagement dispatcher — sends ONE encouraging push to each player
// whose streak is at risk (active streak, hasn't played yet today AEST, not already
// nudged today). No pg_cron on this project, so schedule this externally:
//   - Supabase Dashboard → Edge Functions → Schedules (cron), e.g. "0 8 * * *" UTC (~6pm AEST), OR
//   - any cron (GitHub Action / cron-job.org) doing: POST <fn-url> with header x-cron-secret: <CRON_SECRET>
//
// Required secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET   (SUPABASE_URL / SERVICE_ROLE_KEY are auto-injected)
//
// Ethics: at most ONE streak nudge per user per day; encouraging copy only, never guilt.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

webpush.setVapidDetails(
  'mailto:kyle.a.james33@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

// Encouraging, varied copy — never shame.
function copy(streak: number) {
  const lines = [
    `🔥 Keep your ${streak}-day streak alive — a 2-minute quiz does it.`,
    `Your ${streak}-day streak is waiting. One quick round and it's safe! ⚡`,
    `${streak} days strong 💪 — squeeze in a quick quiz before midnight.`,
  ];
  return lines[streak % lines.length];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: targets, error } = await admin.rpc('streak_nudge_targets');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0;
  const nudged = new Set<string>();
  for (const t of targets ?? []) {
    const payload = JSON.stringify({ title: 'HSC Legends', body: copy(t.streak), url: '/play' });
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        payload,
      );
      sent++;
      if (!nudged.has(t.user_id)) {
        nudged.add(t.user_id);
        await admin.rpc('mark_notif_sent', { p_user: t.user_id, p_kind: 'streak' });
      }
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', t.endpoint);
    }
  }
  return new Response(JSON.stringify({ targets: (targets ?? []).length, sent, users: nudged.size }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
