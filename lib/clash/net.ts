'use client';

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export type ClashNet = { send: (event: string, payload: unknown) => void; close: () => void };
export type RelayStatus = 'connecting' | 'connected' | 'unavailable';
type RelayOptions = { url: string; playerId?: string; onStatus: (status: RelayStatus) => void };

export function openClashChannel(
  client: SupabaseClient,
  roomId: string,
  events: string[],
  onMessage: (event: string, payload: unknown) => void,
  relay?: RelayOptions,
): ClashNet {
  if (relay) return openRelay(client, roomId, events, onMessage, relay);
  const channel: RealtimeChannel = client.channel(`clash-${roomId}`, { config: { broadcast: { self: false, ack: false } } });
  let closed = false;
  let open = false;
  for (const event of events) channel.on('broadcast', { event }, msg => { if (!closed) onMessage(event, msg.payload); });
  channel.subscribe(status => { open = !closed && status === 'SUBSCRIBED'; });
  return {
    send: (event, payload) => { if (open) void channel.send({ type: 'broadcast', event, payload }); },
    close: () => { closed = true; open = false; void client.removeChannel(channel); },
  };
}

function openRelay(
  client: SupabaseClient,
  roomId: string,
  events: string[],
  onMessage: (event: string, payload: unknown) => void,
  { url, playerId, onStatus }: RelayOptions,
): ClashNet {
  let socket: WebSocket | undefined;
  let closed = false;
  let joined = false;
  let attempts = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let handshake: ReturnType<typeof setTimeout> | undefined;

  function reconnect() {
    if (closed) return;
    onStatus('connecting');
    const delay = Math.min(8000, 400 * 2 ** Math.min(attempts++, 5));
    retry = setTimeout(() => void connect(), delay + Math.random() * 300);
  }

  async function connect() {
    if (closed) return;
    try {
      const { data, error } = await client.auth.getSession();
      if (closed) return;
      if (error || !data.session?.access_token) { reconnect(); return; }
      const accessToken = data.session.access_token;
      const next = new WebSocket(url);
      socket = next;
      handshake = setTimeout(() => next.close(), 8000);
      next.addEventListener('open', () => {
        if (!closed) next.send(JSON.stringify({ type: 'join', roomId, playerId, accessToken }));
      });
      next.addEventListener('message', message => {
        if (closed || typeof message.data !== 'string') return;
        let packet;
        try { packet = JSON.parse(message.data); } catch { return; }
        if (packet?.type === 'joined') {
          clearTimeout(handshake);
          joined = true;
          attempts = 0;
          onStatus('connected');
        } else if (joined && packet?.type === 'event' && events.includes(packet.event)) {
          onMessage(packet.event, packet.payload);
        }
      });
      next.addEventListener('close', ({ code }) => {
        clearTimeout(handshake);
        joined = false;
        if (closed) return;
        if (code === 4003 || code === 4009 || code === 1008) onStatus('unavailable');
        else reconnect();
      });
    } catch {
      reconnect();
    }
  }

  queueMicrotask(() => {
    if (closed) return;
    onStatus('connecting');
    void connect();
  });
  return {
    send: (event, payload) => {
      if (joined && socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 256 * 1024) {
        socket.send(JSON.stringify({ type: 'event', event, payload }));
      }
    },
    close: () => { closed = true; clearTimeout(retry); clearTimeout(handshake); socket?.close(); },
  };
}
