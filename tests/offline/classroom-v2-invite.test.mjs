import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStagingInvite, normalizeStagingJoin, stagingCodeFromSearch } from '../../lib/classroom-v2/invite.ts';
const code='00000000-0000-4000-8000-000000000001';
test('staging invite is limited to current origin and a single room selector',()=>{
  assert.equal(makeStagingInvite('https://staging.example',code),`https://staging.example/classroom-staging?join=${code}`);
  assert.equal(stagingCodeFromSearch(`?join=${code}`),code);
  for(const input of [`?join=${code}&join=${code}`,'?join=bad',`?join=${'x'.repeat(5000)}`])assert.equal(stagingCodeFromSearch(input),null);
  for(const origin of ['javascript:alert(1)','https://user:secret@example.test','https://example.test/path','invalid'])assert.equal(makeStagingInvite(origin,code),null);
  assert.equal(makeStagingInvite('https://staging.example','bad'),null);
  assert.equal(normalizeStagingJoin(` ${code.toUpperCase()} `,'https://staging.example'),code);
  assert.equal(normalizeStagingJoin(`https://staging.example/classroom-staging?join=${code}`,'https://staging.example'),code);
  for(const value of [`https://evil.example/classroom-staging?join=${code}`,`https://staging.example/other?join=${code}`,`https://staging.example/classroom-staging?join=${code}&join=${code}`,`https://staging.example/classroom-staging?join=${code}#fragment`])assert.equal(normalizeStagingJoin(value,'https://staging.example'),null);
});
