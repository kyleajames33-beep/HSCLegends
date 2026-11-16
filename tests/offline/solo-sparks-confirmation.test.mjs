import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, elements, textContent, memoryStorage } from '../support/source-harness.mjs';

// Actual page and hook handlers with isolated transport and React hook doubles.
// This does not exercise browser scheduling, Supabase or wallet authorization.
function setup(mode, initialUser={id:'user-1'}, options={}) {
  const slots=[];let cursor=0,dirty=false,effects=[],user=initialUser,unmounted=false,lateStateUpdates=0;
  const credits=[], quickSaves=[], questionLoads=[];
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{if(unmounted)lateStateUpdates++;const n=typeof v==='function'?v(slots[i]):v;if(!Object.is(n,slots[i])){slots[i]=n;dirty=true}}]},
    useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},
    useEffectEvent(fn){const i=cursor++;if(!slots[i])slots[i]={fn,event:(...args)=>slots[i].fn(...args)};slots[i].fn=fn;return slots[i].event},
    useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}})},
  };
  const sb={rpc(name,args){if(name==='credit_coins')return new Promise((resolve,reject)=>credits.push({resolve,reject,args}));return Promise.resolve({data:null,error:null})}};
  const window={location:{search:''},setInterval:()=>0,clearInterval(){},setTimeout:()=>0,clearTimeout(){}};
  const storage=memoryStorage();
  if(options.pending)storage.setItem('legends_pending_quick',JSON.stringify(options.pending));
  const globals={window,localStorage:storage,URLSearchParams,queueMicrotask:callback=>Promise.resolve().then(callback),...window};
  const sparks=loadSourceModule('lib/use-sparks-award.ts',{react},globals);
  const q={id:'q1',subject:'chemistry',topic:'topic',stem:'What is it?',options:['Nucleus','Other'],correct_index:0,explanation:'The nucleus.'};
  const juice={correct(){},wrong(){},flash(){},buzz(){},overlay:null};
  const deps={react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'},'next/link':{default:'a'},'next/navigation':{useRouter:()=>({push(){}})},'@/lib/supabase/client':{createClient:()=>sb},'@/lib/use-sparks-award':sparks,'@/lib/use-user':{useUser:()=>({user,loading:false})},'@/lib/questions':{getQuizQuestions:()=>options.holdQuestions?new Promise((resolve,reject)=>questionLoads.push({resolve,reject})):Promise.resolve([q]),SUBJECTS:[{id:'chemistry',label:'Chemistry'}]},'@/lib/progress':{recordQuickGame:()=>options.holdSave?new Promise((resolve,reject)=>quickSaves.push({resolve,reject})):Promise.resolve({xp_awarded:10,total_xp:10,streak:1,streak_event:'started'}),STREAK_MSG:{started:'Started'}},'@/lib/daily':{recordDailyQuiz:async()=>({counted:true,xp_awarded:10,total_xp:10,streak:1,streak_event:'started'}),getSubjectLeaderboard:async()=>[]},'@/lib/fuzzy':{isCloseEnough:(a,b)=>a.toLowerCase()===b.toLowerCase()},'@/lib/confetti':{celebrate(){}},'@/components/celebrate-lottie':{default:'Lottie'},'@/components/count-up':{default:({to,prefix=''})=>`${prefix}${to}`},'@/components/share-button':{default:'Share'},'@/components/answer-tile':{default:'AnswerTile'},'@/components/math-text':{default:({text})=>text},'@/components/juice':{useJuice:()=>juice,atEvent(){},StreakFlame:'StreakFlame'},'@/lib/powerups':{getPowerups:async()=>[],usePowerup:async()=>{},QUICKGAME_POWERUPS:[]}};
  const Page=loadSourceModule(`app/${mode}/page.tsx`,deps,globals).default;
  async function render(){let tree;for(let pass=0;pass<12;pass++){cursor=0;dirty=false;tree=Page();const pending=effects;effects=[];for(const f of pending)f();await Promise.resolve();await Promise.resolve();if(!dirty)return tree;}throw Error('Did not settle')}
  const button=(tree,label)=>elements(tree).find(e=>e.type==='button'&&textContent(e).includes(label));
  async function start(){let tree=await render();const b=button(tree,'Y12');assert.ok(b);await b.props.onClick();return render()}
  async function finish(duringRun){let tree=await start();if(duringRun){duringRun();tree=await render()}if(mode==='match'){
    let b=button(tree,'What is it?');assert.ok(b);b.props.onClick();tree=await render();b=button(tree,'Nucleus');assert.ok(b);b.props.onClick();b.props.onClick();
  } else if(mode==='type'){
    const input=elements(tree).find(e=>e.type==='input'&&e.props.placeholder==='Type your answer…');input.props.onChange({target:{value:'Nucleus'}});tree=await render();const form=elements(tree).find(e=>e.type==='form');form.props.onSubmit({preventDefault(){}});tree=await render();const done=button(tree,'Finish');done.props.onClick();done.props.onClick();
  } else {const answer=elements(tree).find(e=>e.type==='AnswerTile'&&e.props.index===0);answer.props.onClick();tree=await render();const done=button(tree,'Finish');done.props.onClick();done.props.onClick();}
  return render();}
  function unmount(){unmounted=true;for(const slot of slots)slot?.cleanup?.()}
  return {render,button,finish,credits,quickSaves,questionLoads,q,setUser:value=>{user=value},unmount,lateStateUpdates:()=>lateStateUpdates};
}

