import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingAuthStorage } from '../../lib/classroom-v2/session-storage.ts';
const probe='00000000-0000-4000-8000-000000000001';
const memory=()=>{const entries=new Map();return {entries,getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};};
test('usable session storage is tested without leaving a probe or changing existing data',()=>{
 const storage=memory();storage.setItem('existing','value');const result=stagingAuthStorage(()=>storage,()=>probe);
 assert.equal(result.temporary,false);assert.equal(result.storage,storage);assert.deepEqual([...storage.entries],[['existing','value']]);
});
test('blocked or silently failing storage uses a fresh isolated memory store',()=>{
 for(const get of [()=>{throw Error('blocked');},()=>({getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{}}),()=>({getItem:()=>null,setItem:()=>{},removeItem:()=>{}})]){
  const first=stagingAuthStorage(get,()=>probe),second=stagingAuthStorage(get,()=>probe);assert.equal(first.temporary,true);
  first.storage.setItem('token','synthetic');assert.equal(first.storage.getItem('token'),'synthetic');assert.equal(second.storage.getItem('token'),null);first.storage.removeItem('token');assert.equal(first.storage.getItem('token'),null);
 }
});
