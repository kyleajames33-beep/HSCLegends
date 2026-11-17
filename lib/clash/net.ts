'use client';

// Reactor Clash transport over Supabase Realtime broadcast. Swappable: the game
// only needs send(event, payload) and a message callback. Note the Supabase free
// plan allows ~100 messages/second per project, which suits small tests, not a
// full class; a dedicated game server can replace this module later.

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export type ClashNet = { ready: Promise<void>; send: (event: string, payload: unknown) => void; close: () => void };

export function openClashChannel(client: SupabaseClient, roomId: string, events: string[], onMessage: (event: string, payload: unknown) => void): ClashNet {
  const channel: RealtimeChannel = client.channel(`clash-${roomId}`, { config: { broadcast: { self: false, ack: false } } });
  for (const event of events) channel.on('broadcast', { event }, msg => onMessage(event, msg.payload));
  let open = false;
  const ready = new Promise<void>(resolve => {
    channel.subscribe(status => { if (status === 'SUBSCRIBED') { open = true; resolve(); } });
  });
  return {
    ready,
    send: (event, payload) => { if (open) void channel.send({ type: 'broadcast', event, payload }); },
    close: () => { open = false; void client.removeChannel(channel); },
  };
}
