// Safety boundary for the opt-in disposable local Supabase smoke test.
export const LOCAL_URL = 'http://127.0.0.1:54321';
export const LOCAL_IPV6_URL = 'http://[::1]:54321';
export const LAB_PROJECT = 'hsc-classroom-local-lab';
export const LAB_WORKDIR = '/tmp/hsc-classroom-local-lab';
export const DB_CONTAINER = `supabase_db_${LAB_PROJECT}`;
export const API_CONTAINER = `supabase_kong_${LAB_PROJECT}`;
function publicKey(key) {
  if(typeof key !== 'string') return false;
  if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    const parts=key.split('.');
    return parts.length===3 && JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')).role==='anon';
  } catch { return false; }
}
export function validateLocalOptions(env) {
  if (env.HSC_LAB_ALLOW_DISPOSABLE !== '1' || ![LOCAL_URL,LOCAL_IPV6_URL].includes(env.HSC_LAB_LOCAL_URL) || !publicKey(env.HSC_LAB_ANON_KEY)) throw new Error('LOCAL_LAB_CONFIGURATION_REQUIRED');
  return { url: env.HSC_LAB_LOCAL_URL, key: env.HSC_LAB_ANON_KEY };
}
export function validateContainer(container, expectedName, imagePrefix) {
  const labels=container?.Config?.Labels;
  if (container?.Name !== `/${expectedName}` || container?.State?.Running !== true || !container?.Config?.Image?.startsWith(imagePrefix) || labels?.['com.supabase.cli.project'] !== LAB_PROJECT || labels?.['com.supabase.cli.workdir'] !== LAB_WORKDIR || labels?.['com.docker.compose.project'] !== LAB_PROJECT) throw new Error('LOCAL_LAB_CONTAINER_MISMATCH');
  const bindings=Object.values(container?.NetworkSettings?.Ports ?? {}).flatMap(value=>Array.isArray(value)?value:[]);
  if (bindings.some(port=>!['127.0.0.1','::1'].includes(port.HostIp))) throw new Error('LOCAL_LAB_CONTAINER_MISMATCH');
}
export function validateGatewayPort(container, endpoint = LOCAL_URL) {
  if (![LOCAL_URL,LOCAL_IPV6_URL].includes(endpoint)) throw new Error('LOCAL_LAB_GATEWAY_MISMATCH');
  const ports=container?.NetworkSettings?.Ports?.['8000/tcp'];
  const address=endpoint===LOCAL_URL ? '127.0.0.1' : '::1';
  const allBindings=Object.values(container?.NetworkSettings?.Ports ?? {}).flatMap(value=>Array.isArray(value)?value:[]);
  if (!Array.isArray(ports) || !ports.some(port=>port.HostPort === '54321' && port.HostIp===address) || allBindings.some(port=>!['127.0.0.1','::1'].includes(port.HostIp))) throw new Error('LOCAL_LAB_GATEWAY_MISMATCH');
}
export function validateFetchTarget(input, endpoint = LOCAL_URL) {
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
  let url;try { url=new URL(raw); } catch { throw new Error('LOCAL_LAB_NETWORK_BLOCKED'); }
  if (![LOCAL_URL,LOCAL_IPV6_URL].includes(endpoint) || url.origin!==endpoint || url.username || url.password) throw new Error('LOCAL_LAB_NETWORK_BLOCKED');
  return url;
}
