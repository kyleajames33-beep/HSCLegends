import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSourceModule, textContent } from '../support/source-harness.mjs';

function deferred() { let resolve, reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject}; }
function harness(path) {
  const slots=[]; let cursor=0, dirty=false, pending=[], mounted=true, updatesAfterUnmount=0;
  const auth={user:null,loading:false}; const requests=[]; const redirects=[];
  const equal=(a,b)=>a && b && a.length===b.length && a.every((v,i)=>Object.is(v,b[i]));
  const react={
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial; return [slots[i], value=>{if(!mounted)updatesAfterUnmount++;const next=typeof value==='function'?value(slots[i]):value;if(!Object.is(slots[i],next)){slots[i]=next;dirty=true}}]; },
    useEffect(fn,deps) { const i=cursor++; if(!slots[i] || !equal(slots[i].deps,deps)) pending.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()}}); },
    useEffectEvent(fn) { const i=cursor++; if(!slots[i]) { const cell={fn}; cell.call=(...args)=>cell.fn(...args);slots[i]=cell; } slots[i].fn=fn;return slots[i].call; },
  };
  const request=(type,owner)=>{const d=deferred();requests.push({type,owner,...d});return d.promise};
  const sb={rpc:(name)=>request(name),from:()=>({select:()=>({eq:(_field,owner)=>({maybeSingle:()=>request('profile',owner)})})})};
  const router={replace:(url)=>redirects.push(url)};
  const Page=loadSourceModule(path,{react,'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},'next/navigation':{useRouter:()=>router},'@/lib/supabase/client':{createClient:()=>sb},'@/lib/use-user':{useUser:()=>auth}}).default;
  async function render({effects=true}={}) { let tree;for(let n=0;n<10;n++){cursor=0;dirty=false;tree=Page({});if(effects){const work=pending;pending=[];for(const run of work)run()}await Promise.resolve();await Promise.resolve();if(!dirty)return tree;}throw Error('did not settle'); }
  function unmount(){mounted=false;for(const slot of slots)slot?.cleanup?.();}
  return {auth,requests,redirects,render,unmount,get updatesAfterUnmount(){return updatesAfterUnmount}};
}
const select=(h,type)=>{const i=h.requests.findIndex(r=>r.type===type);assert.notEqual(i,-1,`missing ${type}`);return h.requests.splice(i,1)[0]};
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};

test('wallet never shows a previous account or allows late results to start a wallet read',async()=>{
  const h=harness('components/wallet-chip.tsx');h.auth.user={id:'a'};await h.render();
  select(h,'grant_welcome_bonus').resolve({data:15,error:null});await flush();
  select(h,'get_wallet').resolve({data:{coins:42,streak:3},error:null});await flush();
  let tree=await h.render();assert.match(textContent(tree),/42/);assert.match(textContent(tree),/Welcome bonus \+15/);
  h.auth.user={id:'b'};tree=await h.render();assert.doesNotMatch(textContent(tree),/42|Welcome bonus/);
  const b=select(h,'grant_welcome_bonus');h.auth.user={id:'a'};tree=await h.render();assert.doesNotMatch(textContent(tree),/42|Welcome bonus/);
  b.resolve({data:100,error:null});await flush();assert.equal(h.requests.filter(r=>r.type==='get_wallet').length,0);
  select(h,'grant_welcome_bonus').resolve({data:0,error:null});await flush();
  select(h,'get_wallet').resolve({data:{coins:9,streak:1},error:null});await flush();tree=await h.render();assert.match(textContent(tree),/9/);assert.doesNotMatch(textContent(tree),/Welcome bonus/);
  h.auth.user=null;tree=await h.render();assert.equal(textContent(tree),'');
});

test('wallet reads current balance after grant failure and reports read errors without inventing a balance',async()=>{
  const h=harness('components/wallet-chip.tsx');h.auth.user={id:'a'};await h.render();
  select(h,'grant_welcome_bonus').resolve({data:50,error:{message:'denied'}});await flush();
  select(h,'get_wallet').resolve({data:{coins:11,streak:0},error:null});await flush();let tree=await h.render();assert.match(textContent(tree),/11/);assert.doesNotMatch(textContent(tree),/Welcome bonus/);
  h.auth.user={id:'b'};await h.render();select(h,'grant_welcome_bonus').reject(Error('offline'));await flush();
  select(h,'get_wallet').resolve({data:null,error:{message:'offline'}});await flush();tree=await h.render();assert.match(textContent(tree),/Wallet unavailable/);assert.doesNotMatch(textContent(tree),/11|Welcome bonus/);
});

test('wallet ignores pending results after logout or unmount',async()=>{
  const h=harness('components/wallet-chip.tsx');h.auth.user={id:'a'};await h.render();
  select(h,'grant_welcome_bonus').resolve({data:5,error:null});await flush();const held=select(h,'get_wallet');
  h.auth.user=null;await h.render();h.unmount();held.resolve({data:{coins:99,streak:3},error:null});await flush();assert.equal(h.updatesAfterUnmount,0);
});

test('onboarding only redirects for a current successful profile response',async()=>{
  const h=harness('components/onboarding-gate.tsx');h.auth.user={id:'a'};await h.render();const a=select(h,'profile');
  h.auth.user={id:'b'};await h.render();const b=select(h,'profile');a.resolve({data:{year:null},error:null});await flush();assert.deepEqual(h.redirects,[]);
  b.resolve({data:{year:null},error:{message:'denied'}});await flush();assert.deepEqual(h.redirects,[]);
  h.auth.user={id:'c'};await h.render();select(h,'profile').resolve({data:{year:null},error:null});await flush();assert.deepEqual(h.redirects,['/welcome']);
});

test('onboarding ignores logout and unmount while a profile read is pending',async()=>{
  const h=harness('components/onboarding-gate.tsx');h.auth.user={id:'a'};await h.render();const a=select(h,'profile');
  h.auth.user=null;await h.render();h.unmount();a.resolve({data:{year:null},error:null});await flush();assert.deepEqual(h.redirects,[]);
});

test('old account callbacks are ignored after the new render and before old effect cleanup',async()=>{
  const wallet=harness('components/wallet-chip.tsx');wallet.auth.user={id:'a'};await wallet.render();const grant=select(wallet,'grant_welcome_bonus');
  wallet.auth.user={id:'b'};await wallet.render({effects:false});grant.resolve({data:10,error:null});await flush();
  assert.equal(wallet.requests.filter(r=>r.type==='get_wallet').length,0);
  const gate=harness('components/onboarding-gate.tsx');gate.auth.user={id:'a'};await gate.render();const profile=select(gate,'profile');
  gate.auth.user={id:'b'};await gate.render({effects:false});profile.resolve({data:{year:null},error:null});await flush();assert.deepEqual(gate.redirects,[]);
});