for(const mode of ['play','match','type']) {
  test(`${mode}: fulfilled RPC errors never display Sparks as received`,async()=>{
    const h=setup(mode);await h.finish();let tree=await h.render();assert.equal(h.credits.length,1);assert.match(textContent(tree),/Confirming Sparks/);assert.doesNotMatch(textContent(tree),/\+\d+\s*✨ Sparks/);
    h.credits[0].resolve({data:null,error:{message:'denied'}});tree=await h.render();assert.match(textContent(tree),/Sparks could not be confirmed/);assert.doesNotMatch(textContent(tree),/\+\d+\s*✨ Sparks/);
    await h.render();assert.equal(h.credits.length,1,'no automatic retry of non-idempotent award');
  });
  test(`${mode}: a late old award cannot confirm the new run`,async()=>{
    const h=setup(mode);let tree=await h.finish();const old=h.credits[0];h.button(tree,'Play again').props.onClick();tree=await h.render();tree=await h.finish();assert.equal(h.credits.length,2);
    old.resolve({data:100,error:null});tree=await h.render();assert.match(textContent(tree),/Confirming Sparks/);assert.doesNotMatch(textContent(tree),/\+\d+\s*✨ Sparks/);
    h.credits[1].resolve({data:120,error:null});tree=await h.render();assert.match(textContent(tree),/\+\d+\s*✨ Sparks/);
  });
  for (const failure of ['rejection','empty']) test(`${mode}: ${failure} does not confirm or automatically retry`,async()=>{
    const h=setup(mode);await h.finish();await h.render();assert.equal(h.credits.length,1);
    if(failure==='rejection')h.credits[0].reject(new Error('offline'));else h.credits[0].resolve({data:null,error:null});
    const tree=await h.render();assert.match(textContent(tree),/Sparks could not be confirmed/);assert.equal(h.credits.length,1);
  });
  test(`${mode}: account change and unmount invalidate pending award callbacks`,async()=>{
    const h=setup(mode);let tree=await h.finish();const old=h.credits[0];h.setUser({id:'user-2'});tree=await h.render();old.resolve({data:100,error:null});tree=await h.render();assert.doesNotMatch(textContent(tree),/\+\d+\s*✨ Sparks/);
    h.button(tree,'Play again').props.onClick();await h.render();await h.finish();const pending=h.credits[1];h.unmount();pending.resolve({data:200,error:null});await Promise.resolve();await Promise.resolve();assert.equal(h.lateStateUpdates(),0);
  });
  test(`${mode}: an account change does not prevent completing the game`,async()=>{
    const h=setup(mode);const tree=await h.finish(()=>h.setUser({id:'user-2'}));
    assert.match(textContent(tree),/COMPLETE/);assert.equal(h.credits.length,0);
  });
  test(`${mode}: a changing account does not strand a question load`,async()=>{
    const h=setup(mode,{id:'user-1'},{holdQuestions:true});let tree=await h.render();const loading=h.button(tree,'Y12').props.onClick();
    h.setUser({id:'user-2'});await h.render();h.questionLoads[0].resolve([h.q]);await loading;tree=await h.render();assert.match(textContent(tree),/What is it\?/);
  });
  test(`${mode}: a late question load cannot update an unmounted page`,async()=>{
    const h=setup(mode,{id:'user-1'},{holdQuestions:true});const tree=await h.render();const loading=h.button(tree,'Y12').props.onClick();
    h.unmount();h.questionLoads[0].resolve([h.q]);await loading;assert.equal(h.lateStateUpdates(),0);
  });
}

test('type: guests are not shown an unreceived Sparks amount',async()=>{
  const h=setup('type',null);const tree=await h.finish();assert.equal(h.credits.length,0);assert.doesNotMatch(textContent(tree),/\+\d+\s*✨ Sparks/);assert.match(textContent(tree),/Sign in to bank Sparks/);
});

test('play: an old result save cannot award or overwrite a newer run',async()=>{
  const h=setup('play',{id:'user-1'},{holdSave:true});let tree=await h.finish();assert.equal(h.quickSaves.length,1);
  h.button(tree,'Play again').props.onClick();await h.render();tree=await h.finish();assert.equal(h.quickSaves.length,2);
  h.quickSaves[0].resolve({xp_awarded:99,total_xp:99,streak:9,streak_event:'started'});tree=await h.render();assert.equal(h.credits.length,0);assert.doesNotMatch(textContent(tree),/99 XP/);
  h.quickSaves[1].resolve({xp_awarded:10,total_xp:10,streak:1,streak_event:'started'});await h.render();assert.equal(h.credits.length,1);
});

test('play: a deferred login save issues only one credit request',async()=>{
  const h=setup('play',{id:'user-1'},{pending:{subject:'chemistry',year:12,correct:1,total:1}});
  await h.render();await h.render();assert.equal(h.credits.length,1);
});
