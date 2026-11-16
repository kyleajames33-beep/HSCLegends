import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createLabClient } from '../client.ts';
const I={room:'10000000-0000-4000-8000-000000000001',room2:'10000000-0000-4000-8000-000000000002',host:'20000000-0000-4000-8000-000000000001',foreign:'20000000-0000-4000-8000-000000000002',a:'30000000-0000-4000-8000-000000000001',b:'30000000-0000-4000-8000-000000000002',actorA:'40000000-0000-4000-8000-000000000001',actorB:'40000000-0000-4000-8000-000000000002',q:'50000000-0000-4000-8000-000000000001',q2:'50000000-0000-4000-8000-000000000002'};
async function fixture(){const db=new PGlite();await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));const {room,room2,host,foreign,a,b,actorA,actorB,q,q2}=I;
 await db.query("insert into lab_private.rooms(id,host_actor,state,active_index) values ($1,$2,'active',0),($3,$4,'active',0)",[room,host,room2,foreign]);
 await db.query('insert into lab_private.players(id,room_id,actor) values ($1,$2,$3),($4,$2,$5)',[a,room,actorA,b,actorB]);
 await db.query(`insert into lab_private.questions(id,room_id,index,stem,options,correct_index,content_revision,opens_at,closes_at) values ($1,$2,0,'Synthetic question','["A","B"]'::jsonb,0,'fixture-v1',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour'),($3,$4,0,'Other room','["A","B"]'::jsonb,1,'fixture-v1',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')`,[q,room,q2,room2]);return db;}
const actor=(db,id)=>db.query("select set_config('lab.actor',$1,false)",[id??'']);
const role=(db,name)=>db.exec(`set role ${name}`);
const answer=(db,room,player,q,choice)=>db.query('select * from lab_api.answer($1::uuid,$2::uuid,$3::uuid,$4::smallint)',[room,player,q,choice]);
const snapshot=(db,room,player)=>db.query('select * from lab_api.snapshot($1::uuid,$2::uuid)',[room,player]);

test('role privileges, owner-bound snapshot and immutable retry',async()=>{const db=await fixture();try {const {room,a,b,actorA,actorB,q}=I;
 await role(db,'lab_anon');await assert.rejects(snapshot(db,room,a),/permission denied/i);
 await role(db,'lab_client');await actor(db,null);await assert.rejects(snapshot(db,room,a),/FORBIDDEN/);
 await actor(db,actorA);await assert.rejects(db.query('select correct_index from lab_private.questions'),/permission denied/i);
 const before=(await snapshot(db,room,a)).rows[0];assert.equal(before.correct_index,null);assert.equal(before.receipt_id,null);assert.equal(before.score,0);
 await assert.rejects(snapshot(db,room,b),/FORBIDDEN/);await assert.rejects(answer(db,room,b,q,0),/FORBIDDEN/);
 const client=createLabClient((sql,params)=>db.query(sql,params));client.bind(room,a);
 const initial=await client.snapshot();assert.equal(initial.question.id,q);assert.equal(initial.receipt,null);
 const viaClient=await client.answer(q,0);assert.equal(viaClient.choice,0);assert.equal(viaClient.points,100);
 const first=(await answer(db,room,a,q,0)).rows[0];assert.equal(first.is_correct,true);assert.equal(first.points,100);assert.equal(first.score,100);
 assert.deepEqual((await answer(db,room,a,q,1)).rows[0],first);const recovered=(await snapshot(db,room,a)).rows[0];assert.equal(recovered.receipt_id,first.receipt_id);assert.equal(recovered.accepted_choice,0);assert.equal(recovered.score,100);assert.equal((await client.snapshot()).receipt.scoreAfter,100);
 await actor(db,actorB);const other=(await snapshot(db,room,b)).rows[0];assert.equal(other.receipt_id,null);assert.equal(other.correct_index,null);await assert.rejects(snapshot(db,room,a),/FORBIDDEN/);
 await db.exec('reset role');await db.query('update lab_private.players set score=250 where id=$1',[a]);await role(db,'lab_client');await actor(db,actorA);
 assert.deepEqual((await answer(db,room,a,q,1)).rows[0],first,'the receipt score is frozen even if the current total later changes');
 }finally{await db.close()}});

test('deadline, stale question and choice bounds fail without writing points',async()=>{const db=await fixture();try{const {room,a,actorA,q,q2}=I;await role(db,'lab_client');await actor(db,actorA);
 await assert.rejects(answer(db,room,a,q,2),/INVALID_CHOICE/);await assert.rejects(answer(db,room,a,q2,0),/STALE_QUESTION/);
 await db.exec('reset role; alter table lab_private.questions disable trigger questions_immutable');await db.query("update lab_private.questions set opens_at=clock_timestamp()-interval '2 hours',closes_at=clock_timestamp()-interval '1 second' where id=$1",[q]);await db.exec('alter table lab_private.questions enable trigger questions_immutable');
 await role(db,'lab_client');await actor(db,actorA);await assert.rejects(answer(db,room,a,q,0),/OUTSIDE_WINDOW/);const after=(await snapshot(db,room,a)).rows[0];assert.equal(after.score,0);assert.equal(after.receipt_id,null);
 }finally{await db.close()}});

test('finish is host-owned and version protected, and a committed retry survives finish',async()=>{const db=await fixture();try{const {room,a,actorA,host,foreign,q}=I;await role(db,'lab_client');await actor(db,actorA);const first=(await answer(db,room,a,q,0)).rows[0];
 await actor(db,foreign);await assert.rejects(db.query('select lab_api.finish($1::uuid,$2::bigint)',[room,1]),/FORBIDDEN/);
 await actor(db,host);assert.equal((await db.query('select lab_api.finish($1::uuid,$2::bigint) as ok',[room,0])).rows[0].ok,false);assert.equal((await db.query('select lab_api.finish($1::uuid,$2::bigint) as ok',[room,1])).rows[0].ok,true);assert.equal((await db.query('select lab_api.finish($1::uuid,$2::bigint) as ok',[room,1])).rows[0].ok,false);
 await actor(db,actorA);assert.deepEqual((await answer(db,room,a,q,1)).rows[0],first);
 }finally{await db.close()}});

test('immutable content and a failed receipt insertion roll back a preceding score update',async()=>{const db=await fixture();try{const {room,a,actorA,q}=I;await assert.rejects(db.query("update lab_private.questions set stem='changed' where id=$1",[q]),/IMMUTABLE/);
 await db.exec("create function lab_private.reject_receipt() returns trigger language plpgsql as $$ begin raise exception 'SIMULATED_FAILURE'; end $$; create trigger receipt_failure before insert on lab_private.receipts for each row execute function lab_private.reject_receipt()");
 await role(db,'lab_client');await actor(db,actorA);await assert.rejects(answer(db,room,a,q,0),/SIMULATED_FAILURE/);const rolledBack=(await snapshot(db,room,a)).rows[0];assert.equal(rolledBack.receipt_id,null);assert.equal(rolledBack.score,0);
 await db.exec('reset role; drop trigger receipt_failure on lab_private.receipts');await role(db,'lab_client');await actor(db,actorA);const result=(await answer(db,room,a,q,0)).rows[0];await db.exec('reset role');await assert.rejects(db.query('delete from lab_private.receipts where id=$1',[result.receipt_id]),/IMMUTABLE/);
 }finally{await db.close()}});
