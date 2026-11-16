// Optional real-Postgres test. Creates and removes only its own disposable
// network-isolated container. No production DB, credentials or data are used.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const run = promisify(execFile);
const dockerEnv = { ...process.env };
for (const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) delete dockerEnv[name];
const docker = (...args) => run('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,timeout:30000,maxBuffer:1024*1024});
const name = `hsc-classroom-v2-${randomUUID().slice(0,12)}`;
const staging = process.argv.includes('--staging-candidate');
let created = false;
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
function psql(sql,app='classroom-probe') {
  if (staging) sql=sql.replaceAll('lab_private','classroom_v2_private').replaceAll('lab_api.snapshot','public.classroom_v2_snapshot').replaceAll('lab_api.answer','public.classroom_v2_answer').replaceAll('lab_api.finish','public.classroom_v2_finish').replaceAll('lab_api.next','public.classroom_v2_next').replaceAll('lab_client','authenticated').replaceAll('lab_anon','anon');
  return new Promise((resolve,reject)=>{
    const p=spawn('docker',['--host=unix:///var/run/docker.sock','exec','-i','-e',`PGAPPNAME=${app}`,name,'psql','-X','-v','ON_ERROR_STOP=1','-qAt','-U','postgres','-d','postgres'],{env:dockerEnv});
    let out='',err='';p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');p.stdout.on('data',s=>out+=s);p.stderr.on('data',s=>err+=s);
    p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(`psql exited ${code}: ${err}`)));p.stdin.end(sql);
  });
}
async function until(check,label) { for(let i=0;i<100;i++){if(await check())return;await sleep(100)}throw new Error(`Timed out: ${label}`); }
const I={room:'10000000-0000-4000-8000-000000000001',host:'20000000-0000-4000-8000-000000000001',foreign:'20000000-0000-4000-8000-000000000002',player:'30000000-0000-4000-8000-000000000001',other:'30000000-0000-4000-8000-000000000002',actor:'40000000-0000-4000-8000-000000000001',otherActor:'40000000-0000-4000-8000-000000000002',q:'50000000-0000-4000-8000-000000000001'};
try {
  await docker('run','-d','--rm','--network','none','--name',name,'--label','hsc.classroom-v2.lab=true','-e','POSTGRES_PASSWORD=synthetic-disposable-only','postgres:17');created=true;
  await until(async()=>{try{await docker('exec',name,'pg_isready','-U','postgres');return true}catch{return false}},'postgres ready');
  // The image's temporary init server can report ready before it shuts down.
  await sleep(2000);
  await until(async()=>{try{return (await psql('select 1')).trim()==='1'}catch{return false}},'final postgres server ready');
  if(staging) await psql(`create role anon nologin; create role authenticated nologin; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('lab.actor',true),'')::uuid $$;
    create function public.submit_answer(uuid,smallint,smallint) returns void language plpgsql as $$ begin return; end $$;
    revoke all on function public.submit_answer(uuid,smallint,smallint) from public,anon,authenticated;`);
  await psql(await readFile(new URL(staging?'../staging-candidate.sql':'../schema.sql',import.meta.url),'utf8'));
  if(staging) {
    assert.equal((await psql("select has_function_privilege('authenticated','public.submit_answer(uuid,smallint,smallint)','execute')")).trim(),'f','legacy submit remains locked down');
    assert.equal((await psql("select count(*)=10 and bool_and(p.prosecdef and not has_function_privilege('anon',p.oid,'execute') and has_function_privilege('authenticated',p.oid,'execute')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('classroom_v2_capabilities','classroom_v2_create','classroom_v2_join','classroom_v2_host_snapshot','classroom_v2_teacher_questions','classroom_v2_snapshot','classroom_v2_answer','classroom_v2_start','classroom_v2_next','classroom_v2_finish')")).trim(),'t','every new API has its expected restricted execute grants');
    assert.equal((await psql("select bool_and(relrowsecurity) from pg_class where oid in ('classroom_v2_private.hosts'::regclass,'classroom_v2_private.rooms'::regclass,'classroom_v2_private.players'::regclass,'classroom_v2_private.questions'::regclass,'classroom_v2_private.windows'::regclass,'classroom_v2_private.receipts'::regclass)")).trim(),'t','candidate tables have RLS');
    assert.equal((await psql("select has_function_privilege('anon','public.classroom_v2_answer(uuid,uuid,uuid,smallint)','execute')::text||':'||has_function_privilege('authenticated','public.classroom_v2_answer(uuid,uuid,uuid,smallint)','execute')::text")).trim(),'false:true');
    assert.equal((await psql("select has_schema_privilege('authenticated','classroom_v2_private','usage')")).trim(),'f');
    await psql(`insert into classroom_v2_private.hosts(actor) values ('${I.host}'),('${I.foreign}');`);
  }
  if(staging) {
    const questions=JSON.stringify([
      {stem:'Synthetic Q1',options:['A','B'],correct_index:0,content_revision:'sample-v1'},
      {stem:'Synthetic Q2',options:['A','B'],correct_index:1,content_revision:'sample-v1'},
    ]);
    const request='70000000-0000-4000-8000-000000000001';
    const call=async(actor,sql)=>psql(`set role authenticated;select set_config('lab.actor','${actor}',false);${sql}`);
    const readJson=out=>JSON.parse(out.split('\n').find(line=>line.startsWith('{')));
    await assert.rejects(psql('set role anon;select * from public.classroom_v2_capabilities();'),/permission denied/i);
    await assert.rejects(psql('set role authenticated;select * from public.classroom_v2_capabilities();'),/FORBIDDEN/);
    assert.deepEqual(readJson(await call(I.actor,'select row_to_json(t) from public.classroom_v2_capabilities() t;')),{contract_version:1,environment:'staging-only',teacher_content_version:1,teacher_readback_version:1});
    await assert.rejects(psql(`set role anon;select * from public.classroom_v2_create('${request}','${questions}'::jsonb,20::smallint);`),/permission denied/i);
    await assert.rejects(psql(`set role authenticated;select * from public.classroom_v2_create('${request}','${questions}'::jsonb,20::smallint);`),/FORBIDDEN/);
    await assert.rejects(call(I.actor,`select * from public.classroom_v2_create('${request}','${questions}'::jsonb,20::smallint);`),/FORBIDDEN/);
    await assert.rejects(call(I.host,`select * from public.classroom_v2_create('${request}','[{"stem":"bad"}]'::jsonb,20::smallint);`),/INVALID_CONTENT/);
    const createSql=`select row_to_json(t) from public.classroom_v2_create('${request}','${questions}'::jsonb,20::smallint) t;`;
    const created=readJson(await call(I.host,createSql));assert.equal(created.room_version,0);
    await assert.rejects(call(I.foreign,`select * from public.classroom_v2_teacher_questions('${created.room_id}');`),/FORBIDDEN/);
    await assert.rejects(call(I.actor,`select * from public.classroom_v2_teacher_questions('${created.room_id}');`),/FORBIDDEN/);
    assert.equal(readJson(await call(I.host,`select row_to_json(t) from public.classroom_v2_teacher_questions('${created.room_id}') t limit 1;`)).correct_index,0);
    assert.deepEqual(readJson(await call(I.host,createSql)),created,'same create request returns same room');
    await assert.rejects(call(I.host,`select * from public.classroom_v2_create('${request}','${questions}'::jsonb,30::smallint);`),/IDEMPOTENCY_CONFLICT/);
    const otherRequest='70000000-0000-4000-8000-000000000002';
    const concurrentCreateSql=`select row_to_json(t) from public.classroom_v2_create('${otherRequest}','${questions}'::jsonb,20::smallint) t;`;
    const [createA,createB]=await Promise.all([call(I.foreign,concurrentCreateSql),call(I.foreign,concurrentCreateSql)]);
    const otherRoom=readJson(createA);assert.deepEqual(readJson(createB),otherRoom,'concurrent retries create exactly one room');assert.notEqual(otherRoom.room_id,created.room_id);
    assert.equal((await call(I.foreign,`select public.classroom_v2_start('${otherRoom.room_id}',0);`)).trim().split('\n').at(-1),'f','an empty room cannot start');
    assert.equal((await psql(`select state||':'||version::text from classroom_v2_private.rooms where id='${otherRoom.room_id}';`)).trim(),'lobby:0');
    assert.equal((await psql(`select count(*) from classroom_v2_private.windows where room_id='${otherRoom.room_id}';`)).trim(),'0');
    // Both operations lock the room. If start gets the lock first it leaves the
    // empty lobby open; if join gets it first the subsequent start can proceed.
    const raceRequestA='70000000-0000-4000-8000-000000000003', raceRequestB='70000000-0000-4000-8000-000000000004';
    const makeRace=async id=>readJson(await call(I.foreign,`select row_to_json(t) from public.classroom_v2_create('${id}','${questions}'::jsonb,20::smallint) t;`));
    const raceA=await makeRace(raceRequestA),raceB=await makeRace(raceRequestB);
    const firstStart=psql(`begin;set role authenticated;select set_config('lab.actor','${I.foreign}',false);select public.classroom_v2_start('${raceA.room_id}',0);select pg_sleep(6);commit;`,'classroom-empty-start');firstStart.catch(()=>{});
    await until(async()=>(await psql("select exists(select 1 from pg_stat_activity where application_name='classroom-empty-start' and wait_event='PgSleep')")).trim()==='t','empty start holds room');
    const waitingJoin=psql(`begin;set role authenticated;select set_config('lab.actor','${I.actor}',false);select * from public.classroom_v2_join('${raceA.join_code}','First');commit;`,'classroom-wait-join');waitingJoin.catch(()=>{});
    await until(async()=>(await psql("select exists(select 1 from pg_stat_activity where application_name='classroom-wait-join' and wait_event_type='Lock')")).trim()==='t','join waits for empty start');
    assert.match(await firstStart,/\nf\n/);await waitingJoin;
    assert.equal((await psql(`select state||':'||(select count(*) from classroom_v2_private.players where room_id='${raceA.room_id}')::text from classroom_v2_private.rooms where id='${raceA.room_id}';`)).trim(),'lobby:1');
    const firstJoinLocked=psql(`begin;set role authenticated;select set_config('lab.actor','${I.actor}',false);select * from public.classroom_v2_join('${raceB.join_code}','First');select pg_sleep(6);commit;`,'classroom-join-first');firstJoinLocked.catch(()=>{});
    await until(async()=>(await psql("select exists(select 1 from pg_stat_activity where application_name='classroom-join-first' and wait_event='PgSleep')")).trim()==='t','join holds room');
    const waitingStart=psql(`begin;set role authenticated;select set_config('lab.actor','${I.foreign}',false);select public.classroom_v2_start('${raceB.room_id}',0);commit;`,'classroom-wait-start');waitingStart.catch(()=>{});
    await until(async()=>(await psql("select exists(select 1 from pg_stat_activity where application_name='classroom-wait-start' and wait_event_type='Lock')")).trim()==='t','start waits for join');
    await firstJoinLocked;assert.equal((await waitingStart).trim().split('\n').at(-1),'t');
    const joinSql=`select row_to_json(t) from public.classroom_v2_join('${created.join_code}','Finch') t;`;
    const firstJoin=readJson(await call(I.actor,joinSql));
    const again=readJson(await call(I.actor,joinSql));assert.equal(again.player_id,firstJoin.player_id,'same actor gets one participant');
    const renamed=readJson(await call(I.actor,`select row_to_json(t) from public.classroom_v2_join('${created.join_code}','Changed alias') t;`));
    assert.equal(renamed.player_id,firstJoin.player_id);
    assert.equal((await psql(`select alias from classroom_v2_private.players where id='${firstJoin.player_id}';`)).trim(),'Finch','a retry retains the first alias');
    const secondJoin=readJson(await call(I.otherActor,joinSql));assert.notEqual(secondJoin.player_id,firstJoin.player_id);
    const thirdActor='40000000-0000-4000-8000-000000000003';
    const [joinA,joinB]=await Promise.all([call(thirdActor,joinSql),call(thirdActor,joinSql)]);
    assert.equal(readJson(joinA).player_id,readJson(joinB).player_id,'concurrent duplicate joins bind one player');
    const snapSql=pid=>`select row_to_json(t) from public.classroom_v2_snapshot('${created.room_id}','${pid}') t;`;
    const lobby=readJson(await call(I.actor,snapSql(firstJoin.player_id)));assert.equal(lobby.state,'lobby');assert.equal(lobby.question_id,null);
    const hostSnap=`select row_to_json(t) from public.classroom_v2_host_snapshot('${created.room_id}') t;`;
    const hostLobby=readJson(await call(I.host,hostSnap));assert.equal(hostLobby.state,'lobby');assert.equal(hostLobby.players.length,3);assert.equal(hostLobby.question_total,2);assert.equal(hostLobby.join_code,created.join_code);assert.equal(hostLobby.question_report,null);
    assert.equal(Object.hasOwn(hostLobby,'correct_index'),false,'host projection does not expose answer key');
    await assert.rejects(call(I.foreign,hostSnap),/FORBIDDEN/);
    await assert.rejects(call(I.actor,`select * from public.classroom_v2_snapshot('${otherRoom.room_id}','${firstJoin.player_id}');`),/FORBIDDEN/);
    await assert.rejects(call(I.otherActor,`select public.classroom_v2_start('${created.room_id}',0);`),/FORBIDDEN/);
    assert.equal((await call(I.host,`select public.classroom_v2_start('${created.room_id}',null);`)).trim().split('\n').at(-1),'f','null cannot bypass expected version');
    assert.equal((await call(I.host,`select public.classroom_v2_start('${created.room_id}',0);`)).trim().split('\n').at(-1),'t');
    await psql(`update classroom_v2_private.hosts set enabled=false where actor='${I.host}';`);
    await assert.rejects(call(I.host,`select public.classroom_v2_next('${created.room_id}',1);`),/FORBIDDEN/);
    await assert.rejects(call(I.host,`select public.classroom_v2_finish('${created.room_id}',1);`),/FORBIDDEN/);
    await assert.rejects(call(I.foreign,`select public.classroom_v2_finish('${created.room_id}',1);`),/FORBIDDEN/);
    assert.equal(readJson(await call(I.actor,snapSql(firstJoin.player_id))).state,'active','revocation does not end the student room');
    await psql(`update classroom_v2_private.hosts set enabled=true where actor='${I.host}';`);
    assert.equal((await call(I.host,`select public.classroom_v2_start('${created.room_id}',0);`)).trim().split('\n').at(-1),'f');
    await assert.rejects(call('40000000-0000-4000-8000-000000000004',joinSql),/ROOM_UNAVAILABLE/);
    assert.equal(readJson(await call(I.actor,joinSql)).player_id,firstJoin.player_id,'existing actor can reconnect while active');
    const active=readJson(await call(I.actor,snapSql(firstJoin.player_id)));assert.equal(active.state,'active');assert.equal(active.question_total,2);assert.equal(active.final_rank,null);assert.equal(active.answer_review,null);assert.equal(active.correct_index,null);assert.equal(active.receipt_id,null);assert.ok(active.opens_at && active.closes_at && active.server_now);
    const answerSql=(pid,q,choice)=>`select row_to_json(t) from public.classroom_v2_answer('${created.room_id}','${pid}','${q}',${choice}::smallint) t;`;
    const firstReceipt=readJson(await call(I.actor,answerSql(firstJoin.player_id,active.question_id,0)));assert.equal(firstReceipt.points,100);
    const hostLive=readJson(await call(I.host,hostSnap));assert.equal(hostLive.answered,1);assert.equal(hostLive.room_version,2);assert.equal(hostLive.question_index,0);
    assert.deepEqual(readJson(await call(I.actor,answerSql(firstJoin.player_id,active.question_id,1))),firstReceipt);
    const otherView=readJson(await call(I.otherActor,snapSql(secondJoin.player_id)));assert.equal(otherView.receipt_id,null);assert.equal(otherView.correct_index,null);
    await assert.rejects(call(I.otherActor,snapSql(firstJoin.player_id)),/FORBIDDEN/);
    const wrong=readJson(await call(I.otherActor,answerSql(secondJoin.player_id,active.question_id,1)));assert.equal(wrong.points,0);
    assert.equal((await call(I.host,`select public.classroom_v2_next('${created.room_id}',null);`)).trim().split('\n').at(-1),'f','null cannot bypass expected version');
    assert.equal((await call(I.host,`select public.classroom_v2_next('${created.room_id}',2);`)).trim().split('\n').at(-1),'f');
    assert.equal((await call(I.host,`select public.classroom_v2_next('${created.room_id}',3);`)).trim().split('\n').at(-1),'t');
    const secondQuestion=readJson(await call(I.actor,snapSql(firstJoin.player_id)));assert.notEqual(secondQuestion.question_id,active.question_id);assert.equal(secondQuestion.receipt_id,null);
    assert.deepEqual(readJson(await call(I.actor,answerSql(firstJoin.player_id,active.question_id,1))),firstReceipt,'prior committed receipt survives advance');
    assert.equal(readJson(await call(I.actor,answerSql(firstJoin.player_id,secondQuestion.question_id,1))).score,200);
    assert.equal((await call(I.host,`select public.classroom_v2_finish('${created.room_id}',null);`)).trim().split('\n').at(-1),'f','null cannot bypass expected version');
    assert.equal((await call(I.host,`select public.classroom_v2_next('${created.room_id}',5);`)).trim().split('\n').at(-1),'t');
    assert.equal(readJson(await call(I.actor,joinSql)).state,'complete','existing participant can reconnect after completion');
    const winner=readJson(await call(I.actor,snapSql(firstJoin.player_id)));assert.equal(winner.state,'complete');assert.equal(winner.final_rank,1);assert.equal(winner.answer_review.length,2);assert.ok(winner.answer_review.every(item=>item.correct));
    const unansweredEnd=readJson(await call(I.otherActor,snapSql(secondJoin.player_id)));
    assert.equal(unansweredEnd.receipt_id,null);assert.equal(unansweredEnd.correct_index,null);assert.equal(unansweredEnd.answer_explanation,null);assert.equal(unansweredEnd.final_rank,2);assert.equal(unansweredEnd.answer_review.length,1);assert.equal(unansweredEnd.answer_review[0].correct,false);
    const noAnswers=readJson(await call(thirdActor,snapSql(readJson(joinA).player_id)));assert.equal(noAnswers.final_rank,2,'equal scores share a place');assert.deepEqual(noAnswers.answer_review,[]);
    const hostEnd=readJson(await call(I.host,hostSnap));assert.equal(hostEnd.state,'complete');assert.equal(hostEnd.players[0].score,200);assert.equal(hostEnd.room_version,6);
    assert.deepEqual(hostEnd.question_report,[{index:0,stem:'Synthetic Q1',opened:true,responses:2,correct:1},{index:1,stem:'Synthetic Q2',opened:true,responses:1,correct:1}]);
    const cancelledPlayer=readJson(await call(I.actor,`select row_to_json(t) from public.classroom_v2_join('${otherRoom.join_code}','Finch') t;`));
    assert.equal((await call(I.foreign,`select public.classroom_v2_finish('${otherRoom.room_id}',0);`)).trim().split('\n').at(-1),'t');
    const cancelled=readJson(await call(I.actor,`select row_to_json(t) from public.classroom_v2_snapshot('${otherRoom.room_id}','${cancelledPlayer.player_id}') t;`));
    assert.equal(cancelled.state,'complete');assert.equal(cancelled.question_id,null);assert.equal(cancelled.final_rank,null);assert.deepEqual(cancelled.answer_review,[]);
    const unplayed=readJson(await call(I.foreign,`select row_to_json(t) from public.classroom_v2_host_snapshot('${otherRoom.room_id}') t;`)).question_report;
    assert.ok(unplayed.every(item=>!item.opened&&item.responses===0&&item.correct===0),'unplayed questions are identified separately');
    await psql(`update classroom_v2_private.hosts set enabled=false where actor='${I.host}';`);
    await assert.rejects(call(I.host,`select public.classroom_v2_finish('${created.room_id}',6);`),/FORBIDDEN/);
    await psql(`update classroom_v2_private.hosts set enabled=true where actor='${I.host}';`);
    await psql(`update classroom_v2_private.rooms set expires_at=clock_timestamp()-interval '1 second' where id='${created.room_id}';`);
    await assert.rejects(call(I.actor,joinSql),/ROOM_UNAVAILABLE/);
    await assert.rejects(call(I.actor,snapSql(firstJoin.player_id)),/ROOM_UNAVAILABLE/);
    await assert.rejects(call(I.host,hostSnap),/ROOM_UNAVAILABLE/);
    console.log('Staging full flow passed: create/retry, actor join/reconnect, lobby/start, answers, next/finish, receipt privacy and version guards.');
  }
  await psql(staging ? `insert into lab_private.rooms(id,host_actor,create_request_id,create_payload,per_question_seconds,state,active_index) values ('${I.room}','${I.host}',gen_random_uuid(),'[]',30,'active',0);
    insert into lab_private.players(id,room_id,actor,alias) values ('${I.player}','${I.room}','${I.actor}','A'),('${I.other}','${I.room}','${I.otherActor}','B');
    insert into lab_private.questions(id,room_id,index,stem,options,correct_index,content_revision) values ('${I.q}','${I.room}',0,'Synthetic','["A","B"]',0,'fixture-v1');
    insert into lab_private.windows(room_id,question_id,opens_at,closes_at) values ('${I.room}','${I.q}',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes');` : `insert into lab_private.rooms(id,host_actor,state,active_index) values ('${I.room}','${I.host}','active',0);
    insert into lab_private.players(id,room_id,actor) values ('${I.player}','${I.room}','${I.actor}'),('${I.other}','${I.room}','${I.otherActor}');
    insert into lab_private.questions(id,room_id,index,stem,options,correct_index,content_revision,opens_at,closes_at) values ('${I.q}','${I.room}',0,'Synthetic','["A","B"]',0,'fixture-v1',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes');`);
  await assert.rejects(psql(`set role lab_client; select * from lab_private.receipts;`),/permission denied/i);
  await assert.rejects(psql(`set role lab_anon; select * from lab_api.snapshot('${I.room}','${I.player}');`),/permission denied/i);
  await assert.rejects(psql(`set role lab_client; select * from lab_api.snapshot('${I.room}','${I.player}');`),/FORBIDDEN/);
  await assert.rejects(psql(`set role lab_client; select set_config('lab.actor','${I.actor}',false); select * from lab_api.answer('${I.room}','${I.other}','${I.q}',0::smallint);`),/FORBIDDEN/);
  const hidden=await psql(`set role lab_client; select set_config('lab.actor','${I.actor}',false); select correct_index is null and receipt_id is null from lab_api.snapshot('${I.room}','${I.player}');`);
  assert.equal(hidden.trim().split('\n').at(-1),'t','unanswered snapshots do not expose this lab key');
  const a=psql(`begin;set role lab_client;select set_config('lab.actor','${I.actor}',false);select row_to_json(t) from lab_api.answer('${I.room}','${I.player}','${I.q}',0::smallint) t;select pg_sleep(6);commit;`,'classroom-race-a');
  a.catch(()=>{}); // A later setup failure may remove the owned container first.
  await until(async()=> (await psql("select exists(select 1 from pg_stat_activity where application_name='classroom-race-a' and wait_event='PgSleep')")).trim()==='t','first answer acquired room lock');
  const b=psql(`begin;set role lab_client;select set_config('lab.actor','${I.actor}',false);select row_to_json(t) from lab_api.answer('${I.room}','${I.player}','${I.q}',1::smallint) t;commit;`,'classroom-race-b');
  const c=psql(`begin;set role lab_client;select set_config('lab.actor','${I.host}',false);select ${staging?'lab_api.next':'lab_api.finish'}('${I.room}',0);commit;`,'classroom-race-host');
  b.catch(()=>{});c.catch(()=>{});
  await until(async()=> (await psql("select count(*) from pg_stat_activity where application_name in ('classroom-race-b','classroom-race-host') and wait_event_type='Lock'")).trim()==='2','answer retry and host waiting for lock');
  const [ra,rb,rc]=await Promise.all([a,b,c]);
  const extract = out=>JSON.parse(out.split('\n').find(line=>line.startsWith('{')));
  const first=extract(ra),retried=extract(rb);
  assert.deepEqual(retried,first);assert.equal(first.accepted_choice,0);assert.equal(first.points,100);assert.equal(first.score,100);
  assert.equal(rc.trim().split('\n').at(-1),'f','stale host version must not finish room');
  assert.equal((await psql(`select (select count(*) from lab_private.receipts where room_id='${I.room}')::text||':'||(select score from lab_private.players where id='${I.player}')::text`)).trim(),'1:100');
  // A failure after the score update must roll back both the update and insert.
  await psql("create function lab_private.reject_receipt() returns trigger language plpgsql as $$ begin raise exception 'SIMULATED_FAILURE'; end $$; create trigger receipt_failure before insert on lab_private.receipts for each row execute function lab_private.reject_receipt();");
  await assert.rejects(psql(`set role lab_client; select set_config('lab.actor','${I.otherActor}',false); select * from lab_api.answer('${I.room}','${I.other}','${I.q}',0::smallint);`),/SIMULATED_FAILURE/);
  assert.equal((await psql(`select (select count(*) from lab_private.receipts where player_id='${I.other}')::text||':'||(select score from lab_private.players where id='${I.other}')::text`)).trim(),'0:0');
  await psql('drop trigger receipt_failure on lab_private.receipts');
  await assert.rejects(psql(`delete from lab_private.receipts where player_id='${I.player}'`),/IMMUTABLE/);
  // Queue a submission before expiry behind a held room lock; the server must
  // measure the deadline after acquiring that lock, not at request arrival.
  const room2='10000000-0000-4000-8000-000000000002', q2='50000000-0000-4000-8000-000000000002';
  await psql(staging ? `insert into lab_private.rooms(id,host_actor,create_request_id,create_payload,per_question_seconds,state,active_index) values ('${room2}','${I.host}',gen_random_uuid(),'[]',30,'active',0);
    insert into lab_private.players(id,room_id,actor,alias) values ('30000000-0000-4000-8000-000000000003','${room2}','${I.actor}','A');
    insert into lab_private.questions(id,room_id,index,stem,options,correct_index,content_revision) values ('${q2}','${room2}',0,'Synthetic','["A","B"]',0,'fixture-v1');
    insert into lab_private.windows(room_id,question_id,opens_at,closes_at) values ('${room2}','${q2}',clock_timestamp()-interval '1 second',clock_timestamp()+interval '4 seconds');` : `insert into lab_private.rooms(id,host_actor,state,active_index) values ('${room2}','${I.host}','active',0);
    insert into lab_private.players(id,room_id,actor) values ('30000000-0000-4000-8000-000000000003','${room2}','${I.actor}');
    insert into lab_private.questions(id,room_id,index,stem,options,correct_index,content_revision,opens_at,closes_at) values ('${q2}','${room2}',0,'Synthetic','["A","B"]',0,'fixture-v1',clock_timestamp()-interval '1 second',clock_timestamp()+interval '4 seconds');`);
  const holding=psql(`begin;select id from lab_private.rooms where id='${room2}' for update;select pg_sleep(7);commit;`,'classroom-deadline-holder');
  holding.catch(()=>{});
  await until(async()=> (await psql("select exists(select 1 from pg_stat_activity where application_name='classroom-deadline-holder' and wait_event='PgSleep')")).trim()==='t','deadline room lock acquired');
  const late=psql(`set role lab_client;select set_config('lab.actor','${I.actor}',false);select * from lab_api.answer('${room2}','30000000-0000-4000-8000-000000000003','${q2}',0::smallint);`,'classroom-deadline-answer').then(output=>({output}),error=>({error}));
  await until(async()=> (await psql(`select exists(select 1 from pg_stat_activity where application_name='classroom-deadline-answer' and wait_event_type='Lock') and clock_timestamp() < (select closes_at from ${staging?'lab_private.windows':'lab_private.questions'} where ${staging?'question_id':'id'}='${q2}')`)).trim()==='t','submission waiting for lock before deadline');
  const lateResult=await late;assert.match(lateResult.error?.message??'',/OUTSIDE_WINDOW/);await holding;
  assert.equal((await psql(`select (select count(*) from lab_private.receipts where room_id='${room2}')::text||':'||(select score from lab_private.players where room_id='${room2}')::text`)).trim(),'0:0');
  if(staging) {
    // Reverse the first race: host next commits first, so the waiting answer
    // for the former question must be rejected without awarding anything.
    const room3='10000000-0000-4000-8000-000000000003',oldQ='50000000-0000-4000-8000-000000000003',newQ='50000000-0000-4000-8000-000000000004',player3='30000000-0000-4000-8000-000000000004';
    await psql(`insert into lab_private.rooms(id,host_actor,create_request_id,create_payload,per_question_seconds,state,active_index) values ('${room3}','${I.host}',gen_random_uuid(),'[]',30,'active',0);
      insert into lab_private.players(id,room_id,actor,alias) values ('${player3}','${room3}','${I.actor}','A');
      insert into lab_private.questions(id,room_id,index,stem,options,correct_index,content_revision) values ('${oldQ}','${room3}',0,'Old','["A","B"]',0,'v1'),('${newQ}','${room3}',1,'New','["A","B"]',1,'v1');
      insert into lab_private.windows(room_id,question_id,opens_at,closes_at) values ('${room3}','${oldQ}',clock_timestamp()-interval '1 second',clock_timestamp()+interval '30 seconds');`);
    const advancing=psql(`begin;set role lab_client;select set_config('lab.actor','${I.host}',false);select lab_api.next('${room3}',0);select pg_sleep(6);commit;`,'classroom-next-holder');advancing.catch(()=>{});
    await until(async()=> (await psql("select exists(select 1 from pg_stat_activity where application_name='classroom-next-holder' and wait_event='PgSleep')")).trim()==='t','host next acquired room lock');
    const stale=psql(`set role lab_client;select set_config('lab.actor','${I.actor}',false);select * from lab_api.answer('${room3}','${player3}','${oldQ}',0::smallint);`,'classroom-stale-answer').then(output=>({output}),error=>({error}));
    await until(async()=> (await psql("select exists(select 1 from pg_stat_activity where application_name='classroom-stale-answer' and wait_event_type='Lock')")).trim()==='t','old answer waits behind host next');
    const staleResult=await stale;assert.match(staleResult.error?.message??'',/STALE_QUESTION/);await advancing;
    assert.equal((await psql(`select (select count(*) from lab_private.receipts where room_id='${room3}')::text||':'||(select score from lab_private.players where id='${player3}')::text||':'||(select active_index from lab_private.rooms where id='${room3}')::text`)).trim(),'0:0:1');
  }
  console.log(`Real Postgres ${staging?'staging candidate':'lab'} passed: role/owner denial, hidden unanswered key, duplicate answer and stale host serialization, deadline after lock, immutable receipts, and transactional rollback.`);
} finally { if(created) await docker('rm','-f',name).catch(()=>{}); }
