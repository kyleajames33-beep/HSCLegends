/** Staging host selectors are untrusted hints; a server snapshot is required. */
const KEY = 'hsclegends.classroom-v2.host-recovery.v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const project = /^[a-zA-Z0-9._-]{1,128}$/;
type StorageLike = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Selector = { actorId:string;projectId:string;roomId:string;joinCode:string };
function valid(value:Selector) { return uuid.test(value.actorId) && uuid.test(value.roomId) && uuid.test(value.joinCode) && project.test(value.projectId); }
export function saveHostRecovery(storage:StorageLike,value:Selector,now=Date.now()):boolean {
  if(!valid(value)||!Number.isSafeInteger(now)||now<0)return false;
  try { storage.setItem(KEY,JSON.stringify({version:1,...value,savedAt:now}));return true; } catch{return false;}
}
export function clearHostRecovery(storage:StorageLike):boolean {
  try { storage.removeItem(KEY); return true; } catch { return false; }
}
export function readHostRecovery(storage:StorageLike,actorId:string,projectId:string,now=Date.now()):{roomId:string;joinCode:string}|null {
  if(!uuid.test(actorId)||!project.test(projectId)||!Number.isSafeInteger(now)||now<0)return null;
  try {
    const raw=storage.getItem(KEY);if(!raw||raw.length>2048)return null;
    const row=JSON.parse(raw);
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='actorId,joinCode,projectId,roomId,savedAt,version'||row.version!==1||row.actorId!==actorId||row.projectId!==projectId||!valid(row)||!Number.isSafeInteger(row.savedAt)||row.savedAt<0||row.savedAt>now||now-row.savedAt>=21600000)return null;
    return {roomId:row.roomId,joinCode:row.joinCode};
  } catch { return null; }
}
