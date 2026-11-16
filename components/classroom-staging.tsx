'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { initializeClassroomV2, prepareCreateRequest, type CreateRequest, type HostSnapshot, type InitResult, type StudentSnapshot } from '@/lib/classroom-v2';
import { createStagingGuestAuth } from '@/lib/classroom-v2/guest-auth';
import { createSnapshotPoller, type SnapshotPoller, type PollingStatus } from '@/lib/classroom-v2/polling';
import { estimatedSecondsRemaining, makeServerClock, type ServerClock } from '@/lib/classroom-v2/clock';
import { clearGuestRecovery, recoverGuestSession, saveGuestRecovery } from '@/lib/classroom-v2/guest-recovery';
import { clearHostRecovery, readHostRecovery, saveHostRecovery } from '@/lib/classroom-v2/host-recovery';
import { prepareTeacherDraftRequest } from '@/lib/classroom-v2/teacher-drafts.mjs';
import { ARENA_DRAFT_KEY } from '@/lib/solo-arena-recovery';
import { makeStagingInvite, normalizeStagingJoin, stagingCodeFromSearch } from '@/lib/classroom-v2/invite';
import { questionReportCsv } from '@/lib/classroom-v2/report';
import { stagingAuthStorage, type AuthStorage } from '@/lib/classroom-v2/session-storage';
import type { StagingConfig } from '@/lib/classroom-v2/staging-config';

type Client = Extract<InitResult, {status:'available'}>['client'];
type Identity = { status: 'checking'|'signed-out'|'ready'|'unavailable'; actorId: string|null; generation: number; isAnonymous: boolean|null };
type Room = { kind:'host'; id:string; code:string; codeVerified:boolean; snapshot:HostSnapshot|null } | { kind:'student'; id:string; snapshot:StudentSnapshot|null };
const initial: Identity = {status:'checking',actorId:null,generation:0,isAnonymous:null};
const durations = [15,20,30,45,60,90,120] as const;
const sample = [
  {stem:'Which organelle contains most DNA in a eukaryotic cell?',options:['Nucleus','Ribosome','Cell membrane','Cytoplasm'],correct_index:0,content_revision:'unreviewed-staging-sample-v1'},
  {stem:'What is the pH of a neutral solution at 25°C?',options:['1','7','10','14'],correct_index:1,content_revision:'unreviewed-staging-sample-v1'},
];

function Countdown({serverNow, closesAt}: {serverNow:string;closesAt:string}) {
  const [clock,setClock]=useState<ServerClock|null>(null), [now,setNow]=useState(0);
  useEffect(()=>{
    const receive=performance.now();
    const update=()=>setNow(performance.now());
    // Snapshot time estimates the deadline; the server still decides validity.
    const timer=window.setTimeout(()=>{setClock(makeServerClock(serverNow,receive));update();},0);
    const interval=window.setInterval(update,250);
    return ()=>{window.clearTimeout(timer);window.clearInterval(interval);};
  },[serverNow]);
  const remaining=clock?estimatedSecondsRemaining(clock,closesAt,now):null;
  return <p role="timer">{remaining===null?'Timer unavailable. Refresh the room to sync.':remaining===0?'Time is up (estimate). Wait for the host.':`${remaining} seconds remaining (estimate)`}</p>;
}

