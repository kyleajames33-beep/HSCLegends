/** Session-scoped staging auth storage with a non-persistent fallback. */
export type AuthStorage = Pick<Storage, 'getItem'|'setItem'|'removeItem'>;
export function stagingAuthStorage(getStorage:()=>AuthStorage, probeId:()=>string):{storage:AuthStorage;temporary:boolean} {
  try {
    const storage=getStorage(), id=probeId();
    if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('invalid probe');
    const key=`hsc-classroom-storage-probe-${id}`;
    if(storage.getItem(key)!==null)throw Error('probe collision');
    storage.setItem(key,'1');
    if(storage.getItem(key)!=='1')throw Error('storage unavailable');
    storage.removeItem(key);
    return {storage,temporary:false};
  } catch {
    const values=new Map<string,string>();
    return {temporary:true,storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,String(value));},removeItem:key=>{values.delete(key);}}};
  }
}
