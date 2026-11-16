/** Isolated staging-only session controller; server RPC authorization is separate. */
export type GuestAuthSnapshot = Readonly<{
  status: 'checking' | 'signed-out' | 'ready' | 'unavailable';
  actorId: string | null;
  generation: number;
  isAnonymous: boolean | null;
}>;
type User = { id: string; is_anonymous?: boolean };
type Auth = {
  getUser(): PromiseLike<{ data: { user: User | null }; error: { name?: string } | null }>;
  signInAnonymously(input?: { options: { captchaToken: string } }): PromiseLike<{ error: unknown }>;
  onAuthStateChange(callback: (event: string) => void): { data: { subscription: { unsubscribe(): void } } };
};
type Options = { enabled: boolean; target: 'staging'; projectUrl: string };
const sharedProduction = 'rerfrskojieacxthfavb.supabase.co';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A safety guard against a known shared target, not verification of a staging project. */
export function isAllowedGuestAuthTarget(options: Options): boolean {
  if (!options || options.enabled !== true || options.target !== 'staging') return false;
  try {
    const url = new URL(options.projectUrl), host = url.hostname.toLowerCase().replace(/\.$/, '');
    return !url.username && !url.password && !url.search && !url.hash && (url.pathname === '/' || url.pathname === '') && host !== sharedProduction && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(host)));
  } catch { return false; }
}

/**
 * Uses a caller-supplied dedicated staging Supabase auth client. Register this
 * controller before joining a room and dispose room clients on every generation
 * change. The verified getUser result is a UI identity, not authorization.
 * Auth callbacks only invalidate state and schedule work; they never await SDK
 * calls in the callback. No credentials or selector data are saved here.
 */
export function createStagingGuestAuth(options: Options, auth: Auth) {
  if (!isAllowedGuestAuthTarget(options)) throw new Error('INVALID_STAGING_TARGET');
  let snapshot: GuestAuthSnapshot = { status: 'checking', actorId: null, generation: 0, isAnonymous: null };
  let disposed = false, started = false, signingIn = false;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* listener errors do not corrupt auth state */ } } };
  const set = (status: GuestAuthSnapshot['status'], user?: User | null) => {
    snapshot = { status, actorId: status === 'ready' && user ? user.id : null, generation: snapshot.generation, isAnonymous: status === 'ready' && user && typeof user.is_anonymous === 'boolean' ? user.is_anonymous : null };
    notify();
  };
  const invalidate = () => {
    snapshot = { status: 'checking', actorId: null, isAnonymous: null, generation: snapshot.generation + 1 };
    if (timeout !== undefined) clearTimeout(timeout);
    notify();
  };
  const verify = () => {
    if (disposed || !started) return;
    invalidate();
    const generation = snapshot.generation;
    timeout = setTimeout(() => { if (!disposed && snapshot.generation === generation) { snapshot = { ...snapshot, generation: generation + 1 }; set('unavailable'); } }, 12000);
    Promise.resolve().then(() => disposed || snapshot.generation !== generation ? null : auth.getUser()).then(result => {
      if (disposed || snapshot.generation !== generation || !result) return;
      if (timeout !== undefined) clearTimeout(timeout);
      if (result.error) { set(result.error.name === 'AuthSessionMissingError' ? 'signed-out' : 'unavailable'); return; }
      if (!result.data?.user) { set('signed-out'); return; }
      const user = result.data.user;
      if (typeof user.id !== 'string' || !uuid.test(user.id)) { set('unavailable'); return; }
      set('ready', user);
    }, () => {
      if (disposed || snapshot.generation !== generation) return;
      if (timeout !== undefined) clearTimeout(timeout);
      set('unavailable');
    });
  };
  return {
    start() {
      if (disposed || started) return;
      started = true;
      try {
        const result = auth.onAuthStateChange(event => {
          if (disposed || event === 'INITIAL_SESSION') return;
          invalidate();
          if (scheduled !== undefined) clearTimeout(scheduled);
          scheduled = setTimeout(() => { scheduled = undefined; verify(); }, 0);
        });
        unsubscribe = () => result.data.subscription.unsubscribe();
        verify();
      } catch { set('unavailable'); }
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Explicit user action only; never creates a replacement after a lost session. */
    async signIn(captchaToken?: string): Promise<'requested' | 'unavailable' | 'failed' | 'obsolete'> {
      if (disposed || !started || snapshot.status !== 'signed-out' || signingIn || (captchaToken !== undefined && (typeof captchaToken !== 'string' || !captchaToken.trim() || captchaToken.length > 4096))) return 'unavailable';
      signingIn = true;
      try {
        const result = await auth.signInAnonymously(captchaToken === undefined ? undefined : { options: { captchaToken } });
        if (disposed) return 'obsolete';
        if (result.error) return 'failed';
        // Auth events normally trigger verification. This fallback also covers
        // transports that do not emit one; a concurrent event invalidates it.
        verify();
        return 'requested';
      } catch { return disposed ? 'obsolete' : 'failed'; }
      finally { signingIn = false; }
    },
    retry() { if (!disposed && started) verify(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scheduled !== undefined) clearTimeout(scheduled);
      if (timeout !== undefined) clearTimeout(timeout);
      snapshot = { status: 'unavailable', actorId: null, isAnonymous: null, generation: snapshot.generation + 1 };
      notify();
      unsubscribe?.(); listeners.clear();
    },
  };
}
