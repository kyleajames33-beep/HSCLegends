'use client';

// Client helpers for the live classroom game screens (/live and /live/host).
// They talk only to the dedicated staging project via the classroom_v2_game_*
// RPCs. The server decides scores, deadlines and who may see what; nothing
// here is trusted for authorization.

import { useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StagingConfig } from '@/lib/classroom-v2/staging-config';

export type BossSubject = 'biology' | 'chemistry' | 'physics' | 'maths-standard' | 'maths-advanced' | 'maths-ext1';
export type BossState = { subject: BossSubject; hp: number | null; damage: number; round_damage: number };
export type LiveQuestion = { id: string; index: number; stem: string; options: string[] };
export type HostPlayer = { id: string; alias: string; score: number; last_points: number; answered: boolean; correct: boolean | null };
export type HostView = {
  room_id: string; version: number; state: 'lobby' | 'active' | 'complete'; short_code: string; seconds: number;
  question_total: number; question: (LiveQuestion & { correct_index: number; explanation: string | null }) | null;
  opens_at: string | null; closes_at: string | null; server_now: string;
  answered: number; choice_counts: number[] | null; players: HostPlayer[];
  mode: 'classic' | 'boss'; boss: BossState | null;
};
export type PlayerReceipt = { choice: number; correct: boolean; correct_index: number; points: number; explanation: string | null };
export type PlayerView = {
  room_id: string; version: number; state: 'lobby' | 'active' | 'complete'; alias: string; score: number;
  rank: number; player_count: number; streak: number; answered: number; question_total: number;
  question: LiveQuestion | null; opens_at: string | null; closes_at: string | null; server_now: string;
  receipt: PlayerReceipt | null;
  mode: 'classic' | 'boss'; boss: BossState | null;
};

const KNOWN = ['FORBIDDEN', 'ROOM_UNAVAILABLE', 'STALE_QUESTION', 'OUTSIDE_WINDOW', 'INVALID_CHOICE', 'INVALID_ALIAS', 'INVALID_SETUP', 'INVALID_CONTENT', 'ALIAS_TAKEN'] as const;
export type LiveErrorCode = (typeof KNOWN)[number] | 'UNKNOWN';

export class LiveError extends Error {
  constructor(public code: LiveErrorCode) { super(code); }
}

function codeOf(error: unknown): LiveErrorCode {
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  return KNOWN.find(k => message.includes(k)) ?? 'UNKNOWN';
}

export type LiveRole = 'host' | 'player';
type AuthStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

/**
 * Per-tab session storage: each browser tab is its own player, so a teacher can
 * test with extra tabs. Player sessions are also mirrored to localStorage so a
 * student who closes the tab by accident can rejoin (see readPlayerRecovery).
 */
function tabStorage(mirror: boolean): AuthStorage | undefined {
  let tab: Storage;
  try { tab = window.sessionStorage; tab.setItem('__hsc_live', '1'); tab.removeItem('__hsc_live'); } catch { return undefined; }
  const local = (): Storage | null => { try { return window.localStorage; } catch { return null; } };
  return {
    getItem: k => tab.getItem(k),
    setItem: (k, v) => { tab.setItem(k, v); if (mirror) try { local()?.setItem(`${MIRROR}${k}`, v); } catch { /* optional */ } },
    removeItem: k => { tab.removeItem(k); if (mirror) try { local()?.removeItem(`${MIRROR}${k}`); } catch { /* optional */ } },
  };
}
const MIRROR = 'hsc-live-recover:';
const storageKey = (config: StagingConfig, role: LiveRole) => `hsc-live-${config.projectRef}-${role}`;

const cached = new Map<string, SupabaseClient>();
export function liveClient(config: StagingConfig, role: LiveRole): SupabaseClient {
  const key = storageKey(config, role);
  const hit = cached.get(key);
  if (hit) return hit;
  const client = createClient(config.url, config.publicKey, {
    auth: { storageKey: key, storage: tabStorage(role === 'player'), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  cached.set(key, client);
  return client;
}

/** Last player seat + its session tokens, if saved in this browser within 6 hours. */
export type PlayerRecovery = { seat: { roomId: string; playerId: string }; alias: string; tokens: { access_token: string; refresh_token: string } };
const LAST_SEAT = 'hsc-live-last-seat';
export function savePlayerSeat(seat: { roomId: string; playerId: string }, alias: string): void {
  try { window.localStorage.setItem(LAST_SEAT, JSON.stringify({ seat, alias, at: Date.now() })); } catch { /* optional */ }
}
export function clearPlayerRecovery(config: StagingConfig): void {
  try { window.localStorage.removeItem(LAST_SEAT); window.localStorage.removeItem(`${MIRROR}${storageKey(config, 'player')}`); } catch { /* optional */ }
}
export function readPlayerRecovery(config: StagingConfig): PlayerRecovery | null {
  try {
    const last = JSON.parse(window.localStorage.getItem(LAST_SEAT) ?? 'null');
    const session = JSON.parse(window.localStorage.getItem(`${MIRROR}${storageKey(config, 'player')}`) ?? 'null');
    if (!last?.seat?.roomId || !last?.seat?.playerId || typeof last.alias !== 'string' || !(Date.now() - last.at < 6 * 3600_000)) return null;
    if (typeof session?.access_token !== 'string' || typeof session?.refresh_token !== 'string') return null;
    return { seat: { roomId: last.seat.roomId, playerId: last.seat.playerId }, alias: last.alias, tokens: { access_token: session.access_token, refresh_token: session.refresh_token } };
  } catch { return null; }
}

export async function rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  let result;
  try { result = await client.rpc(name, args); } catch { throw new LiveError('UNKNOWN'); }
  if (result.error) throw new LiveError(codeOf(result.error));
  return result.data as T;
}

export type Session = 'checking' | 'signed-out' | 'teacher' | 'guest';
export function useSession(client: SupabaseClient): Session {
  const [session, setSession] = useState<Session>('checking');
  useEffect(() => {
    let alive = true;
    const apply = (user: { is_anonymous?: boolean } | null | undefined) => { if (alive) setSession(!user ? 'signed-out' : user.is_anonymous ? 'guest' : 'teacher'); };
    client.auth.getSession().then(({ data }) => apply(data.session?.user)).catch(() => apply(null));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, s) => apply(s?.user));
    return () => { alive = false; subscription.unsubscribe(); };
  }, [client]);
  return session;
}

