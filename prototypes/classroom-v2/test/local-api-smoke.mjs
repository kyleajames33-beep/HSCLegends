/**
 * Opt-in real Supabase smoke test for one hardcoded disposable local lab.
 * It creates synthetic anonymous Auth identities and leaves them in that lab.
 * It must never be pointed at a hosted or shared project.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { initializeClassroomV2, prepareCreateRequest } from '../../../lib/classroom-v2/index.ts';
import { validateLocalOptions, validateContainer, validateGatewayPort, validateFetchTarget, DB_CONTAINER, API_CONTAINER } from './local-api-safety.mjs';

const run=promisify(execFile);
const dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','HSC_LAB_ANON_KEY']) delete dockerEnv[key];
const docker=(...args)=>run('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,timeout:30000,maxBuffer:1024*1024});
const check=(condition,label)=>{if(!condition) throw new Error(label);};
let stage='configuration';
try {
  const {url,key}=validateLocalOptions(process.env);
  stage='local container identity';
  const [database,gateway]=await Promise.all([docker('inspect',DB_CONTAINER),docker('inspect',API_CONTAINER)]);
  const db=JSON.parse(database.stdout)[0], api=JSON.parse(gateway.stdout)[0];
  validateContainer(db,DB_CONTAINER,'public.ecr.aws/supabase/postgres:');
  validateContainer(api,API_CONTAINER,'public.ecr.aws/supabase/kong:');
  validateGatewayPort(api,url);
  // Redirects and non-loopback requests are rejected even if the SDK changes.
  const localFetch=(input,init)=>{validateFetchTarget(input,url);return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});};
  const sb=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:localFetch}});
  stage='synthetic anonymous identities';
  const hostAuth=sb(),studentAuth=sb(),foreignAuth=sb();
  async function guest(client) {
    const result=await client.auth.signInAnonymously();
    check(!result.error && !!result.data.user?.id && !!result.data.session?.access_token && result.data.user?.is_anonymous===true,'anonymous auth');
    const id=result.data.user.id;
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),'actor id');
    return id;
  }
  const [hostId,studentId,foreignId]=await Promise.all([guest(hostAuth),guest(studentAuth),guest(foreignAuth)]);
  check(new Set([hostId,studentId,foreignId]).size===3,'distinct identities');
  stage='disposable host provisioning';
  // Insert only the synthetic anonymous identity just created in this lab.
  const sql=`with added as (insert into classroom_v2_private.hosts(actor) select id from auth.users where id='${hostId}'::uuid and is_anonymous is true on conflict(actor) do nothing returning actor) select count(*) from added;`;
  const provisioned=await docker('exec',DB_CONTAINER,'psql','-X','-v','ON_ERROR_STOP=1','-qAt','-U','postgres','-d','postgres','-c',sql);
  check(provisioned.stdout.trim()==='1','host provision');
  async function connect(client,id) {
    const result=await initializeClassroomV2({enabled:true,target:'staging',ownerId:id,isCurrentOwner:()=>true,authGeneration:()=>0},client);
    check(result.status==='available','classroom client');return result.client;
  }
  stage='host and student lifecycle';
  const host=await connect(hostAuth,hostId),student=await connect(studentAuth,studentId);
  const draft=prepareCreateRequest(randomUUID(),[{stem:'Synthetic local question?',options:['Answer A','Answer B'],correct_index:0,content_revision:'local-smoke-v1'}],120);
  const room=await host.createRoom(draft);check(room?.roomId && room?.joinCode,'create room');
  const joined=await student.join(room.joinCode,'Local student');check(joined?.roomId===room.roomId,'student join');
  student.bindStudent(joined.roomId,joined.playerId);
  check((await student.snapshot())?.state==='lobby','lobby');
  check(await host.start(room.roomId,room.version)===true,'start');
  const question=await student.snapshot();check(question?.state==='active' && question.question && question.receipt===null,'active');
  const receipt=await student.answer(question.question.id,0);check(receipt?.correct===true && receipt.points===100,'answer');
  const duplicate=await student.answer(question.question.id,1);check(duplicate?.receiptId===receipt.receiptId && duplicate.choice===receipt.choice,'idempotent answer');
  student.dispose();
  stage='receipt recovery';
  const reconnected=await connect(studentAuth,studentId);reconnected.bindStudent(joined.roomId,joined.playerId);
  const recovered=await reconnected.snapshot();check(recovered?.receipt?.receiptId===receipt.receiptId && recovered.receipt.choice===receipt.choice,'recovered receipt');
  stage='foreign actor denial';
  const denied=await foreignAuth.rpc('classroom_v2_snapshot',{p_room:joined.roomId,p_player:joined.playerId});
  check(!!denied.error && denied.data===null,'foreign snapshot denied');
  const deniedContent=await foreignAuth.rpc('classroom_v2_teacher_questions',{p_room:joined.roomId});
  check(!!deniedContent.error && deniedContent.data===null,'foreign teacher read denied');
  const hostView=await host.hostSnapshot(room.roomId);check(hostView?.players.some(player=>player.alias==='Local student' && player.score===100),'host score');
  check(await host.next(room.roomId,hostView.version)===true,'finish');
  check((await reconnected.snapshot())?.state==='complete','complete');
  host.dispose();reconnected.dispose();
  console.log('Local Supabase smoke passed: real anonymous JWTs, host/student lifecycle, receipt recovery and foreign-actor denial.');
} catch {
  // Never log errors, response bodies, URLs, identities or credentials from the SDK.
  console.error(`Local Supabase smoke failed during ${stage}.`);
  process.exitCode=1;
}
