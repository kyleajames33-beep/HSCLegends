// Resolve an explicit REST target without ever accepting credentials in a URL.
// This protects against an accidental shared-project upload; it does not prove
// that a different project is safe or that question content has been reviewed.
const SHARED_HOST = 'rerfrskojieacxthfavb.supabase.co';

export function seedTarget(raw, { allowSharedProduction = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('SEED_TARGET: set SUPABASE_URL explicitly before applying');
  let url;
  try { url = new URL(raw); } catch { throw new Error('SEED_TARGET: invalid project URL'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SEED_TARGET: supply a project root URL without credentials, path, query or fragment; remote targets require HTTPS');
  }
  if (url.hostname.replace(/\.$/, '') === SHARED_HOST && !allowSharedProduction) {
    throw new Error('SEED_TARGET: the shared production project requires --allow-shared-production');
  }
  return new URL('/rest/v1/questions', url).href;
}
