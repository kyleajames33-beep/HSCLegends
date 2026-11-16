import test from 'node:test';
import assert from 'node:assert/strict';
import { createStagingClient } from '../staging-client.mjs';
const room='10000000-0000-4000-8000-000000000001', player='30000000-0000-4000-8000-000000000001', q='50000000-0000-4000-8000-000000000001';
const snapshot={room_id:room,room_version:0,state:'active',question_id:q,question_index:0,stem:'Fixture',options:['A','B'],content_revision:'fixture-v1',closes_at:'2030-01-01T00:00:00Z',receipt_id:null,accepted_choice:null,is_correct:null,correct_index:null,points:null,receipt_score_after:null,score:0};
test('staging RPC adapter sends only versioned names and expected selectors',async()=>{
 const calls=[];const receipt={receipt_id:'60000000-0000-4000-8000-000000000001',question_id:q,accepted_choice:0,is_correct:true,correct_index:0,points:100,score:100};
 const client=createStagingClient(async(name,args)=>{calls.push({name,args});return {data:[name==='classroom_v2_answer'?receipt:snapshot],error:null}});
 client.bind(room,player);assert.equal((await client.snapshot()).question.id,q);
 assert.equal((await client.answer(q,0)).points,100);
 assert.deepEqual(calls,[{name:'classroom_v2_snapshot',args:{p_room:room,p_player:player}},{name:'classroom_v2_answer',args:{p_room:room,p_player:player,p_question:q,p_choice:0}}]);
});
test('RPC error and unavailable data are visible, never invented receipts',async()=>{
 for (const response of [{data:null,error:{message:'FORBIDDEN'}},{data:null,error:null}]) {
  const client=createStagingClient(async()=>response);client.bind(room,player);
  await assert.rejects(client.snapshot(),response.error?/FORBIDDEN/:/INVALID_SERVER_RESPONSE/);
 }
});
test('host and join calls use versioned RPCs and return validated IDs',async()=>{
 const calls=[];const joinCode='80000000-0000-4000-8000-000000000001', request='70000000-0000-4000-8000-000000000001';
 const client=createStagingClient(async(name,args)=>{calls.push({name,args});return {data:name==='classroom_v2_create'?[{room_id:room,join_code:joinCode,room_version:0}]:name==='classroom_v2_join'?[{room_id:room,player_id:player,state:'lobby'}]:true,error:null}});
 assert.deepEqual(await client.createRoom(request,[{stem:'Fixture',options:['A','B'],correct_index:0,content_revision:'v1'}],20),{roomId:room,joinCode,version:0});
 assert.deepEqual(await client.join(joinCode,'Finch'),{roomId:room,playerId:player,state:'lobby'});
 assert.equal(await client.start(room,0),true);assert.equal(await client.next(room,1),true);assert.equal(await client.finish(room,2),true);
 assert.deepEqual(calls.map(c=>c.name),['classroom_v2_create','classroom_v2_join','classroom_v2_start','classroom_v2_next','classroom_v2_finish']);
});
test('late host action or join cannot update a replaced auth context',async()=>{
 let release;const client=createStagingClient(()=>new Promise(resolve=>{release=resolve}));
 const pending=client.join('80000000-0000-4000-8000-000000000001','Finch');
 client.dispose();release({data:[{room_id:room,player_id:player,state:'lobby'}],error:null});assert.equal(await pending,null);
});
test('a newer join or host command supersedes older in-flight callbacks',async()=>{
 const pending=[];const client=createStagingClient(()=>new Promise(resolve=>pending.push(resolve)));
 const code='80000000-0000-4000-8000-000000000001';
 const first=client.join(code,'First'),second=client.join(code,'Second');
 pending[1]({data:[{room_id:room,player_id:player,state:'lobby'}],error:null});assert.equal((await second).playerId,player);
 pending[0]({data:null,error:{message:'stale failure'}});assert.equal(await first,null);
 const old=client.start(room,0), fresh=client.next(room,1);
 pending[3]({data:true,error:null});assert.equal(await fresh,true);
 pending[2]({data:false,error:null});assert.equal(await old,null);
});
test('host snapshots reject stale reads and do not expose extra server fields',async()=>{
 const pending=[];const client=createStagingClient(()=>new Promise(resolve=>pending.push(resolve)));
 const base={room_id:room,room_version:2,state:'lobby',question_index:null,question_total:2,stem:null,options:null,opens_at:null,closes_at:null,server_now:'2030-01-01T00:00:00Z',answered:0,players:[{alias:'Finch',score:0,actor:'must not escape'}]};
 const old=client.hostSnapshot(room), fresh=client.hostSnapshot(room);
 pending[1]({data:[{...base,room_version:3}],error:null});const result=await fresh;assert.equal(result.version,3);assert.deepEqual(result.players,[{alias:'Finch',score:0}]);
 pending[0]({data:[base],error:null});assert.equal(await old,null);
 const regression=client.hostSnapshot(room);pending[2]({data:[base],error:null});assert.equal(await regression,null);
});
