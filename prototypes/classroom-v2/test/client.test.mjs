import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabClient } from '../client.ts';
const room='10000000-0000-4000-8000-000000000001', player='30000000-0000-4000-8000-000000000001', q1='50000000-0000-4000-8000-000000000001', q2='50000000-0000-4000-8000-000000000002', receipt='60000000-0000-4000-8000-000000000001';
const row=(question=q1)=>({room_id:room,room_version:0,state:'active',question_id:question,question_index:0,stem:'Fixture',options:['A','B'],content_revision:'fixture-v1',closes_at:'2030-01-01T00:00:00Z',receipt_id:null,accepted_choice:null,is_correct:null,correct_index:null,points:null,receipt_score_after:null,score:0});

test('stale answer cannot apply after a newer question snapshot',async()=>{
 let release;const client=createLabClient((sql)=>sql.includes('snapshot')?Promise.resolve({rows:[row(q1)]}):new Promise(resolve=>{release=resolve}));
 client.bind(room,player);await client.snapshot();const pending=client.answer(q1,0);
 client.bind(room,player);const next=await client.snapshot();assert.equal(next.question.id,q1);
 release({rows:[{receipt_id:receipt,question_id:q1,accepted_choice:0,is_correct:true,correct_index:0,points:100,score:100}]});
 assert.equal(await pending,null);
});

test('newest snapshot owns state; malformed foreign or contradictory receipts are rejected',async()=>{
 const pending=[];const client=createLabClient(()=>new Promise(resolve=>pending.push(resolve)));
 client.bind(room,player);const older=client.snapshot(),newer=client.snapshot();
 pending[1]({rows:[row(q2)]});assert.equal((await newer).question.id,q2);
 pending[0]({rows:[row(q1)]});assert.equal(await older,null);
 const bad=client.snapshot();pending[2]({rows:[{...row(q1),receipt_id:receipt,accepted_choice:0,is_correct:false,correct_index:0,points:100,receipt_score_after:100}]});
 await assert.rejects(bad,/INVALID_RECEIPT/);
 const foreign=client.snapshot();pending[3]({rows:[{...row(q1),room_id:'10000000-0000-4000-8000-000000000002'}]});
 await assert.rejects(foreign,/INVALID_SERVER_RESPONSE/);
});

test('different question or disposed connection invalidates late answer',async()=>{
 const pending=[];let current=q1;
 const client=createLabClient(sql=>sql.includes('snapshot')?Promise.resolve({rows:[row(current)]}):new Promise(resolve=>pending.push(resolve)));
 client.bind(room,player);await client.snapshot();const answer=client.answer(q1,0);
 current=q2;await client.snapshot();pending[0]({rows:[{receipt_id:receipt,question_id:q1,accepted_choice:0,is_correct:true,correct_index:0,points:100,score:100}]});
 assert.equal(await answer,null);await assert.rejects(client.answer(q1,0),/STALE_QUESTION/);
 const second=client.answer(q2,1);client.dispose();pending[1]({rows:[{receipt_id:receipt,question_id:q2,accepted_choice:1,is_correct:true,correct_index:1,points:100,score:100}]});assert.equal(await second,null);
});

test('lobby projection is explicit and a lower server version cannot replace a newer one',async()=>{
 let response={...row(),state:'lobby',room_version:0,question_id:null,question_index:null,stem:null,options:null,content_revision:null,closes_at:null};
 const client=createLabClient(async()=>({rows:[response]}));client.bind(room,player);
 const lobby=await client.snapshot();assert.equal(lobby.state,'lobby');assert.equal(lobby.question,null);
 response={...row(q2),room_version:3};assert.equal((await client.snapshot()).question.id,q2);
 response={...row(q1),room_version:2};assert.equal(await client.snapshot(),null);
 await assert.rejects(client.answer(q2,2),/INVALID_CHOICE/);
});
