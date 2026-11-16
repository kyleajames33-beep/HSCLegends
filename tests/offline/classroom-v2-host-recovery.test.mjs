import test from 'node:test';
import assert from 'node:assert/strict';
import { clearHostRecovery, readHostRecovery, saveHostRecovery } from '../../lib/classroom-v2/host-recovery.ts';
const values = new Map(), storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
const actor='00000000-0000-4000-8000-000000000001', room='00000000-0000-4000-8000-000000000002', code='00000000-0000-4000-8000-000000000003';
test('host recovery stores scoped selectors only and expires after six hours',()=>{
  assert.equal(saveHostRecovery(storage,{actorId:actor,projectId:'local',roomId:room,joinCode:code},1000),true);
  assert.deepEqual(readHostRecovery(storage,actor,'local',1001),{roomId:room,joinCode:code});
  assert.equal(readHostRecovery(storage,actor,'other',1001),null);
  assert.equal(readHostRecovery(storage,actor,'local',1000+21600000),null);
  assert.equal(readHostRecovery(storage,actor,'local',999),null);
  assert.equal(saveHostRecovery(storage,{actorId:actor,projectId:'local',roomId:'invalid',joinCode:code},1000),false);
  assert.equal(clearHostRecovery(storage),true);
  assert.equal(readHostRecovery(storage,actor,'local',1001),null);
});
test('malformed and inaccessible storage does not restore a host room',()=>{
  values.set('hsclegends.classroom-v2.host-recovery.v1','{"version":1,"token":"bad"}');
  assert.equal(readHostRecovery(storage,actor,'local',1001),null);
  assert.equal(readHostRecovery({getItem(){throw Error('denied');}},actor,'local',1001),null);
});
