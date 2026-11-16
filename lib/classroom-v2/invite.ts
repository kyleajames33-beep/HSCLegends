/** Staging-only invite links carry a room selector, not an identity credential. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function stagingCodeFromSearch(search:string):string|null {
  if(typeof search!=='string'||search.length>4096)return null;
  try {
    const params=new URLSearchParams(search), values=params.getAll('join');
    return values.length===1 && uuid.test(values[0]) ? values[0].toLowerCase() : null;
  } catch {return null;}
}
/** A pasted link must target this application and contain one valid code. */
export function normalizeStagingJoin(value:string,origin:string):string|null {
  if(typeof value!=='string'||value.length>4096)return null;
  const trimmed=value.trim();
  if(uuid.test(trimmed))return trimmed.toLowerCase();
  try {
    const url=new URL(trimmed), base=new URL(origin);
    if((base.protocol!=='http:'&&base.protocol!=='https:')||base.origin!==origin||url.origin!==base.origin||url.username||url.password||url.pathname!=='/classroom-staging'||url.hash)return null;
    return stagingCodeFromSearch(url.search);
  } catch{return null;}
}
export function makeStagingInvite(origin:string,code:string):string|null {
  if(typeof code!=='string'||!uuid.test(code))return null;
  try {
    const base=new URL(origin);
    if((base.protocol!=='http:'&&base.protocol!=='https:')||base.username||base.password||base.origin!==origin)return null;
    const link=new URL('/classroom-staging',base);link.searchParams.set('join',code.toLowerCase());return link.href;
  } catch{return null;}
}
