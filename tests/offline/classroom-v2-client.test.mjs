import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeClassroomV2, prepareCreateRequest } from '../../lib/classroom-v2/index.ts';

const host='00000000-0000-4000-8000-000000000001', room='00000000-0000-4000-8000-000000000002', player='00000000-0000-4000-8000-000000000003', question='00000000-0000-4000-8000-000000000004', receipt='00000000-0000-4000-8000-000000000005', requestId='00000000-0000-4000-8000-000000000006';
const capability={data:[{contract_version:1,environment:'staging-only'}],error:null};
const config=(extra={})=>({enabled:true,target:'staging',ownerId:host,isCurrentOwner:()=>true,authGeneration:()=>0,...extra});
const row=(version=1)=>({room_id:room,room_version:version,state:'active',server_now:'2026-01-01T00:00:01Z',question_id:question,question_index:0,stem:'Question?',options:['A','B'],content_revision:'v1',opens_at:'2026-01-01T00:00:00Z',closes_at:'2026-01-01T00:00:10Z',score:0,receipt_id:null,accepted_choice:null,is_correct:null,correct_index:null,points:null,receipt_score_after:null});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const client=async (handler, cfg=config())=>{const result=await initializeClassroomV2(cfg,{rpc:(name,args)=>name==='classroom_v2_capabilities'?Promise.resolve(capability):handler(name,args)});assert.equal(result.status,'available');return result.client;};

test('disabled and invalid setup do not probe; capability must match and owner must persist',async()=>{
 let calls=0;const transport={rpc:async()=>{calls++;return capability;}};
 assert.equal((await initializeClassroomV2({},transport)).status,'disabled');
 assert.equal((await initializeClassroomV2({enabled:true},transport)).reason,'configuration');assert.equal(calls,0);
 assert.equal((await initializeClassroomV2(config(),{rpc:async()=>({data:[{contract_version:1,environment:'production'}],error:null})})).reason,'unsupported');
 let generation=0;const pending=defer();const start=initializeClassroomV2(config({authGeneration:()=>generation}),{rpc:()=>pending.promise});generation++;pending.resolve(capability);assert.equal((await start).reason,'configuration');
});

test('create retries preserve the exact caller request and copied payload',async()=>{
 const calls=[];const c=await client(async(name,args)=>{calls.push({name,args:JSON.parse(JSON.stringify(args))});return {data:[{room_id:room,join_code:player,room_version:0}],error:null};});
 const draft=[{stem:'Original',options:['A','B'],correct_index:1,content_revision:'v1'}];const prepared=prepareCreateRequest(requestId,draft,30);draft[0].options[1]='changed';
 assert.ok(Object.isFrozen(prepared.questions[0].options));await c.createRoom(prepared);await c.createRoom(prepared);
 assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].args.p_request_id,requestId);assert.equal(calls[0].args.p_questions[0].options[1],'B');
});

test('receipt retries preserve accepted choice and malformed or premature receipt data is rejected',async()=>{
 let snapshot=row();const c=await client(async(name)=>name==='classroom_v2_snapshot'?{data:[snapshot],error:null}:{data:[{question_id:question,receipt_id:receipt,accepted_choice:0,correct_index:0,is_correct:true,points:100,score:100}],error:null});
 c.bindStudent(room,player);await c.snapshot();assert.equal((await c.answer(question,1)).choice,0);
 snapshot={...row(2),correct_index:0};await assert.rejects(c.snapshot(),/INVALID_RECEIPT/);
 snapshot={...row(3),closes_at:'2025-01-01T00:00:00Z'};await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);
});

