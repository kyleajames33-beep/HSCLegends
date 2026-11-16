import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual defeat handler with an explicit backend double. This checks
// what the player is told when the unlock/reward request succeeds or fails.
function campaignHandler(name, context) {
  const source = readFileSync(new URL('../../app/campaign/page.tsx', import.meta.url), 'utf8');
  const file = ts.createSourceFile('campaign.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  function visit(child) {
    if (ts.isFunctionDeclaration(child) && child.name?.text === name) node = child;
    ts.forEachChild(child, visit);
  }
  visit(file);
  assert.ok(node, `actual campaign ${name} handler exists`);
  const js = ts.transpileModule(node.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${js}; ${name}`, context);
}
function setup(campaignDefeat) {
  const seen = { victory: [], errors: [], bosses: [], clear: [] };
  const ctx = {
    defeatedRef: { current: false }, battleIdRef: { current: 1 }, active: 'chemistry', elapsed: 8, stage: 1, sb: {},
    setMyClear() {}, celebrate() {}, campaignDefeat,
    setVictory: value => seen.victory.push(value), setErr: value => seen.errors.push(value),
    setBosses: fn => seen.bosses.push(fn),
    campaignLoot: async () => null, setLoot() {},
    recordCampaignClear: async (...args) => { seen.clear.push(args); },
    campaignLeaderboard: async () => [], setClears() {},
    msg: error => error.message,
  };
  return { seen, context: ctx, invoke: campaignHandler('onBossDefeated', ctx) };
}

test('failed victory claim does not invent an unlocked stage or reward', async () => {
  const { seen, invoke } = setup(async () => { throw new Error('offline'); });
  await invoke();
  assert.deepEqual(seen.victory, []);
  assert.deepEqual(seen.bosses, []);
  assert.deepEqual(seen.clear, []);
  assert.deepEqual(seen.errors, ['offline']);
});

test('confirmed victory uses the actual server result once', async () => {
  const result = { stage: 2, max_hp: 200, reward: 25 };
  let calls = 0;
  const { seen, invoke } = setup(async () => { calls++; return result; });
  await invoke(); await invoke();
  assert.equal(calls, 1);
  assert.deepEqual(seen.victory, [result]);
  assert.equal(seen.bosses.length, 1);
});

test('a late claim result cannot overwrite a replacement battle', async () => {
  let resolveClaim;
  const { seen, context, invoke } = setup(() => new Promise(resolve => { resolveClaim = resolve; }));
  const pending = invoke();
  context.battleIdRef.current++;
  resolveClaim({ stage: 2, max_hp: 200, reward: 25 });
  await pending;
  assert.deepEqual(seen.victory, []);
  assert.deepEqual(seen.bosses, []);
  assert.deepEqual(seen.clear, []);
});

test('repeated strike handlers cannot spend energy twice or reuse old boss HP', () => {
  const health = [], energy = [];
  const ctx = {
    energyRef: { current: 2 }, bossHpRef: { current: 100 }, defeatedRef: { current: false },
    battleIdRef: { current: 1 }, renderedBattleId: 1, questionVersionRef: { current: 1 }, renderedQuestionVersion: 1,
    battling: true, comboRef: { current: 0 }, HIT_COST: 1, HIT_DMG: 14,
    setAp: value => energy.push(value), setBhp: value => health.push(value), triggerFx() {}, onBossDefeated() {},
  };
  ctx.strikeDamage = campaignHandler('strikeDamage', ctx);
  ctx.applyToBoss = campaignHandler('applyToBoss', ctx);
  const hit = campaignHandler('hitBoss', ctx);
  hit(); hit(); hit();
  assert.deepEqual(health, [86, 72]);
  assert.deepEqual(energy, [1, 0]);
});

test('displayed strike damage follows the same combo thresholds used by attacks', () => {
  const damage = campaignHandler('strikeDamage', { HIT_DMG: 14 });
  assert.deepEqual([0, 2, 3, 4, 5, 8].map(damage), [14, 14, 21, 21, 28, 28]);
});

test('block then answer before a render negates the charge and consumes the shield', () => {
  const outcomes = [], health = [];
  const ctx = {
    active: 'chemistry', q: { id: 'q1', subject: 'chemistry', topic: 'equilibrium', stem: 'Test', options: ['Yes', 'No'], explanation: 'Because', correct_index: 0 },
    answered: null, victory: null, runFailed: false, battling: true,
    energyRef: { current: 1 }, bossHpRef: { current: 100 }, playerHpRef: { current: 70 },
    shieldRef: { current: false }, chargingRef: { current: true }, comboRef: { current: 0 },
    answerLockRef: { current: false }, defeatedRef: { current: false },
    battleIdRef: { current: 1 }, renderedBattleId: 1, questionVersionRef: { current: 1 }, renderedQuestionVersion: 1,
    BLOCK_COST: 1, BLOCK_HEAL: 16, PLAYER_MAX_HP: 100, PLAYER_HIT: 14, CHARGE_DMG: 30, bmax: 100,
    timeLeft: 12, QUESTION_TIME: 15, MAX_AP: 5,
    setAp() {}, setShielded() {}, setBossCharging() {}, setCombo() {}, setFlash() {}, setMissed() {},
    setPlayerHp: value => health.push(value), setAnswered: value => outcomes.push(value),
    setRunFailed() { throw new Error('blocked answer should not knock out the player'); },
    triggerFx() { throw new Error('blocked answer should not deal damage'); },
    window: { setTimeout() {} }, sb: { rpc: () => Promise.resolve({}) },
  };
  campaignHandler('blockMove', ctx)();
  campaignHandler('answer', ctx)(1);
  assert.deepEqual(health, [86]);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].blocked, true);
  assert.equal(outcomes[0].chargeLanded, false);
  assert.equal(ctx.shieldRef.current, false);
  assert.equal(ctx.chargingRef.current, false);
});

test('an answer callback from a previous question cannot submit in the current question', () => {
  let submitted = false;
  const ctx = {
    active: 'chemistry', q: { correct_index: 0 }, answered: null, victory: null, runFailed: false, timeLeft: 10,
    answerLockRef: { current: false }, battleIdRef: { current: 1 }, renderedBattleId: 1,
    questionVersionRef: { current: 2 }, renderedQuestionVersion: 1,
    setAnswered() { submitted = true; },
  };
  campaignHandler('answer', ctx)(0);
  assert.equal(submitted, false);
  assert.equal(ctx.answerLockRef.current, false);
});

test('question load can be retried after failure without resetting the battle', async () => {
  let calls = 0;
  const events = { queue: [], error: [], busy: [], index: [] };
  const questions = [{ id: 'next-question' }];
  const ctx = {
    battleIdRef: { current: 7 }, questionRequestRef: { current: null }, answerLockRef: { current: true }, sb: {},
    setErr: value => events.error.push(value), setBusy: value => events.busy.push(value),
    setQueue: value => events.queue.push(value), setQi: value => events.index.push(value),
    getQuizQuestions: async () => { if (++calls === 1) throw new Error('network unavailable'); return questions; },
    msg: e => e.message,
  };
  const load = campaignHandler('loadQuestions', ctx);
  await load('chemistry', 7);
  assert.deepEqual(events.queue, []);
  assert.deepEqual(events.error, ['', 'network unavailable']);
  assert.equal(ctx.answerLockRef.current, true);
  await load('chemistry', 7);
  assert.deepEqual(events.queue, [questions]);
  assert.equal(ctx.answerLockRef.current, false);
  assert.equal(ctx.questionRequestRef.current, null);
  assert.deepEqual(events.busy, [true, false, true, false]);
});

test('stale question loads cannot replace a new battle or release its loading state', async () => {
  let resolveFirst, resolveSecond;
  const events = { queue: [], busy: [] };
  const ctx = {
    battleIdRef: { current: 1 }, questionRequestRef: { current: null }, answerLockRef: { current: true }, sb: {},
    setErr() {}, setBusy: value => events.busy.push(value), setQueue: value => events.queue.push(value), setQi() {},
    getQuizQuestions: () => new Promise(resolve => { if (!resolveFirst) resolveFirst = resolve; else resolveSecond = resolve; }),
    msg: e => e.message,
  };
  const load = campaignHandler('loadQuestions', ctx);
  const first = load('chemistry', 1);
  ctx.battleIdRef.current = 2;
  const second = load('biology', 2);
  resolveFirst([{ id: 'stale' }]);
  await first;
  assert.deepEqual(events.queue, []);
  assert.deepEqual(events.busy, [true, true]);
  assert.equal(ctx.questionRequestRef.current, 2);
  const newQuestions = [{ id: 'new' }];
  resolveSecond(newQuestions);
  await second;
  assert.deepEqual(events.queue, [newQuestions]);
  assert.deepEqual(events.busy, [true, true, false]);
});
