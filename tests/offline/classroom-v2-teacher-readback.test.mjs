import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeClassroomV2 } from '../../lib/classroom-v2/index.ts';

const actor='00000000-0000-4000-8000-000000000001', room='00000000-0000-4000-8000-000000000002', other='00000000-0000-4000-8000-000000000003', question='00000000-0000-4000-8000-000000000004';
const config={enabled:true,target:'staging',ownerId:actor,isCurrentOwner:()=>true,authGeneration:()=>0};
const lobby=id=>({room_id:id,room_version:0,state:'lobby',question_index:null,question_total:1,stem:null,options:null,opens_at:null,closes_at:null,server_now:'2026-01-01T00:00:00Z',answered:0,players:[]});
const item=()=>({room_id:room,question_id:question,question_index:0,stem:'Fixture',options:['A','B'],correct_index:1,content_revision:'v1',teacher_draft:{id:'one',explanation:'Explanation',subject:'chemistry',year:12,module:'m',syllabusVersion:'2017',source:'Teacher',reviewStatus:'unreviewed'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
async function createClient(handler, readback=1) {
  const initialized=await initializeClassroomV2(config,{rpc:(name,args)=>name==='classroom_v2_capabilities'?Promise.resolve({data:[{contract_version:1,environment:'staging-only',teacher_readback_version:readback}],error:null}):handler(name,args)});
  assert.equal(initialized.status,'available');return initialized.client;
}

test('teacher readback requires capability and current host binding; validates returned content',async()=>{
  let payload=[item()], reads=0;
  const c=await createClient(async(name,args)=>name==='classroom_v2_host_snapshot'?{data:[lobby(args.p_room)],error:null}:(reads++,{data:payload,error:null}));
  await assert.rejects(c.teacherQuestions(room),/STALE_HOST_CONTEXT/);assert.equal(reads,0);
  await c.hostSnapshot(room);const result=await c.teacherQuestions(room);
  assert.equal(result[0].correctIndex,1);assert.equal(result[0].teacherDraft.explanation,'Explanation');
  for(const invalid of [[{...item(),room_id:other}],[{...item(),teacher_draft:{...item().teacher_draft,reviewStatus:'approved'}}],[{...item(),correct_index:3}],[],[{...item(),question_index:1}]]) {
    payload=invalid;await assert.rejects(c.teacherQuestions(room),/INVALID_RESPONSE/);
  }
  const unsupported=await createClient(async()=>{throw Error('unexpected');},0);
  await assert.rejects(unsupported.teacherQuestions(room),/TEACHER_READBACK_UNSUPPORTED/);
});

test('switching away and back, a newer read or disposal suppress stale teacher keys',async()=>{
  const pending=deferred();let reads=0;
  const c=await createClient((name,args)=>name==='classroom_v2_host_snapshot'?Promise.resolve({data:[lobby(args.p_room)],error:null}):(++reads===1?pending.promise:Promise.resolve({data:[item()],error:null})));
  await c.hostSnapshot(room);const old=c.teacherQuestions(room);await c.hostSnapshot(other);await c.hostSnapshot(room);
  pending.resolve({data:[item()],error:null});assert.equal(await old,null);
  assert.equal((await c.teacherQuestions(room))[0].id,question);
  c.dispose();await assert.rejects(c.teacherQuestions(room),/CLIENT_DISPOSED/);
});
