import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initializeClassroomV2,prepareCreateRequest} from '../../../lib/classroom-v2/index.ts';

// This auth.uid is forgeable and only simulates actor binding in a local lab.
test('promoted client runs a synthetic lifecycle against the staged SQL contract',async()=>{
 const db=new PGlite(), host='20000000-0000-4000-8000-000000000001', student='40000000-0000-4000-8000-000000000001', request='70000000-0000-4000-8000-000000000001';
 try {
  await db.exec("create role anon nologin; create role authenticated nologin; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('lab.actor',true),'')::uuid $$;");
  await db.exec(await readFile(new URL('../staging-candidate.sql',import.meta.url),'utf8'));
  await db.query('insert into classroom_v2_private.hosts(actor) values ($1)',[host]);await db.exec('set role authenticated');
  const statements={
   classroom_v2_capabilities:['select * from public.classroom_v2_capabilities()',[]],
   classroom_v2_create:['select * from public.classroom_v2_create($1::uuid,$2::jsonb,$3::smallint)',['p_request_id','p_questions','p_seconds']],
   classroom_v2_join:['select * from public.classroom_v2_join($1::uuid,$2::text)',['p_join_code','p_alias']],
   classroom_v2_host_snapshot:['select * from public.classroom_v2_host_snapshot($1::uuid)',['p_room']],
   classroom_v2_snapshot:['select * from public.classroom_v2_snapshot($1::uuid,$2::uuid)',['p_room','p_player']],
   classroom_v2_answer:['select * from public.classroom_v2_answer($1::uuid,$2::uuid,$3::uuid,$4::smallint)',['p_room','p_player','p_question','p_choice']],
   classroom_v2_start:['select public.classroom_v2_start($1::uuid,$2::bigint) as result',['p_room','p_expected_version']],
   classroom_v2_next:['select public.classroom_v2_next($1::uuid,$2::bigint) as result',['p_room','p_expected_version']],
   classroom_v2_finish:['select public.classroom_v2_finish($1::uuid,$2::bigint) as result',['p_room','p_expected_version']],
  };
  const connect=async actor=>{const transport={rpc:async(name,args)=>{await db.query("select set_config('lab.actor',$1,false)",[actor]);const [sql,keys]=statements[name];const values=keys.map(k=>k==='p_questions'?JSON.stringify(args[k]):args[k]);const result=await db.query(sql,values);const rows=JSON.parse(JSON.stringify(result.rows));return {data:['classroom_v2_start','classroom_v2_next','classroom_v2_finish'].includes(name)?rows[0].result:rows,error:null};}};const result=await initializeClassroomV2({enabled:true,target:'staging',ownerId:actor,isCurrentOwner:()=>true,authGeneration:()=>0},transport);assert.equal(result.status,'available');return result.client;};
  const h=await connect(host), s=await connect(student);const draft=prepareCreateRequest(request,[{stem:'Synthetic?',options:['A','B'],correct_index:0,content_revision:'synthetic-v1'}],30);
  const created=await h.createRoom(draft);assert.deepEqual(await h.createRoom(draft),created);const joined=await s.join(created.joinCode,'Finch');s.bindStudent(joined.roomId,joined.playerId);assert.equal((await s.snapshot()).receipt,null);assert.equal(await h.start(created.roomId,0),true);
  const active=await s.snapshot();assert.equal(active.receipt,null);assert.equal(active.questionTotal,1);const first=await s.answer(active.question.id,0);assert.equal(first.points,100);assert.deepEqual(await s.answer(active.question.id,1),first);
  const reconnect=await connect(student);reconnect.bindStudent(joined.roomId,joined.playerId);assert.deepEqual((await reconnect.snapshot()).receipt,first);const hostView=await h.hostSnapshot(created.roomId);assert.equal(hostView.players[0].score,100);assert.equal(hostView.joinCode,created.joinCode);assert.equal(await h.next(created.roomId,hostView.version),true);const final=await reconnect.snapshot();assert.equal(final.state,'complete');assert.equal(final.finalRank,1);
 } finally {await db.close();}
});
