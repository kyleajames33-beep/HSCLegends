import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { prepareTeacherDraftRequest } from '../../../lib/classroom-v2/teacher-drafts.mjs';
import { initializeClassroomV2 } from '../../../lib/classroom-v2/index.ts';

const host='20000000-0000-4000-8000-000000000001', student='40000000-0000-4000-8000-000000000001', otherStudent='40000000-0000-4000-8000-000000000002';
const request='70000000-0000-4000-8000-000000000001';
const question={id:'teacher-1',stem:'Which gas is produced?',options:['Hydrogen','Oxygen'],correctIndex:1,explanation:'Oxygen is produced in this example.',subject:'chemistry',year:12,module:'module-5',syllabusVersion:'2017',source:'Teacher-created'};

test('teacher draft survives the isolated staged create contract without exposing metadata in the student snapshot', async () => {
  const db=new PGlite();
  try {
    await db.exec("create role anon nologin; create role authenticated nologin; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('lab.actor',true),'')::uuid $$;");
    await db.exec(await readFile(new URL('../staging-candidate.sql',import.meta.url),'utf8'));
    await db.query('insert into classroom_v2_private.hosts(actor) values ($1)',[host]);
    await db.query("select set_config('lab.actor',$1,false)",[host]);
    const input=prepareTeacherDraftRequest(JSON.stringify([question]),request,30,'teacher-supplied-v1');
    assert.equal(Object.isFrozen(input.questions[0].teacher_draft),true);
    const create=async (id,questions)=>db.query('select * from public.classroom_v2_create($1::uuid,$2::jsonb,$3::smallint)',[id,JSON.stringify(questions),30]);
    const made=(await create(input.requestId,input.questions)).rows[0];
    const stored=(await db.query('select teacher_draft from classroom_v2_private.questions where room_id=$1',[made.room_id])).rows[0].teacher_draft;
    assert.deepEqual(stored,{id:question.id,explanation:question.explanation,subject:question.subject,year:question.year,module:question.module,syllabusVersion:question.syllabusVersion,source:question.source,reviewStatus:'unreviewed'});
    assert.deepEqual((await create(input.requestId,input.questions)).rows[0],made);
    await assert.rejects(create(input.requestId,[{...input.questions[0],teacher_draft:{...stored,source:'Different'}}]),/IDEMPOTENCY_CONFLICT/);
    const badId='70000000-0000-4000-8000-000000000002';
    for (const bad of [{...stored,reviewStatus:'approved'}, {...stored,source:''}, {...stored,extra:'silently lost'}]) {
      await assert.rejects(create(badId,[{...input.questions[0],teacher_draft:bad}]),/INVALID_TEACHER_DRAFT/);
    }
    await assert.rejects(create(badId,[{...input.questions[0],unsupported:'lost'}]),/INVALID_CONTENT/);
    assert.equal(Number((await db.query('select count(*) as n from classroom_v2_private.rooms')).rows[0].n),1);
    await db.query("select set_config('lab.actor',$1,false)",[student]);
    const joined=(await db.query('select * from public.classroom_v2_join($1::uuid,$2::text)',[made.join_code,'Student'])).rows[0];
    const duplicate=(await db.query('select * from public.classroom_v2_join($1::uuid,$2::text)',[made.join_code,'Changed alias'])).rows[0];
    assert.equal(duplicate.player_id,joined.player_id);
    assert.equal((await db.query('select alias from classroom_v2_private.players where id=$1',[joined.player_id])).rows[0].alias,'Student');
    await db.query("select set_config('lab.actor',$1,false)",[otherStudent]);
    const other=(await db.query('select * from public.classroom_v2_join($1::uuid,$2::text)',[made.join_code,'Other'])).rows[0];
    await db.query("select set_config('lab.actor',$1,false)",[host]);
    await db.query('select public.classroom_v2_start($1::uuid,$2::bigint)',[made.room_id,0]);
    await db.query("select set_config('lab.actor',$1,false)",['40000000-0000-4000-8000-000000000003']);
    await assert.rejects(db.query('select * from public.classroom_v2_join($1::uuid,$2::text)',[made.join_code,'Late']),/ROOM_UNAVAILABLE/);
    await db.query("select set_config('lab.actor',$1,false)",[student]);
    const snapshot=(await db.query('select * from public.classroom_v2_snapshot($1::uuid,$2::uuid)',[made.room_id,joined.player_id])).rows[0];
    assert.equal(snapshot.receipt_id,null);
    assert.equal(snapshot.correct_index,null);assert.equal(snapshot.answer_explanation,null);assert.equal(snapshot.answer_review,null);
    assert.equal(JSON.stringify(snapshot).includes(question.explanation),false);
    assert.equal(JSON.stringify(snapshot).includes(question.source),false);
    assert.equal(JSON.stringify(snapshot).includes('teacher_draft'),false);
    await db.query('select * from public.classroom_v2_answer($1::uuid,$2::uuid,$3::uuid,$4::smallint)',[made.room_id,joined.player_id,snapshot.question_id,0]);
    const answered=(await db.query('select * from public.classroom_v2_snapshot($1::uuid,$2::uuid)',[made.room_id,joined.player_id])).rows[0];
    assert.equal(answered.is_correct,false);assert.equal(answered.answer_explanation,question.explanation);
    await db.query("select set_config('lab.actor',$1,false)",[otherStudent]);
    const otherSnapshot=(await db.query('select * from public.classroom_v2_snapshot($1::uuid,$2::uuid)',[made.room_id,other.player_id])).rows[0];
    assert.equal(otherSnapshot.receipt_id,null);assert.equal(otherSnapshot.correct_index,null);assert.equal(otherSnapshot.answer_explanation,null);
    await assert.rejects(db.query('select * from public.classroom_v2_snapshot($1::uuid,$2::uuid)',[made.room_id,joined.player_id]),/FORBIDDEN/);
    const read=()=>db.query('select * from public.classroom_v2_teacher_questions($1::uuid)',[made.room_id]);
    await assert.rejects(read(),/FORBIDDEN/);
    const otherHost='20000000-0000-4000-8000-000000000002';
    await db.query('insert into classroom_v2_private.hosts(actor) values ($1)',[otherHost]);
    await db.query("select set_config('lab.actor',$1,false)",[otherHost]);
    await assert.rejects(read(),/FORBIDDEN/);
    await db.query("select set_config('lab.actor','',false)");
    await assert.rejects(read(),/FORBIDDEN/);
    await db.query("select set_config('lab.actor',$1,false)",[host]);
    const reviewed=(await read()).rows;
    assert.equal(reviewed.length,1); assert.equal(reviewed[0].correct_index,1);
    assert.deepEqual(reviewed[0].teacher_draft,stored);
    const transport={rpc:async(name,args)=>{
      const query={classroom_v2_capabilities:['select * from public.classroom_v2_capabilities()',[]],classroom_v2_host_snapshot:['select * from public.classroom_v2_host_snapshot($1::uuid)',[args.p_room]],classroom_v2_teacher_questions:['select * from public.classroom_v2_teacher_questions($1::uuid)',[args.p_room]]}[name];
      if(!query) throw new Error('unexpected RPC');
      const result=await db.query(...query);return {data:JSON.parse(JSON.stringify(result.rows)),error:null};
    }};
    const initialized=await initializeClassroomV2({enabled:true,target:'staging',ownerId:host,isCurrentOwner:()=>true,authGeneration:()=>0},transport);
    assert.equal(initialized.status,'available');
    await initialized.client.hostSnapshot(made.room_id);
    const content=await initialized.client.teacherQuestions(made.room_id);
    assert.equal(content[0].teacherDraft.explanation,question.explanation);
    assert.equal(content[0].correctIndex,question.correctIndex);
    initialized.client.dispose();
    const permissions=(await db.query("select has_function_privilege('anon','public.classroom_v2_teacher_questions(uuid)','execute') as anon, has_function_privilege('authenticated','public.classroom_v2_teacher_questions(uuid)','execute') as authenticated, has_function_privilege('public','public.classroom_v2_teacher_questions(uuid)','execute') as public_role")).rows[0];
    assert.deepEqual(permissions,{anon:false,authenticated:true,public_role:false});
    await db.query('update classroom_v2_private.hosts set enabled=false where actor=$1',[host]);
    await assert.rejects(read(),/FORBIDDEN/);
    await assert.rejects(db.query('select public.classroom_v2_next($1::uuid,$2::bigint)',[made.room_id,1]),/FORBIDDEN/);
    await assert.rejects(db.query('select public.classroom_v2_finish($1::uuid,$2::bigint)',[made.room_id,1]),/FORBIDDEN/);
    await db.query("select set_config('lab.actor',$1,false)",[otherStudent]);
    assert.equal((await db.query('select * from public.classroom_v2_snapshot($1::uuid,$2::uuid)',[made.room_id,other.player_id])).rows[0].state,'active');
    await db.query("select set_config('lab.actor',$1,false)",[host]);
    await db.query('update classroom_v2_private.hosts set enabled=true where actor=$1',[host]);
    const hostVersion=(await db.query('select room_version from public.classroom_v2_host_snapshot($1::uuid)',[made.room_id])).rows[0].room_version;
    await db.query('select public.classroom_v2_finish($1::uuid,$2::bigint)',[made.room_id,hostVersion]);
    await db.query("select set_config('lab.actor',$1,false)",[student]);
    const review=(await db.query('select answer_review from public.classroom_v2_snapshot($1::uuid,$2::uuid)',[made.room_id,joined.player_id])).rows[0].answer_review;
    assert.equal(review.length,1);assert.equal(review[0].choice,0);assert.equal(review[0].correct_index,1);assert.equal(review[0].explanation,question.explanation);
    await db.query("select set_config('lab.actor',$1,false)",[otherStudent]);
    assert.deepEqual((await db.query('select answer_review from public.classroom_v2_snapshot($1::uuid,$2::uuid)',[made.room_id,other.player_id])).rows[0].answer_review,[]);
    await assert.rejects(db.query('select * from public.classroom_v2_snapshot($1::uuid,$2::uuid)',[made.room_id,joined.player_id]),/FORBIDDEN/);
    await db.query("select set_config('lab.actor',$1,false)",[host]);
    await db.query("update classroom_v2_private.rooms set expires_at=clock_timestamp()-interval '1 second' where id=$1",[made.room_id]);
    await assert.rejects(read(),/ROOM_UNAVAILABLE/);
  } finally { await db.close(); }
});

test('teacher draft mapping refuses invalid and unsupported input instead of dropping fields', () => {
  for (const invalid of [{...question,source:''},{...question,explanation:''},{...question,extra:'lost'}]) {
    assert.throws(()=>prepareTeacherDraftRequest(JSON.stringify([invalid]),request,30,'v1'),/INVALID_TEACHER_DRAFT/);
  }
  assert.throws(()=>prepareTeacherDraftRequest(JSON.stringify([question]),request,30,''),/INVALID_ARGUMENT/);
});

test('client refuses to send teacher metadata to an older candidate lacking preservation capability', async () => {
  let calls=0;
  const initialized=await initializeClassroomV2({enabled:true,target:'staging',ownerId:host,isCurrentOwner:()=>true,authGeneration:()=>0},{rpc:async()=>{calls++;return {data:[{contract_version:1,environment:'staging-only'}],error:null};}});
  assert.equal(initialized.status,'available');
  const prepared=prepareTeacherDraftRequest(JSON.stringify([question]),request,30,'v1');
  await assert.rejects(initialized.client.createRoom(prepared),/TEACHER_CONTENT_UNSUPPORTED/);
  assert.equal(calls,1);
});
