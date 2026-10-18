import { isAuthSessionMissingError } from '@supabase/supabase-js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const unavailable = () => { throw new Error('account-verification-unavailable'); };

// Unmounted server adapter. Factory MUST create a fresh request-scoped SSR
// client, using the request's cookies and preserving refresh-cookie writes in
// the final response. Do not inject a global client, service-role client,
// browser-supplied user, getSession result, or custom caller identity header.
// No client, key, credential or network request is created at module import.
export function createSupabaseAccountVerifier({ createClientForRequest }) {
  if (typeof createClientForRequest !== 'function') throw new TypeError('Missing request-scoped auth client factory');
  return async function verifyAccount(request, context) {
    let result;
    try {
      const client = await createClientForRequest(request, context);
      if (typeof client?.auth?.getUser !== 'function') return unavailable();
      result = await client.auth.getUser();
    } catch { return unavailable(); }
    if (!result || typeof result !== 'object') return unavailable();
    // Only the SDK's explicit missing-session result can establish no account.
    // Remote verification/refresh failures must never become a guest downgrade.
    if (result.error) {
      if (isAuthSessionMissingError(result.error) && result.data?.user === null) return null;
      return unavailable();
    }
    const user = result.data?.user;
    if (!uuid(user?.id) || typeof user.is_anonymous !== 'boolean') return unavailable();
    // User metadata is intentionally ignored, including forged roles/anonymous flags.
    return Object.freeze({ userId: user.id, isAnonymous: user.is_anonymous });
  };
}
