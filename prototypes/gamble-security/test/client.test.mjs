import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGambleClient } from '../client.mjs';

test('browser adapter scopes operations and sanitizes result fields',async()=>{
  const calls=[];
  const replies={snapshot:{round:1,phase:'answer',deadline:'2030-01-01T00:00:00Z',question:{stem:'Which?',options:['A','B'],correct_index:1},own_answer:null,own_decision:null,result:null,secret:'not exposed'},submit:[{choice:1,correct:true,stake:10}],decide:'share',reveal:[{decision_a:'share',decision_b:'share',payout_a:10,payout_b:10}]};
  const client=createGambleClient(async(name,args)=>{calls.push({name,args});return {data:replies[name],error:null}});
  assert.deepEqual(await client.snapshot('room','player'),{round:1,phase:'answer',deadline:'2030-01-01T00:00:00Z',question:{stem:'Which?',options:['A','B']},own_answer:null,own_decision:null,result:null});
  assert.deepEqual(await client.submit('room','player',1,1),{choice:1,correct:true,stake:10});
  assert.equal(await client.decide('room','player',1,'share'),'share');
  assert.deepEqual(await client.reveal('room','player',1),{decision_a:'share',decision_b:'share',payout_a:10,payout_b:10});
  assert.deepEqual(calls.map(x=>x.name),['snapshot','submit','decide','reveal']);
  assert.deepEqual(calls[1].args,{p_room:'room',p_player:'player',p_round:1,p_choice:1});
  assert.equal(Object.keys(calls[2].args).some(k=>/partner|user|owner/.test(k)),false);
});

test('browser adapter fails closed on invalid requests, responses and server errors',async()=>{
  let count=0;
  const client=createGambleClient(async()=>{count++;return {data:null,error:{message:'not authorized'}}});
  await assert.rejects(client.submit('room','player',1,-1),/Invalid game response/);
  await assert.rejects(client.decide('room','player',1,'other'),/Invalid game response/);
  assert.equal(count,0);
  await assert.rejects(client.snapshot('room','player'),/not authorized/);
  const malformed=createGambleClient(async()=>({data:{round:1,phase:'answer',deadline:'not-a-date'},error:null}));
  await assert.rejects(malformed.snapshot('room','player'),/Invalid game response/);
});
