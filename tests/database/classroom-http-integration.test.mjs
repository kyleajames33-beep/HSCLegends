import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import { createGuestSessionService } from '../../lib/classroom-server/guest-session.mjs';
import { createScopedClassroomService } from '../../lib/classroom-server/scoped-adapter.mjs';
import { createClassroomHttpBoundary, CLASSROOM_HTTP_PATHS, CLASSROOM_COOKIE } from '../../lib/classroom-server/http-boundary.mjs';
import { createSupabaseAccountVerifier } from '../../lib/classroom-server/auth-verifier.mjs';
import { sealSessionQuestions } from '../../lib/classroom-server/classroom-core.mjs';
const room='10000000-0000-0000-0000-000000000001';
const user='20000000-0000-0000-0000-000000000001';
const other='20000000-0000-0000-0000-000000000002';
const secret=Buffer.alloc(32,7).toString('base64url'); // public synthetic fixture only
const origin='https://classroom.example';
async function fixture(t){
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec(await readFile(new URL('../fixtures/classroom-upgrade-baseline.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../../docs/classroom-recovery/proposals/classroom-upgrade.sql',import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[user,other]);
 await db.query("insert into game_sessions(id,code,subject,question_ids,expires_at) values($1,'ABC123','biology',array['q'],to_timestamp(100))",[room]);
 await db.query('insert into classroom_candidate_private.question_sets values($1,$2::json)',[room,JSON.stringify(sealSessionQuestions([{stem:'Frozen bridge question',options:['Yes','No'],correctIndex:0,revision:'v1'}]))]);
 let now=1000,identity=null,loseAck=false,bindAfterResolve=false,loseLeaveAck=false,issued=0;
 const runTransaction=fn=>db.transaction(tx=>fn({query:(sql,params=[])=>sql.includes('clock_timestamp()')?tx.query('select $1::bigint now_ms',[now]):tx.query(sql,params)}));
 const rawGuests=createGuestSessionService({runTransaction,createSecret:()=>Buffer.alloc(32,7+issued++).toString('base64url'),ttlMs:10000});
 const guestSessions={...rawGuests,leave:async(...args)=>{const result=await rawGuests.leave(...args);if(loseLeaveAck){loseLeaveAck=false;throw Error('synthetic lost leave acknowledgement');}return result;},resolve:async token=>{const grant=await rawGuests.resolve(token);if(bindAfterResolve){bindAfterResolve=false;await db.query('update game_players set user_id=$1 where id=$2',[user,grant.proof.playerId]);}return grant;}};
 const scoped=createScopedClassroomService({runTransaction});
 const verifyAccount=createSupabaseAccountVerifier({createClientForRequest:async()=>({auth:{getUser:async()=>identity?{data:{user:identity},error:null}:{data:{user:null},error:new AuthSessionMissingError()}}})});
 const limiterCalls=[];
 const boundary=createClassroomHttpBoundary({origin,guestSessions,classroom:{...scoped,submit:async(...args)=>{const receipt=await scoped.submit(...args);if(loseAck){loseAck=false;throw Error('synthetic lost acknowledgement');}return receipt;}},verifyAccount,rateLimiter:{consumeAtomic:async args=>{limiterCalls.push(args);return {allowed:true};}},trustedSourceKey:async c=>c.source,now:()=>now});
 const call=(op,cookie,payload)=>{const method=['ownSnapshot','ownStanding'].includes(op)?'GET':'POST';const headers={'sec-fetch-site':'same-origin','sec-fetch-mode':'cors','sec-fetch-dest':'empty'};if(cookie)headers.cookie=cookie;if(method==='POST'){headers.origin=origin;headers['content-type']='application/json';}return boundary[op](new Request(origin+CLASSROOM_HTTP_PATHS[op],{method,headers,...(method==='POST'?{body:JSON.stringify(payload??{})}:{})}),{source:'synthetic-trusted-source'});};
 return {db,call,limiterCalls,bindAfterResolve:()=>{bindAfterResolve=true;},setIdentity:v=>{identity=v;},expire:()=>{now=11000;},loseAck:()=>{loseAck=true;},loseLeaveAck:()=>{loseLeaveAck=true;}};
}

test('HTTP→guest issuance→scoped SQL: guest lobby, lost answer acknowledgement, uncached restore and terminal standing',async t=>{
 const f=await fixture(t);const join=await f.call('join',null,{code:'ABC123',alias:'Synthetic guest'});assert.equal(join.status,200);
 const binding=await join.json();const cookie=join.headers.get('set-cookie').split(';')[0];assert.equal(cookie,CLASSROOM_COOKIE+'='+secret);assert.ok(!JSON.stringify(binding).includes(secret));
 let response=await f.call('ownSnapshot',cookie);assert.equal(response.status,200);assert.equal((await response.json()).status,'lobby');
 await f.db.query("update game_sessions set status='active',current_index=0,question_started_at=to_timestamp(0) where id=$1",[room]);
 f.loseAck();response=await f.call('submit',cookie,{index:0,choice:0});assert.equal(response.status,503);
 response=await f.call('restore',cookie);assert.equal(response.status,200);assert.equal((await response.json()).playerId,binding.playerId);
 response=await f.call('ownSnapshot',cookie);assert.equal(response.status,200);let snapshot=await response.json();assert.equal(snapshot.ownReceipt.points,147);assert.equal(snapshot.ownReceipt.keyProvenance,'frozen');
 response=await f.call('submit',cookie,{index:0,choice:1});assert.equal(response.status,200);assert.equal((await response.json()).ownReceipt.acceptedChoice,0);
 assert.equal((await f.db.query('select count(*)::int n from game_answers')).rows[0].n,1);
 await f.db.query("update game_sessions set status='complete',current_index=1 where id=$1",[room]);
 response=await f.call('ownStanding',cookie);assert.equal(response.status,200);assert.equal((await response.json()).score,147);
 response=await f.call('ownSnapshot',cookie);snapshot=await response.json();assert.equal(snapshot.status,'complete');assert.equal(snapshot.question,null);
 assert.ok(f.limiterCalls.length>=8);
});

test('HTTP integrated account verification preserves unowned guest sign-in and rejects foreign owned account',async t=>{
 const f=await fixture(t);const join=await f.call('join',null,{code:'ABC123',alias:'Synthetic guest'});const binding=await join.json();const cookie=join.headers.get('set-cookie').split(';')[0];
 f.setIdentity({id:user,is_anonymous:false,user_metadata:{role:'admin'}});
 let response=await f.call('restore',cookie);assert.equal(response.status,200);assert.equal((await response.json()).principalId,user);
 assert.equal((await f.db.query('select user_id from game_players where id=$1',[binding.playerId])).rows[0].user_id,null);
 // Synthetic participant ownership transition; the replacement ledger marker
 // does not mutate user_id. This also models a legacy ownership writer.
 await f.db.query('update game_players set user_id=$1 where id=$2',[user,binding.playerId]);
 f.setIdentity({id:other,is_anonymous:false});response=await f.call('restore',cookie);assert.equal(response.status,403);
 f.setIdentity({id:user,is_anonymous:true});response=await f.call('restore',cookie);assert.equal(response.status,403);
 f.setIdentity({id:user,is_anonymous:false});assert.equal((await f.call('restore',cookie)).status,200);
 f.expire();assert.equal((await f.call('restore',cookie)).status,403);
});

for (const operation of ['ownSnapshot','submit','ownStanding']) test(`HTTP rejects ownership changed after resolution before ${operation}`,async t=>{
 const f=await fixture(t);const join=await f.call('join',null,{code:'ABC123',alias:'Synthetic guest'});const cookie=join.headers.get('set-cookie').split(';')[0];
 await f.db.query("update game_sessions set status=$1,current_index=0,question_started_at=to_timestamp(0) where id=$2",[operation==='ownStanding'?'complete':'active',room]);
 f.setIdentity({id:other,is_anonymous:false});f.bindAfterResolve();
 const response=await f.call(operation,cookie,operation==='submit'?{index:0,choice:0}:undefined);
 assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'session_unavailable'});
 assert.equal((await f.db.query('select count(*)::int n from game_answers')).rows[0].n,0);
 assert.equal((await f.db.query('select score from game_players')).rows[0].score,0);
});