test('answer deadline errors are explicit while arbitrary backend messages remain hidden',async()=>{
 let message='OUTSIDE_WINDOW';
 const c=await client(async name=>name==='classroom_v2_snapshot'?{data:[row()],error:null}:{data:null,error:{message}});c.bindStudent(room,player);await c.snapshot();
 await assert.rejects(c.answer(question,0),/OUTSIDE_WINDOW/);
 message='STALE_QUESTION';await assert.rejects(c.answer(question,0),/STALE_QUESTION/);
 message='private backend details';await assert.rejects(c.answer(question,0),error=>error.message==='RPC_FAILED');
});

test('student explanations require a valid own receipt and reject malformed text',async()=>{
 let snapshot={...row(),answer_explanation:'Must stay hidden'};
 const c=await client(async()=>({data:[snapshot],error:null}));c.bindStudent(room,player);
 await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);
 snapshot={...row(),score:100,receipt_id:receipt,accepted_choice:0,is_correct:true,correct_index:0,points:100,receipt_score_after:100,answer_explanation:'A correct explanation.'};
 assert.equal((await c.snapshot()).explanation,'A correct explanation.');
 for (const value of ['', ' '.repeat(3), {text:'invalid'}, 'x'.repeat(2001)]) {
  snapshot={...snapshot,answer_explanation:value};await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);
 }
 snapshot={...snapshot,answer_explanation:null};assert.equal((await c.snapshot()).explanation,null);
});

test('old answers, reads and auth generations cannot update a newer context',async()=>{
 const answer=defer(),read=defer();let reads=0,generation=0;
 const c=await client((name)=>{if(name==='classroom_v2_answer')return answer.promise;if(++reads===1)return Promise.resolve({data:[row()],error:null});return read.promise;},config({authGeneration:()=>generation}));
 c.bindStudent(room,player);await c.snapshot();const pendingAnswer=c.answer(question,0);const pendingRead=c.snapshot();c.bindStudent(room,player);
 answer.resolve({data:[{question_id:question,receipt_id:receipt,accepted_choice:0,correct_index:0,is_correct:true,points:100,score:100}],error:null});read.resolve({data:[row()],error:null});
 assert.equal(await pendingAnswer,null);assert.equal(await pendingRead,null);generation++;
 await assert.rejects(c.snapshot(),/CLIENT_DISPOSED/);
});

test('null is an invalid response, and stale snapshot versions are ignored',async()=>{
 let payload=[row(4)];const c=await client(async()=>({data:payload,error:null}));c.bindStudent(room,player);assert.equal((await c.snapshot()).version,4);payload=[row(3)];assert.equal(await c.snapshot(),null);payload=null;await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);
});

test('student progress uses a bounded server count and tolerates older snapshots',async()=>{
 let value=row();const c=await client(async()=>({data:[value],error:null}));c.bindStudent(room,player);
 assert.equal((await c.snapshot()).questionTotal,null);
 value={...row(),question_total:2};assert.equal((await c.snapshot()).questionTotal,2);
 for(const total of [0,21,1.5,null]) {value={...row(),question_total:total};await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);}
 value={...row(),question_index:2,question_total:2};await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);
});

test('final placing is shown only for a valid completed server snapshot',async()=>{
 let value=row();const c=await client(async()=>({data:[value],error:null}));c.bindStudent(room,player);
 assert.equal((await c.snapshot()).finalRank,null);
 value={...row(),final_rank:1};await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);
 value={...row(),state:'complete',final_rank:0};await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);
 value={...row(),state:'complete',final_rank:2};assert.equal((await c.snapshot()).finalRank,2);
 value={...row(),state:'complete',question_id:null,question_index:null,stem:null,options:null,content_revision:null,opens_at:null,closes_at:null,final_rank:1};assert.equal((await c.snapshot()).finalRank,null);
});