/**
 * Polls `fetcher` every `intervalMs`. Late responses from an older fetcher or an
 * earlier request are dropped. `offset` estimates server time minus local time.
 */
export function usePoll<T extends { server_now: string }>(fetcher: (() => Promise<T>) | null, intervalMs: number) {
  const [state, setState] = useState<{ data: T | null; error: LiveErrorCode | null; offset: number }>({ data: null, error: null, offset: 0 });
  const kick = useRef<() => void>(() => {});
  useEffect(() => {
    if (!fetcher) { setState({ data: null, error: null, offset: 0 }); return; }
    let alive = true, seq = 0, latest = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (timer) clearTimeout(timer);
      const mine = ++seq;
      const sent = Date.now();
      try {
        const data = await fetcher();
        if (!alive || mine < latest) return;
        latest = mine;
        const received = Date.now();
        const offset = Date.parse(data.server_now) - (sent + received) / 2;
        setState({ data, error: null, offset: Number.isFinite(offset) ? offset : 0 });
      } catch (error) {
        if (!alive || mine < latest) return;
        latest = mine;
        setState(prev => ({ ...prev, error: error instanceof LiveError ? error.code : 'UNKNOWN' }));
      }
      if (alive) timer = setTimeout(run, intervalMs);
    };
    kick.current = () => { void run(); };
    void run();
    return () => { alive = false; if (timer) clearTimeout(timer); kick.current = () => {}; };
  }, [fetcher, intervalMs]);
  return { ...state, refresh: () => kick.current() };
}

/** Re-renders every `ms` and returns local Date.now(). */
export function useNow(ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

export function msRemaining(closesAt: string | null, now: number, offset: number): number {
  if (!closesAt) return 0;
  const end = Date.parse(closesAt);
  return Number.isFinite(end) ? Math.max(0, end - (now + offset)) : 0;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function readTab<T>(key: string): T | null {
  try { const raw = window.sessionStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
export function writeTab(key: string, value: unknown): void {
  try { if (value === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked: state lives in memory only */ }
}

export const SHAPES = ['▲', '◆', '●', '■', '★', '⬟'] as const;

// Unreviewed staging sample. Replace with teacher-imported sets once the
// import-to-staging path exists.
export const SAMPLE_SET = [
  { stem: 'Which organelle contains most of the DNA in a eukaryotic cell?', options: ['Nucleus', 'Ribosome', 'Cell membrane', 'Cytoplasm'], correct_index: 0 },
  { stem: 'What is the pH of a neutral solution at 25 °C?', options: ['1', '7', '10', '14'], correct_index: 1 },
  { stem: 'What is the SI unit of force?', options: ['Joule', 'Watt', 'Newton', 'Pascal'], correct_index: 2 },
  { stem: 'Which base pairs with adenine in DNA?', options: ['Cytosine', 'Guanine', 'Uracil', 'Thymine'], correct_index: 3 },
  { stem: 'Which gas is produced when a reactive metal reacts with a dilute acid?', options: ['Hydrogen', 'Oxygen', 'Carbon dioxide', 'Chlorine'], correct_index: 0 },
  { stem: 'What is the derivative of x²?', options: ['x', '2x', 'x³/3', '2'], correct_index: 1 },
  { stem: 'Approximately how fast does light travel in a vacuum?', options: ['3.0 × 10⁶ m/s', '3.0 × 10⁸ m/s', '3.4 × 10² m/s', '9.8 m/s'], correct_index: 1 },
  { stem: 'Solve 2x + 6 = 0.', options: ['x = 3', 'x = −6', 'x = −3', 'x = 6'], correct_index: 2 },
].map(q => ({ ...q, content_revision: 'unreviewed-staging-sample-v2' }));
