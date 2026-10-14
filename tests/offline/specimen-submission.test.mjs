import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../../lib/cards.ts',import.meta.url),'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
  .replace('@/lib/specimens.mjs',new URL('../../lib/specimens.mjs',import.meta.url).href);
const { submitSpecimenAnswer } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('specimen client submits chosen index and question identity, and trusts the server result', async () => {
  const calls = [];
  const sb = { rpc: async (...args) => {
    calls.push(args);
    return { data:[{correct:false,is_new:false}], error:null };
  } };
  assert.deepEqual(await submitSpecimenAnswer(sb,'spec-tr4',2),{correct:false,is_new:false});
  assert.deepEqual(calls,[['submit_specimen_answer',{p_question_id:'spec-tr4',p_answer_index:2}]]);
});

test('failed or missing server acknowledgement never becomes an award', async () => {
  await assert.rejects(submitSpecimenAnswer({rpc:async()=>({error:{message:'auth required'}})},'spec-tr4',0),/auth required/);
  await assert.rejects(submitSpecimenAnswer({rpc:async()=>({data:[]})},'spec-tr4',0),/No specimen answer result/);
});