test('post-game review accepts only well-formed, ordered own answer receipts',async()=>{
 let value=row();const c=await client(async()=>({data:[value],error:null}));c.bindStudent(room,player);
 assert.equal((await c.snapshot()).review,null);
 const item={question_id:question,index:0,stem:'Question?',options:['A','B'],choice:1,correct_index:0,correct:false,points:0,explanation:'Because.'};
 value={...row(),answer_review:[item]};await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);
 value={...row(),state:'complete',question_total:1,answer_review:[item]};const review=(await c.snapshot()).review;
 assert.equal(review[0].choice,1);assert.equal(review[0].explanation,'Because.');
 for(const bad of [[{...item,correct:true}],[{...item,choice:2}],[item,item],[{...item,explanation:''}]]){value={...row(),state:'complete',question_total:1,answer_review:bad};await assert.rejects(c.snapshot(),/INVALID_RESPONSE/);}
 value={...row(),state:'complete',answer_review:[]};assert.deepEqual((await c.snapshot()).review,[]);
});

test('host projections omit private fields and newer reads supersede older ones',async()=>{
 const calls=[];const c=await client(()=>{const call=defer();calls.push(call);return call.promise;});
 const base={room_id:room,room_version:2,state:'lobby',question_index:null,question_total:1,stem:null,options:null,opens_at:null,closes_at:null,server_now:'2026-01-01T00:00:00Z',answered:0,players:[{alias:'Student',score:0,actor:'private'}]};
 const old=c.hostSnapshot(room),fresh=c.hostSnapshot(room);calls[1].resolve({data:[{...base,room_version:3}],error:null});assert.deepEqual((await fresh).players,[{alias:'Student',score:0}]);calls[0].resolve({data:[base],error:null});assert.equal(await old,null);
});

test('host room recovery accepts a validated server join code and supports older snapshots',async()=>{
 let hostRow={room_id:room,room_version:0,state:'lobby',question_index:null,question_total:1,stem:null,options:null,opens_at:null,closes_at:null,server_now:'2026-01-01T00:00:00Z',answered:0,players:[]};
 const c=await client(async()=>({data:[hostRow],error:null}));
 assert.equal((await c.hostSnapshot(room)).joinCode,null);
 hostRow={...hostRow,join_code:player};assert.equal((await c.hostSnapshot(room)).joinCode,player);
 hostRow={...hostRow,join_code:'malformed'};await assert.rejects(c.hostSnapshot(room),/INVALID_RESPONSE/);
});

test('host question report only accepts consistent completed aggregate counts',async()=>{
 const base={room_id:room,room_version:2,state:'complete',question_index:null,question_total:1,stem:null,options:null,opens_at:null,closes_at:null,server_now:'2026-01-01T00:00:00Z',answered:0,players:[{alias:'Student',score:100}]};
 let value=base;const c=await client(async()=>({data:[value],error:null}));
 assert.equal((await c.hostSnapshot(room)).questionReport,null);
 const report=[{index:0,stem:'Fixture',opened:true,responses:1,correct:1}];
 value={...base,question_report:report};assert.deepEqual((await c.hostSnapshot(room)).questionReport,report);
 for(const bad of [[{...report[0],correct:2}],[{...report[0],responses:2}],[{...report[0],opened:false}],[]]){value={...base,question_report:bad};await assert.rejects(c.hostSnapshot(room),/INVALID_RESPONSE/);}
 value={...base,state:'lobby',question_report:report};await assert.rejects(c.hostSnapshot(room),/INVALID_RESPONSE/);
});

test('question change makes pending answer obsolete and rejects forged receipt points',async()=>{
 const pending=defer();let current=row();const c=await client(name=>name==='classroom_v2_answer'?pending.promise:Promise.resolve({data:[current],error:null}));c.bindStudent(room,player);await c.snapshot();const answer=c.answer(question,0);
 current={...row(2),question_id:requestId,question_index:1};await c.snapshot();pending.resolve({data:[{question_id:question,receipt_id:receipt,accepted_choice:0,correct_index:0,is_correct:true,points:100,score:100}],error:null});assert.equal(await answer,null);
 const invalid=await client(async name=>name==='classroom_v2_snapshot'?{data:[row()],error:null}:{data:[{question_id:question,receipt_id:receipt,accepted_choice:0,correct_index:0,is_correct:true,points:999,score:999}],error:null});invalid.bindStudent(room,player);await invalid.snapshot();await assert.rejects(invalid.answer(question,0),/INVALID_RECEIPT/);
});