test('HTTP integrated leave revokes once, preserves evidence and permits explicit new-room join after cookie clear',async t=>{
 const f=await fixture(t);const join=await f.call('join',null,{code:'ABC123',alias:'Synthetic guest'});const cookie=join.headers.get('set-cookie').split(';')[0];
 await f.db.query("update game_sessions set status='active',current_index=0,question_started_at=to_timestamp(0) where id=$1",[room]);
 assert.equal((await f.call('submit',cookie,{index:0,choice:0})).status,200);
 f.loseLeaveAck();let response=await f.call('leave',cookie,{intent:'revoke-session'});
 assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
 assert.equal((await f.db.query('select revoked from classroom_candidate_private.guest_sessions')).rows[0].revoked,true);
 response=await f.call('leave',cookie,{intent:'revoke-session'});assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{schemaVersion:1,disposition:'left-this-device'});assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await f.call('restore',cookie)).status,403);
 assert.equal((await f.db.query('select count(*)::int n from game_answers')).rows[0].n,1);
 assert.equal((await f.db.query('select count(*)::int n from classroom_candidate_private.receipts')).rows[0].n,1);
 assert.equal((await f.db.query('select score from game_players')).rows[0].score,147);
 const nextRoom='10000000-0000-0000-0000-000000000002';
 await f.db.query("insert into game_sessions(id,code,subject,question_ids,expires_at) values($1,'XYZ789','biology',array['q'],to_timestamp(100))",[nextRoom]);
 await f.db.query('insert into classroom_candidate_private.question_sets select $1,payload from classroom_candidate_private.question_sets where session_id=$2',[nextRoom,room]);
 response=await f.call('join',null,{code:'XYZ789',alias:'Next room guest'});assert.equal(response.status,200);assert.equal((await response.json()).sessionId,nextRoom);
 assert.notEqual(response.headers.get('set-cookie').split(';')[0],cookie);
 assert.equal((await f.db.query('select count(*)::int n from game_players')).rows[0].n,2);
});

test('HTTP integrated foreign-owner revoke preserves cookie and grant; explicit forget only clears device recovery',async t=>{
 const f=await fixture(t);f.setIdentity({id:user,is_anonymous:false});
 const join=await f.call('join',null,{code:'ABC123',alias:'Owned guest'});const cookie=join.headers.get('set-cookie').split(';')[0];
 f.setIdentity({id:other,is_anonymous:false});
 let response=await f.call('leave',cookie,{intent:'revoke-session'});assert.equal(response.status,403);assert.equal(response.headers.get('set-cookie'),null);
 assert.equal((await f.db.query('select revoked from classroom_candidate_private.guest_sessions')).rows[0].revoked,false);
 response=await f.call('leave',cookie,{intent:'forget-browser'});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await f.db.query('select revoked from classroom_candidate_private.guest_sessions')).rows[0].revoked,false);
 assert.equal((await f.db.query('select count(*)::int n from game_players')).rows[0].n,1);
 f.setIdentity({id:user,is_anonymous:false});assert.equal((await f.call('restore',cookie)).status,200);
 response=await f.call('leave',CLASSROOM_COOKIE+'=corrupt',{intent:'forget-browser'});assert.equal(response.status,200);
});
