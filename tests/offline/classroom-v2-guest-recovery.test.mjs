import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeClassroomV2 } from '../../lib/classroom-v2/index.ts';
import { clearGuestRecovery, readGuestRecovery, recoverGuestSession, saveGuestRecovery } from '../../lib/classroom-v2/guest-recovery.ts';

const actorId='00000000-0000-4000-8000-000000000001', roomId='00000000-0000-4000-8000-000000000002', playerId='00000000-0000-4000-8000-000000000003';
const projectId='disposable-staging-project', now=1_700_000_000_000;
const saved={actorId,projectId,roomId,playerId};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function storage() { let data=null; return { getItem:()=>data,setItem:(_key,value)=>{data=value;},removeItem:()=>{data=null;},raw:value=>{data=value;},contents:()=>data }; }
function setup() {
  const store=storage(), calls=[];let actor={actorId,generation:0}, snapshotOverride=null;
  const snapshot={room_id:roomId,room_version:1,state:'lobby',server_now:'2026-01-01T00:00:00Z',question_id:null,question_index:null,stem:null,options:null,content_revision:null,opens_at:null,closes_at:null,score:0,receipt_id:null,accepted_choice:null,is_correct:null,correct_index:null,points:null,receipt_score_after:null};
  const currentActor=()=>actor;
  const openClient=async captured=>initializeClassroomV2({enabled:true,target:'staging',ownerId:captured.actorId,isCurrentOwner:id=>currentActor()?.actorId===id,authGeneration:()=>currentActor()?.generation ?? -1},{rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='classroom_v2_capabilities')return {data:[{contract_version:1,environment:'staging-only'}],error:null};
    if(snapshotOverride)return snapshotOverride();
    return {data:[snapshot],error:null};
  }});
  const recover=()=>recoverGuestSession({storage:store,projectId,currentActor,openClient,now});
  return {store,calls,recover,currentActor,openClient,setActor:a=>{actor=a;},setSnapshot:f=>{snapshotOverride=f;}};
}

test('only bounded actor- and project-matching selectors survive; tokens are never persisted',()=>{
 const s=storage();assert.equal(saveGuestRecovery(s,{...saved,access_token:'secret'},now),true);
 assert.doesNotMatch(s.contents(),/secret|token/);
 assert.deepEqual(readGuestRecovery(s,actorId,projectId,now),{...saved,savedAt:now});
 assert.equal(readGuestRecovery(s,playerId,projectId,now),null);
 assert.equal(readGuestRecovery(s,actorId,'another-project',now),null);
 assert.equal(readGuestRecovery(s,actorId,projectId,now-1),null);
 assert.equal(readGuestRecovery(s,actorId,projectId,now+6*60*60*1000),null);
 assert.equal(clearGuestRecovery(s),true);assert.equal(readGuestRecovery(s,actorId,projectId,now),null);
});

test('corrupt, forged and inaccessible storage is ignored without network requests',async()=>{
 const h=setup();h.store.raw('{bad json');assert.equal((await h.recover()).status,'missing');
 h.store.raw(JSON.stringify({...saved,version:1,savedAt:now,token:'x'}));assert.equal((await h.recover()).status,'missing');
 h.store.raw('x'.repeat(2050));assert.equal((await h.recover()).status,'missing');assert.equal(h.calls.length,0);
 const unavailable={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};
 assert.equal(saveGuestRecovery(unavailable,saved,now),false);assert.equal(readGuestRecovery(unavailable,actorId,projectId,now),null);assert.equal(clearGuestRecovery(unavailable),false);
});

test('restoration uses a fresh owner-bound client and a server snapshot',async()=>{
 const h=setup();saveGuestRecovery(h.store,saved,now);
 const result=await h.recover();assert.equal(result.status,'recovered');assert.equal(result.snapshot.roomId,roomId);
 assert.deepEqual(h.calls.map(call=>call.name),['classroom_v2_capabilities','classroom_v2_snapshot']);
 assert.deepEqual(h.calls[1].args,{p_room:roomId,p_player:playerId});result.client.dispose();
});

test('a foreign or rejected server response never produces a recovered session',async()=>{
 const h=setup();saveGuestRecovery(h.store,saved,now);
 h.setSnapshot(()=>({data:null,error:{message:'denied'}}));assert.equal((await h.recover()).status,'failed');
 h.setSnapshot(()=>({data:[{room_id:playerId}],error:null}));assert.equal((await h.recover()).status,'failed');
 assert.ok(h.store.contents(),'transient errors do not erase a recoverable hint');
});

test('identity switching away and back while the snapshot is pending cannot recover the old session',async()=>{
 const h=setup(),pending=defer();saveGuestRecovery(h.store,saved,now);h.setSnapshot(()=>pending.promise);
 const recovery=h.recover();await new Promise(resolve=>setImmediate(resolve));
 h.setActor({actorId,generation:1});pending.resolve({data:null,error:{message:'late'}});
 assert.equal((await recovery).status,'obsolete');
});

test('a changed actor or project never even opens a recovery client',async()=>{
 const h=setup();saveGuestRecovery(h.store,saved,now);h.setActor({actorId:playerId,generation:0});
 assert.equal((await h.recover()).status,'missing');assert.equal(h.calls.length,0);
 h.setActor(null);assert.equal((await h.recover()).status,'unavailable');assert.equal(h.calls.length,0);
});