/** Isolated classroom test UI; no access to the shared application's client. */
export default function ClassroomStaging({config}: {config:StagingConfig}) {
  const [identity,setIdentity] = useState<Identity>(initial), [room,setRoom] = useState<Room|null>(null);
  const [message,setMessage] = useState(''), [status,setStatus] = useState<PollingStatus>('connecting');
  const [code,setCode] = useState(''), [alias,setAlias] = useState(''), [email,setEmail] = useState(''), [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [temporarySession,setTemporarySession] = useState(false);
  const [questionSeconds,setQuestionSeconds] = useState<number>(30);
  const [attemptKind,setAttemptKind] = useState<'sample'|'draft'|null>(null);
  const [pendingQuestion,setPendingQuestion] = useState<string|null>(null);
  const [studentClock,setStudentClock] = useState<{questionId:string;serverNow:string;clock:ServerClock|null}|null>(null), [studentNow,setStudentNow] = useState(0);
  const sb = useRef<SupabaseClient|null>(null), auth = useRef<ReturnType<typeof createStagingGuestAuth>|null>(null);
  const roomStorage = useRef<AuthStorage|null>(null), reconnect = useRef<{actorId:string;kind:Room['kind']}|null>(null);
  const reconnectActions = useRef<{host:()=>void;student:()=>void}|null>(null);
  const actor = useRef<Identity>(initial), client = useRef<Client|null>(null), polling = useRef<SnapshotPoller|null>(null);
  const epoch = useRef(0), locked = useRef(false), authLocked = useRef(false), activeRoom = useRef<Room|null>(null), answerInFlight = useRef(false), pendingAnswer = useRef<string|null>(null), createRequest = useRef<CreateRequest|null>(null), createOwner = useRef<string|null>(null), requestKind = useRef<'sample'|'draft'|null>(null);
  function showRoom(value:Room|null) {activeRoom.current=value;setRoom(value);}

  useEffect(()=>{
    const invite=stagingCodeFromSearch(window.location?.search ?? '');
    if(!invite)return;
    let active=true;
    // Preserve anything typed before the browser has applied the invite.
    void Promise.resolve().then(()=>{if(active)setCode(current=>current||invite);});
    return ()=>{active=false;};
  },[]);

  const studentSnapshot=room?.kind==='student'?room.snapshot:null;
  const studentServerNow=studentSnapshot?.state==='active'?studentSnapshot.serverNow:null;
  const studentQuestionId=studentSnapshot?.state==='active'?studentSnapshot.question?.id:null;
  useEffect(()=>{
    if(!studentServerNow||!studentQuestionId)return;
    const received=performance.now();
    const update=()=>setStudentNow(performance.now());
    const first=window.setTimeout(()=>{setStudentClock({questionId:studentQuestionId,serverNow:studentServerNow,clock:makeServerClock(studentServerNow,received)});update();},0);
    const timer=window.setInterval(update,250);
    return ()=>{window.clearTimeout(first);window.clearInterval(timer);};
  },[studentServerNow,studentQuestionId]);
  const studentRemaining=studentClock?.clock&&studentSnapshot?.question&&studentClock.serverNow===studentServerNow&&studentClock.questionId===studentQuestionId
    ? estimatedSecondsRemaining(studentClock.clock,studentSnapshot.question.closesAt,studentNow) : null;

  useEffect(() => {
    let alive = true;
    const resolved=stagingAuthStorage(()=>window.sessionStorage,()=>window.crypto.randomUUID());
    roomStorage.current=resolved.storage;
    void Promise.resolve().then(()=>{if(alive)setTemporarySession(resolved.temporary);});
    const database = createClient(config.url, config.publicKey, {auth:{storage:resolved.storage,storageKey:`hsc-classroom-staging-${config.projectRef}`,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    const gate = createStagingGuestAuth({enabled:true,target:'staging',projectUrl:config.url}, database.auth);
    sb.current = database; auth.current = gate;
    const unsubscribe = gate.subscribe(() => {
      if (!alive) return;
      const next = gate.getSnapshot();
      if(next.status==='checking' && activeRoom.current && actor.current.status==='ready' && actor.current.actorId) reconnect.current={actorId:actor.current.actorId,kind:activeRoom.current.kind};
      if (next.generation !== actor.current.generation || next.actorId !== actor.current.actorId) {
        epoch.current++; polling.current?.dispose(); polling.current=null; client.current?.dispose(); client.current=null;
        // Keep an uncertain create request for the same actor across token
        // refreshes. A different verified actor must never inherit it.
        const keepCreate=!!createRequest.current&&!!createOwner.current&&(next.status!=='ready'||next.actorId===createOwner.current);
        if(!keepCreate){createRequest.current=null;createOwner.current=null;requestKind.current=null;setAttemptKind(null);}
        locked.current=false; authLocked.current=false;answerInFlight.current=false;pendingAnswer.current=null;setPendingQuestion(null); setBusy(false);showRoom(null); setMessage('');
      }
      actor.current=next; setIdentity(next);
      if(next.status==='signed-out'||next.status==='unavailable') reconnect.current=null;
      if(next.status==='ready' && reconnect.current){
        const pending=reconnect.current;reconnect.current=null;
        if(pending.actorId===next.actorId){
          const generation=next.generation;setMessage('Reconnecting to your room…');
          void Promise.resolve().then(()=>{if(alive&&actor.current.status==='ready'&&actor.current.actorId===pending.actorId&&actor.current.generation===generation&&!activeRoom.current)reconnectActions.current?.[pending.kind]();});
        }
      }
    });
    void gate.start();
    const ownerEpoch=epoch;
    return () => { alive=false; ownerEpoch.current++; reconnect.current=null;unsubscribe(); polling.current?.dispose(); client.current?.dispose(); gate.dispose(); sb.current=null; auth.current=null;roomStorage.current=null; };
  }, [config.url,config.publicKey,config.projectRef]);

  async function withLock(operation: (owner:number) => Promise<void>) {
    if (locked.current || actor.current.status!=='ready') return;
    const owner=epoch.current; locked.current=true; setBusy(true); setMessage('');
    try { await operation(owner); }
    catch(error) { if(owner===epoch.current) {
      const reason=error instanceof Error?error.message:'';
      setMessage(reason==='OUTSIDE_WINDOW'?'Time is up; the server did not accept this answer. Refresh the room.':reason==='STALE_QUESTION'?'The class has moved on. Refresh the room.':reason==='ROOM_UNAVAILABLE'?'This room is unavailable or has expired.':reason==='FORBIDDEN'?'This staging account is not authorised for that action.':activeRoom.current?'The request was not confirmed. Refresh the room before trying again.':'The request was not confirmed. Check the staging connection and your details, then retry. A host must be enabled on the server.');
    } }
    finally { if(owner===epoch.current) {locked.current=false; setBusy(false);} }
  }
  async function open(owner:number): Promise<Client|null> {
    if(client.current) return client.current;
    const id=actor.current.actorId, generation=actor.current.generation, database=sb.current;
    if(!id||!database) return null;
    const result=await initializeClassroomV2({enabled:true,target:'staging',ownerId:id,isCurrentOwner: value => actor.current.actorId===value && actor.current.status==='ready',authGeneration:()=>actor.current.generation}, {rpc:(name,args)=>database.rpc(name,args)});
    if(owner!==epoch.current) {if(result.status==='available') result.client.dispose(); return null;}
    if(result.status!=='available') throw Error('STAGING_UNAVAILABLE');
    if(generation!==actor.current.generation) {result.client.dispose();return null;}
    client.current=result.client;return result.client;
  }
  function watchHost(c:Client, id:string, joinCode:string, codeVerified:boolean, owner:number) {
    polling.current?.dispose();
    let currentCode=joinCode, verified=codeVerified;
    const poller=createSnapshotPoller({read:()=>c.hostSnapshot(id),onSnapshot:snapshot=>{if(owner===epoch.current){if(snapshot.joinCode){currentCode=snapshot.joinCode;verified=true;}showRoom({kind:'host',id,code:currentCode,codeVerified:verified,snapshot});}},onStatus:s=>{if(owner===epoch.current)setStatus(s);}});
    polling.current=poller;poller.start();
  }
  function watchStudent(c:Client,id:string, owner:number) {
    polling.current?.dispose();
    const poller=createSnapshotPoller({read:()=>c.snapshot(),onSnapshot:snapshot=>{if(owner===epoch.current){if(!answerInFlight.current){pendingAnswer.current=null;setPendingQuestion(null);}showRoom({kind:'student',id,snapshot});}},onStatus:s=>{if(owner===epoch.current)setStatus(s);}});
    polling.current=poller;poller.start();
  }
  function host(kind:'sample'|'draft') { if(actor.current.isAnonymous===true||activeRoom.current||(requestKind.current&&requestKind.current!==kind))return; void withLock(async owner=>{
    if(!createRequest.current) {
      if(kind==='draft') {
        try {
          const draft=window.sessionStorage.getItem(ARENA_DRAFT_KEY);
          if(!draft)throw Error('MISSING_DRAFT');
          createRequest.current=prepareTeacherDraftRequest(draft,crypto.randomUUID(),questionSeconds,'unreviewed-teacher-draft-v1');
        } catch {setMessage('No valid teacher draft found in this tab. Prepare and preview a draft first.');return;}
      } else createRequest.current=prepareCreateRequest(crypto.randomUUID(),sample,questionSeconds);
      createOwner.current=actor.current.actorId;requestKind.current=kind;setAttemptKind(kind);
    }
    const c=await open(owner); if(!c)return;
    const result=await c.createRoom(createRequest.current);if(!result||owner!==epoch.current)return;
    let saved=false;
    try { if(actor.current.actorId&&roomStorage.current)saved=saveHostRecovery(roomStorage.current,{actorId:actor.current.actorId,projectId:config.projectRef,roomId:result.roomId,joinCode:result.joinCode}); } catch { /* Storage may be unavailable. */ }
    showRoom({kind:'host',id:result.roomId,code:result.joinCode,codeVerified:true,snapshot:null});watchHost(c,result.roomId,result.joinCode,true,owner);
    if(!saved)setMessage('This browser could not save a room shortcut. Refreshing may prevent you from resuming this game.');
  }); }
  function join() { if(activeRoom.current)return; void withLock(async owner=>{
    const joinCode=normalizeStagingJoin(code,window.location.origin);
    if(!joinCode){setMessage('Enter a valid game code or a join link from this site.');return;}
    const c=await open(owner); if(!c)return;
    const result=await c.join(joinCode,alias.trim());if(!result||owner!==epoch.current)return;
    c.bindStudent(result.roomId,result.playerId);
    let saved=false;
    try { if(actor.current.actorId&&roomStorage.current)saved=saveGuestRecovery(roomStorage.current,{actorId:actor.current.actorId,projectId:config.projectRef,roomId:result.roomId,playerId:result.playerId}); } catch { /* Storage may be unavailable. */ }
    showRoom({kind:'student',id:result.roomId,snapshot:null});watchStudent(c,result.roomId,owner);
    if(!saved)setMessage('This browser could not save a room shortcut. After refreshing, rejoin using the same signed-in session and game code.');
  }); }
  function resumeHost() { if(actor.current.isAnonymous===true||activeRoom.current)return; void withLock(async owner=>{
    const id=actor.current.actorId;if(!id)return;
    const saved=roomStorage.current?readHostRecovery(roomStorage.current,id,config.projectRef):null;if(!saved){setMessage('No previous hosted game found for this staging session.');return;}
    const c=await open(owner);if(!c)return;
    const snapshot=await c.hostSnapshot(saved.roomId);if(owner!==epoch.current)return;if(!snapshot){setMessage('The hosted room could not be restored. Try again.');return;}
    showRoom({kind:'host',id:saved.roomId,code:snapshot.joinCode??saved.joinCode,codeVerified:!!snapshot.joinCode,snapshot});watchHost(c,saved.roomId,snapshot.joinCode??saved.joinCode,!!snapshot.joinCode,owner);
  }); }
  function resume() { if(activeRoom.current)return; void withLock(async owner=>{
    const database=sb.current,storage=roomStorage.current;if(!database||!storage)return;
    client.current?.dispose();client.current=null;
    const result=await recoverGuestSession({storage,projectId:config.projectRef,
      currentActor:()=>actor.current.status==='ready'&&actor.current.actorId?{actorId:actor.current.actorId,generation:actor.current.generation}:null,
      openClient:identity=>initializeClassroomV2({enabled:true,target:'staging',ownerId:identity.actorId,isCurrentOwner:value=>actor.current.status==='ready'&&actor.current.actorId===value,authGeneration:()=>actor.current.generation},{rpc:(name,args)=>database.rpc(name,args)}),
    });
    if(owner!==epoch.current){if(result.status==='recovered')result.client.dispose();return;}
    if(result.status!=='recovered'){setMessage('Could not restore a previous game for this staging session. Join using your code.');return;}
    client.current=result.client;showRoom({kind:'student',id:result.snapshot.roomId,snapshot:result.snapshot});watchStudent(result.client,result.snapshot.roomId,owner);
  }); }
  useEffect(()=>{reconnectActions.current={host:resumeHost,student:resume};return ()=>{reconnectActions.current=null;};});
  function command(action:'start'|'next'|'finish') { void withLock(async owner=>{
    if(!client.current||room?.kind!=='host'||!room.snapshot||activeRoom.current?.kind!=='host'||activeRoom.current.id!==room.id||activeRoom.current.snapshot?.version!==room.snapshot.version){setMessage('The room changed. Refresh before trying again.');return;}
    if(action==='start' && activeRoom.current.snapshot.players.length===0){setMessage('Wait for at least one student to join before starting.');return;}
    const accepted=await client.current[action](room.id,room.snapshot.version);
    if(owner!==epoch.current)return;
    if(accepted===false)setMessage('The room changed. Refresh before trying again.');
    polling.current?.refresh();
  }); }
  function answer(index:number) { void withLock(async owner=>{
    if(!client.current||room?.kind!=='student'||!room.snapshot?.question||room.snapshot.receipt||pendingAnswer.current||studentRemaining===0||activeRoom.current?.kind!=='student'||activeRoom.current.id!==room.id||activeRoom.current.snapshot?.question?.id!==room.snapshot.question.id||activeRoom.current.snapshot?.receipt)return;
    const questionId=room.snapshot.question.id;pendingAnswer.current=questionId;answerInFlight.current=true;setPendingQuestion(questionId);
    try {
      const receipt=await client.current.answer(questionId,index);
      if(owner===epoch.current)setMessage(receipt?'Answer received. Refreshing your receipt…':'The answer was not confirmed. Refresh the room to check it.');
    } finally {
      if(owner===epoch.current){answerInFlight.current=false;polling.current?.refresh();}
    }
  }); }
  function leaveRoom() {
    const current=activeRoom.current;
    if(!current || current.id!==room?.id || actor.current.generation!==identity.generation || actor.current.actorId!==identity.actorId)return;
    epoch.current++;reconnect.current=null;polling.current?.dispose();polling.current=null;client.current?.dispose();client.current=null;
    let cleared=false;
    try { if(roomStorage.current)cleared=current.kind==='host'?clearHostRecovery(roomStorage.current):clearGuestRecovery(roomStorage.current); } catch { /* Storage may be unavailable. */ }
    locked.current=false;answerInFlight.current=false;pendingAnswer.current=null;setPendingQuestion(null);setBusy(false);
    createRequest.current=null;createOwner.current=null;requestKind.current=null;setAttemptKind(null);showRoom(null);
    setMessage(cleared?'You left the room on this device. The server game was not ended.':'You left the room on this device, but its saved shortcut could not be cleared. The server game was not ended.');
  }
  async function copyInvite() {
    const current=activeRoom.current;
    if(!current||current.kind!=='host'||!current.codeVerified||current.id!==room?.id||actor.current.generation!==identity.generation||actor.current.actorId!==identity.actorId)return;
    const owner=epoch.current, invite=makeStagingInvite(window.location.origin,current.code);
    if(!invite)return;
    try { if(!navigator.clipboard?.writeText)throw Error('unavailable');await navigator.clipboard.writeText(invite);if(owner===epoch.current&&activeRoom.current===current)setMessage('Join link copied.'); }
    catch { if(owner===epoch.current&&activeRoom.current===current)setMessage('Could not copy the link. Share the join code shown above.'); }
  }
  function downloadReport() {
    const current=activeRoom.current;
    if(!current||current.kind!=='host'||current.id!==room?.id||current.snapshot?.state!=='complete'||!current.snapshot.questionReport||actor.current.generation!==identity.generation||actor.current.actorId!==identity.actorId)return;
    let url:string|null=null;
    try {
      url=URL.createObjectURL(new Blob([questionReportCsv(current.snapshot.questionReport)],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='classroom-question-results.csv';link.click();
      const created=url;window.setTimeout(()=>URL.revokeObjectURL(created),1000);
    } catch {if(url)URL.revokeObjectURL(url);setMessage('Could not download the question results.');}
  }
  function hostLogin() { if(!sb.current || authLocked.current || actor.current.status!=='signed-out')return; const owner=epoch.current, secret=password;authLocked.current=true; setPassword(''); setBusy(true); setMessage(''); void sb.current.auth.signInWithPassword({email,password:secret}).then(({error})=>{if(owner===epoch.current&&error)setMessage('Sign-in failed. Check the staging teacher account.');}).catch(()=>{if(owner===epoch.current)setMessage('Staging sign-in unavailable.');}).finally(()=>{if(owner===epoch.current){authLocked.current=false;setBusy(false);}}); }
  function guestLogin() { if(!auth.current||authLocked.current||actor.current.status!=='signed-out')return; const owner=epoch.current;authLocked.current=true; setBusy(true); setMessage(''); void auth.current.signIn().then(result=>{if(owner===epoch.current&&(result==='failed'||result==='unavailable'))setMessage('Guest sign-in unavailable.');}).catch(()=>{if(owner===epoch.current)setMessage('Guest sign-in unavailable.');}).finally(()=>{if(owner===epoch.current){authLocked.current=false;setBusy(false);}}); }
  return <main className="staging-lab mx-auto max-w-2xl px-5 py-8">
    <style>{STAGING_CSS}</style>
    <h1 className="text-2xl font-bold">Classroom staging lab</h1>
    <p className="mt-2 dim">Test game on project {config.projectRef}. Sample questions only; this is not the live classroom.</p>
    <ol className="howto">
      <li><strong>Teacher window:</strong> sign in as teacher, then create a sample room. A join link appears.</li>
      <li><strong>Student window (incognito):</strong> open this same page, join as a test guest, then paste the link.</li>
      <li><strong>Teacher window:</strong> press Start, then Next question after each one.</li>
    </ol>
    {temporarySession && <p role="status">Browser storage is unavailable. This sign-in is temporary and cannot be restored after refreshing.</p>}
    {identity.status==='checking' && <p role="status">Checking staging session…</p>}
    {identity.status==='unavailable' && <div role="alert"><p>Staging authentication is unavailable.</p><button type="button" onClick={()=>auth.current?.retry()}>Retry sign-in check</button></div>}
    {identity.status==='signed-out' && <section className="mt-6 space-y-3">
      <div className="card">
        <h2>I&apos;m a student</h2>
        <p className="dim">No account needed.</p>
        <button type="button" disabled={busy} onClick={guestLogin}>Join as a test guest</button>
      </div>
      <div className="card">
        <h2>I&apos;m the teacher</h2>
        <p className="dim">Use the staging teacher account.</p>
        <label>Email <input value={email} type="email" onChange={e=>setEmail(e.target.value)} /></label>
        <label>Password <input value={password} type="password" onChange={e=>setPassword(e.target.value)} /></label>
        <button type="button" disabled={busy||!email||!password} onClick={hostLogin}>Sign in as teacher</button>
      </div>
    </section>}
    {identity.status==='ready' && !room && <section className="mt-6 space-y-3">
      <p>Signed in to staging{identity.isAnonymous?' as a guest':''}.</p>
      {identity.isAnonymous===true
        ? <p className="callout">Next: get the join link from the teacher&apos;s screen (it appears after they click <strong>Create sample room</strong>). Paste it below, type a name, then click <strong>Join room</strong>.</p>
        : <p className="callout">Next: pick a time per question and click <strong>Create sample room</strong>.</p>}
      <button type="button" disabled={busy} onClick={()=>{if(!activeRoom.current&&actor.current.actorId===identity.actorId&&actor.current.generation===identity.generation&&actor.current.status==='ready')void sb.current?.auth.signOut();}}>Sign out of staging</button>
      {identity.isAnonymous!==true && <><label>Time per question <select value={questionSeconds} disabled={busy||attemptKind!==null} onChange={event=>{const value=Number(event.target.value);if(!locked.current&&!requestKind.current&&!activeRoom.current&&actor.current.status==='ready'&&actor.current.isAnonymous!==true&&durations.some(seconds=>seconds===value))setQuestionSeconds(value);}}>{durations.map(seconds=><option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
      <button type="button" disabled={busy||attemptKind==='draft'} onClick={()=>host('sample')}>Create sample room</button>
      <button type="button" disabled={busy||attemptKind==='sample'} onClick={()=>host('draft')}>Host teacher draft from this tab</button>
      <p>Teacher drafts are unreviewed and contain answer keys. Preview the draft in this tab first. If creation is unconfirmed, retry the same choice.</p>
      <button type="button" disabled={busy} onClick={resumeHost}>Resume previous hosted game</button>
      <p>The host must be enabled in the staging server allowlist.</p></>}
      <h2 className="mt-4">{identity.isAnonymous===true?'Join a game':'Students only: join a game'}</h2>
      <label>Join code or link<input value={code} onChange={e=>setCode(e.target.value)} /></label>
      <label>Player name <input value={alias} maxLength={40} onChange={e=>setAlias(e.target.value)} /></label>
      <button type="button" disabled={busy||!code.trim()||!alias.trim()} onClick={join}>Join room</button>
      <button type="button" disabled={busy} onClick={resume}>Resume previous test game</button>
    </section>}
    {room && <section className="mt-6 space-y-3">
      <p role="status">Room updates: {status}. <button type="button" onClick={()=>{if(actor.current.generation===identity.generation&&actor.current.actorId===identity.actorId&&activeRoom.current?.id===room.id)polling.current?.refresh();}}>Refresh</button></p>
      <button type="button" onClick={leaveRoom}>Leave room on this device</button>
      {room.kind==='host' && <>
        <p className="callout">Next: click <strong>Copy join link</strong>, open this page in an incognito window, click <strong>Join as a test guest</strong>, paste the link and join. When the student shows up below, click <strong>Start</strong>.</p>
        <p className="dim">Join code: <strong>{room.code}</strong></p>
        {room.codeVerified && <button type="button" onClick={()=>{void copyInvite();}}>Copy join link</button>}
        {!room.codeVerified && <p>The join code was restored from this tab and has not been verified by the server.</p>}
        {!room.snapshot ? <p>Loading room…</p> : <>
          <p>Game: {room.snapshot.state}. {room.snapshot.players.length} players; {room.snapshot.answered} answered.</p>
          {room.snapshot.questionIndex!==null && <p>Question {room.snapshot.questionIndex+1} of {room.snapshot.questionTotal}</p>}
          <ul>{room.snapshot.players.map((p,i)=><li key={i}>{p.alias}: {p.score}</li>)}</ul>
          {room.snapshot.state==='complete' && room.snapshot.questionReport && <section aria-label="Question results"><h2>Question results</h2><p>Counts include submitted answers only.</p><ol>{room.snapshot.questionReport.map(q=><li key={q.index}>Question {q.index+1}: {q.stem} — {q.opened?`${q.correct} correct from ${q.responses} submitted`:'not played'}</li>)}</ol><button type="button" onClick={downloadReport}>Download question results</button></section>}
          {room.snapshot.stem && <p>{room.snapshot.stem}</p>}
          {room.snapshot.state==='active' && room.snapshot.closesAt && <Countdown serverNow={room.snapshot.serverNow} closesAt={room.snapshot.closesAt} />}
          {room.snapshot.state==='lobby' && <><button type="button" disabled={busy||room.snapshot.players.length===0} onClick={()=>command('start')}>Start</button><button type="button" disabled={busy} onClick={()=>command('finish')}>End lobby</button>{room.snapshot.players.length===0 && <p>Waiting for a student to join before starting.</p>}</>}
          {room.snapshot.state==='active' && <><button type="button" disabled={busy} onClick={()=>command('next')}>Next question</button><button type="button" disabled={busy} onClick={()=>command('finish')}>Finish</button></>}
        </>}
      </>}
      {room.kind==='student' && (!room.snapshot ? <p>Loading room…</p> : <>
        <p>Game: {room.snapshot.state}. Score: {room.snapshot.score}</p>
        {room.snapshot.state==='complete' && !room.snapshot.question && <p>The host ended the lobby before the game started.</p>}
        {room.snapshot.state==='complete' && room.snapshot.finalRank!=null && <p>Final place: {room.snapshot.finalRank} (ties share a place)</p>}
        {room.snapshot.question && <><p>Question {room.snapshot.question.index+1}{room.snapshot.questionTotal!=null?` of ${room.snapshot.questionTotal}`:''}</p><p>{room.snapshot.question.stem}</p>{room.snapshot.state==='active' && <p role="timer">{studentRemaining===null?'Timer unavailable. Refresh the room to sync.':studentRemaining===0?'Time is up (estimate). Wait for the host.':`${studentRemaining} seconds remaining (estimate)`}</p>}<div className="answers">{room.snapshot.question.options.map((option,index)=><button type="button" key={index} disabled={busy||pendingQuestion===room.snapshot?.question?.id||!!room.snapshot?.receipt||studentRemaining===0||room.snapshot?.state!=='active'} onClick={()=>answer(index)}>{option}</button>)}</div></>}
        {room.snapshot.receipt && <p>{room.snapshot.receipt.correct?'Correct':'Incorrect'} · {room.snapshot.receipt.points} points</p>}
        {room.snapshot.receipt && room.snapshot.explanation && <p>Explanation: {room.snapshot.explanation}</p>}
        {room.snapshot.state==='complete' && room.snapshot.review && <section aria-label="Review your answers"><h2>Review your answers</h2>{room.snapshot.review.length===0?<p>No answers were submitted.</p>:<ol>{room.snapshot.review.map(item=><li key={item.id}><p>Question {item.index+1}: {item.stem}</p><p>Your answer: {item.options[item.choice]} · {item.correct?'Correct':'Incorrect'}</p>{!item.correct&&<p>Correct answer: {item.options[item.correctIndex]}</p>}{item.explanation&&<p>Explanation: {item.explanation}</p>}</li>)}</ol>}</section>}
      </>)}
    </section>}
    {message && <p role="status" className="mt-4">{message}</p>}
  </main>;
}

// Scoped styling for the test-only lab so controls are visibly clickable.
const STAGING_CSS = `
.staging-lab{color:#F2F2FA;background:#0E1020;min-height:100vh;line-height:1.5}
.staging-lab .dim{color:#9A9CC0}
.staging-lab h2{font-size:1.1rem;font-weight:700;margin:0 0 .25rem}
.staging-lab .howto{margin:1rem 0 0;padding:1rem 1rem 1rem 2rem;list-style:decimal;background:#171A31;border-radius:12px}
.staging-lab .howto li{margin:.25rem 0}
.staging-lab .card{background:#171A31;border:1px solid #22264A;border-radius:12px;padding:1rem;display:flex;flex-direction:column;gap:.6rem}
.staging-lab .callout{background:#22264A;border-left:4px solid #6E5BFF;border-radius:8px;padding:.75rem 1rem}
.staging-lab label{display:flex;flex-direction:column;gap:.3rem;font-weight:600;margin:.5rem 0}
.staging-lab input,.staging-lab select{background:#0E1020;color:#F2F2FA;border:2px solid #22264A;border-radius:8px;padding:.6rem .75rem;font-size:1rem}
.staging-lab input:focus,.staging-lab select:focus{outline:none;border-color:#6E5BFF}
.staging-lab button{display:inline-block;background:#6E5BFF;color:#fff;font-weight:700;border-radius:10px;padding:.7rem 1.1rem;margin:.25rem .5rem .25rem 0;box-shadow:0 3px 0 #07080F;cursor:pointer}
.staging-lab button:active{transform:translateY(2px);box-shadow:0 1px 0 #07080F}
.staging-lab button:disabled{opacity:.4;cursor:not-allowed}
.staging-lab ul,.staging-lab ol{padding-left:1.25rem}
.staging-lab .answers{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin:.75rem 0}
.staging-lab .answers button{margin:0;padding:1.2rem 1rem;font-size:1.05rem;text-align:left}
.staging-lab .answers button:nth-child(4n+1){background:#E8445F}
.staging-lab .answers button:nth-child(4n+2){background:#2F7BEA}
.staging-lab .answers button:nth-child(4n+3){background:#F2B530;color:#1a1300}
.staging-lab .answers button:nth-child(4n+4){background:#1FB070}
@media (max-width:480px){.staging-lab .answers{grid-template-columns:1fr}}
`;
