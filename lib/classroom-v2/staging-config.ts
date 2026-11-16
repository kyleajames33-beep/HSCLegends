/** Server-side fail-closed configuration for the isolated classroom lab. */
export type StagingConfig = { url: string; publicKey: string; projectRef: string };
type Env = Record<string, string | undefined>;
const SHARED_PROJECT = 'rerfrskojieacxthfavb';

function publicKey(key: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(key)) return true;
  // Legacy anon JWTs carry a public role. Decode only to reject obvious secret
  // keys; this is not signature verification or proof of the target project.
  const parts = key.split('.');
  if (parts.length !== 3 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon'; } catch { return false; }
}
export function stagingConfig(env: Env): StagingConfig | null {
  if (env.CLASSROOM_STAGING_ENABLED !== 'true') return null;
  const ref = env.CLASSROOM_STAGING_PROJECT_REF;
  const raw = env.CLASSROOM_STAGING_URL;
  const key = env.CLASSROOM_STAGING_PUBLIC_KEY;
  if (!ref || (ref !== 'local' && !/^[a-z0-9]{20}$/.test(ref)) || ref === SHARED_PROJECT || !raw || !key || key.length > 4096 || !publicKey(key)) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const local = ref === 'local' && url.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(url.hostname) && url.port === '54321';
  const hosted = ref !== 'local' && url.protocol === 'https:' && url.hostname === `${ref}.supabase.co` && !url.port;
  if ((!local && !hosted) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    try { if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.replace(/\.$/, '') === url.hostname) return null; } catch { return null; }
  }
  return { url: url.origin, publicKey: key, projectRef: ref };
}