test('switching host rooms invalidates old commands and rejects retained room callbacks',async()=>{
 const otherRoom='00000000-0000-4000-8000-000000000007', pending=defer(), calls=[];
 const hostRow=(id,version)=>({room_id:id,room_version:version,state:'lobby',question_index:null,question_total:1,stem:null,options:null,opens_at:null,closes_at:null,server_now:'2026-01-01T00:00:00Z',answered:0,players:[]});
 const c=await client((name,args)=>{calls.push({name,args});return name==='classroom_v2_start'?pending.promise:Promise.resolve({data:[hostRow(args.p_room,0)],error:null});});
 await c.hostSnapshot(room);const old=c.start(room,0);await c.hostSnapshot(otherRoom);
 pending.resolve({data:true,error:null});assert.equal(await old,null);
 await assert.rejects(c.start(room,0),/STALE_HOST_CONTEXT/);
 assert.equal(calls.filter(call=>call.name==='classroom_v2_start').length,1);
});

test('newer host snapshot supersedes a command and old version cannot be submitted',async()=>{
 const pending=defer();let version=0, commands=0;
 const c=await client((name)=>{if(name==='classroom_v2_start'){commands++;return pending.promise;}return Promise.resolve({data:[{room_id:room,room_version:version,state:'lobby',question_index:null,question_total:1,stem:null,options:null,opens_at:null,closes_at:null,server_now:'2026-01-01T00:00:00Z',answered:0,players:[]}],error:null});});
 await c.hostSnapshot(room);const command=c.start(room,0);version=1;await c.hostSnapshot(room);
 pending.resolve({data:true,error:null});assert.equal(await command,null);
 await assert.rejects(c.start(room,0),/STALE_HOST_CONTEXT/);assert.equal(commands,1);
});

test('switching host rooms also invalidates pending room creation',async()=>{
 const pending=defer();const otherRoom='00000000-0000-4000-8000-000000000007';
 const c=await client((name,args)=>name==='classroom_v2_create'?pending.promise:Promise.resolve({data:[{room_id:args.p_room,room_version:0,state:'lobby',question_index:null,question_total:1,stem:null,options:null,opens_at:null,closes_at:null,server_now:'2026-01-01T00:00:00Z',answered:0,players:[]}],error:null}));
 const draft=prepareCreateRequest(requestId,[{stem:'Question',options:['A','B'],correct_index:0,content_revision:'v1'}],30);
 const creating=c.createRoom(draft);await c.hostSnapshot(otherRoom);pending.resolve({data:[{room_id:room,join_code:player,room_version:0}],error:null});
 assert.equal(await creating,null);await assert.rejects(c.start(room,0),/STALE_HOST_CONTEXT/);
});

test('joining a new room invalidates the prior student connection immediately',async()=>{
 const pending=defer(), join=defer();let answers=0;
 const c=await client(name=>{if(name==='classroom_v2_snapshot')return Promise.resolve({data:[row()],error:null});if(name==='classroom_v2_answer'){answers++;return pending.promise;}return join.promise;});
 c.bindStudent(room,player);await c.snapshot();const oldAnswer=c.answer(question,0);const joining=c.join(requestId,'Student');
 await assert.rejects(c.answer(question,0),/NO_CONNECTION/);
 pending.resolve({data:[{question_id:question,receipt_id:receipt,accepted_choice:0,correct_index:0,is_correct:true,points:100,score:100}],error:null});
 assert.equal(await oldAnswer,null);assert.equal(answers,1);
 join.resolve({data:[{room_id:room,player_id:player,state:'lobby'}],error:null});assert.equal((await joining).playerId,player);
});
