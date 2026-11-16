import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { QUESTIONS } from '../../prototypes/lab-tycoon/src/content.mjs';

// Exercise the actual self-contained demo bundle without touching network or accounts.
test('sample game earns cash, buys upgrades, pauses feedback, and finishes', async () => {
  const html = await readFile(new URL('../../public/lab-rush.html', import.meta.url), 'utf8');
  const sourceRoot = new URL('../../prototypes/lab-tycoon/', import.meta.url);
  const sources = await Promise.all(['src/content.mjs', 'arcade.mjs', 'arcade.css', 'boss-rush.webp', 'lab-arena.webp'].map(file => readFile(new URL(file, sourceRoot))));
  assert.deepEqual(await readFile(new URL('../../public/art/lab-arena.webp', import.meta.url)), sources[4], 'connected and sample lab art should match');
  const hash = createHash('sha256');
  for (const source of sources) hash.update(source);
  assert.ok(html.includes(`Lab Rush source SHA-256: ${hash.digest('hex')}`), 'rebuild the public demo after changing its sources');
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script, 'self-contained demo script');
  let markup = '', buttons = [], tick, now = 1000, shownTime = '';
  const app = {
    set innerHTML(value) {
      markup = value;
      buttons = [...value.matchAll(/<button\b([^>]*)>/g)].map(([, attrs]) => ({
        dataset: { action: attrs.match(/data-action="([^"]+)"/)?.[1], id: attrs.match(/data-id="([^"]+)"/)?.[1] },
        disabled: /\bdisabled\b/.test(attrs),
        addEventListener(_name, fn) { this.click = fn; },
      })).filter(button => button.dataset.action);
    },
    querySelectorAll() { return buttons; },
  };
  const clock = { set textContent(value) { shownTime = value; }, classList: { toggle() {} } };
  const document = { querySelector(selector) { return selector === '#app' ? app : selector === '#clock' ? clock : null; } };
  const stored = new Map();
  const localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const DateDouble = class extends Date { static now() { return now; } };
  vm.runInNewContext(script, { document, localStorage, Date: DateDouble, setInterval: fn => { tick = fn; }, console }, { timeout: 1000 });
  const click = (action, id) => {
    const button = buttons.find(b => b.dataset.action === action && (id === undefined || b.dataset.id === id));
    assert.ok(button, `button ${action} ${id ?? ''}`);
    assert.equal(button.disabled, false);
    button.click();
  };
  assert.match(markup, /START RUN/);
  assert.match(markup, /Blast Kit.*90 seconds · blast deals 30 damage/);
  assert.match(markup, /Time Kit.*105 seconds · blast deals 20 damage/);
  click('loadout', 'time');
  assert.match(markup, /01:45/);
  assert.match(markup, /data-id="time" aria-pressed="true"/);
  click('loadout', 'blast');
  assert.match(markup, /01:30/);
  click('start');
  now += 5000; tick();
  assert.equal(shownTime, '01:25');
  const oldAnswer = buttons.find(b => b.dataset.action === 'answer' && b.dataset.id === '0');
  click('answer', '0');
  assert.match(markup, /\+\$10 earned/);
  now += 30000; tick(); // feedback is not question time
  click('shop'); click('resume'); click('next');
  oldAnswer.click();
  assert.match(markup, /QUESTION 2/);
  now += 1000; tick();
  assert.equal(shownTime, '01:24');
  click('answer', '2'); click('next'); click('answer', '1');
  click('shop');
  assert.match(markup, /\+\$10 → \+\$18 per correct/);
  assert.match(markup, /10 → 15 damage per correct/);
  assert.match(markup, /adds 15 seconds now/);
  click('buy', 'beaker');
  assert.match(markup, /OWNED/);
  assert.match(markup, /ACTIVE/);
  click('resume'); click('next');
  assert.match(markup, /\+\$18 FOR CORRECT/);
  assert.match(markup, /FIRE BLAST/);
  click('blast');
  assert.match(markup, /40 \/ 100 HP/);
  assert.match(markup, /CORE EXPOSED/);
  assert.match(markup, /BLAST CHARGE 0\/3/);
  now += 100000; tick();
  assert.match(markup, /RUN COMPLETE/);
  assert.equal(stored.get('hsclegends.lab-rush.best.v1'), '30');
  click('reset'); click('start');
  for (const question of QUESTIONS.slice(0, 10)) {
    click('answer', String(question.answer));
    click('next');
  }
  assert.match(markup, /Golem defeated/);
  assert.equal(stored.get('hsclegends.lab-rush.best.v1'), '100');
  click('reset'); click('start');
  for (const question of QUESTIONS.slice(0, 3)) {
    click('answer', String(question.answer));
    click('next');
  }
  click('extend');
  assert.match(markup, /01:40/);
  assert.match(markup, /BLAST CHARGE 0\/3/);
  click('answer', String((QUESTIONS[3].answer + 1) % QUESTIONS[3].answers.length));
  click('next');
  now += 200000; tick();
  assert.match(markup, /Review 1 missed question/);
  assert.ok(markup.includes(QUESTIONS[3].explanation));
  click('reset'); click('start');
  now += 90001; // The player opens the shop before the next timer tick.
  click('shop');
  assert.match(markup, /RUN COMPLETE/);
  click('reset'); click('start'); click('finish');
  assert.match(markup, /RUN COMPLETE/);
  assert.equal(stored.get('hsclegends.lab-rush.best.v1'), '100');
  // Overclock is a deliberate risk: spend now, then earn a larger reward only on a correct answer.
  click('reset'); click('start');
  for (const question of QUESTIONS.slice(0, 2)) { click('answer', String(question.answer)); click('next'); }
  const staleOverclock = buttons.find(b => b.dataset.action === 'overclock');
  click('overclock');
  staleOverclock.click(); // The retired button cannot spend again.
  assert.match(markup, /OVERCLOCK ARMED/);
  assert.match(markup, /\+\$20 FOR CORRECT/);
  assert.equal(buttons.find(b => b.dataset.action === 'overclock').disabled, true);
  click('answer', String(QUESTIONS[2].answer));
  assert.match(markup, /\+\$20 earned/);
  assert.match(markup, /20 damage.*Overclock paid off.*\$20 stake returned/);
  assert.match(markup, /LAB CASH<\/span><strong class="gold">\$40<\/strong>/);
  click('next');
  assert.match(markup, /\+\$10 FOR CORRECT/);
  click('overclock');
  click('answer', String((QUESTIONS[3].answer + 1) % QUESTIONS[3].answers.length));
  assert.match(markup, /Overclock lost/);
  assert.match(markup, /LAB CASH<\/span><strong class="gold">\$20<\/strong>/);
  click('next');
  click('finish');
  assert.match(markup, /<strong>\$40<\/strong><span>TOTAL EARNED<\/span>/, 'returned stake is not counted as earnings');
  click('reset'); click('start');
  for (const question of QUESTIONS.slice(0, 2)) { click('answer', String(question.answer)); click('next'); }
  now += 90001;
  click('overclock');
  assert.match(markup, /RUN COMPLETE/);
  click('reset'); click('loadout', 'time'); click('start');
  for (const question of QUESTIONS.slice(0, 3)) { click('answer', String(question.answer)); click('next'); }
  assert.match(markup, /FIRE BLAST · 20 DAMAGE/);
  click('blast');
  assert.match(markup, /50 \/ 100 HP/);
  click('reset');
  assert.match(markup, /data-id="blast" aria-pressed="true"/);
  assert.match(markup, /01:30/);
  // Attack Bot changes answer damage and exposure improves the blast, not answer damage.
  click('start');
  for (const question of QUESTIONS.slice(0, 5)) { click('answer', String(question.answer)); click('next'); }
  assert.match(markup, /CORE EXPOSED/);
  assert.match(markup, /FIRE BLAST · 40 DAMAGE/);
  click('shop'); click('buy', 'robot'); click('resume');
  click('answer', String(QUESTIONS[5].answer));
  assert.match(markup, /15 damage to the Reactor Golem/);
  click('next'); click('blast');
  assert.match(markup, /Golem defeated/);
  assert.match(markup, /BOSS DAMAGE<\/b> 100\/100/);
  assert.match(markup, /UPGRADES<\/b> Attack Bot/);
  assert.match(markup, /HIGHLIGHT<\/b> Reactor Golem defeated/);
  click('replay');
  assert.match(markup, /QUESTION 1/);
  assert.match(markup, /01:30/);
  assert.match(markup, /100 \/ 100 HP/);
  // Time Reactor adds time once, including if a stale purchase callback is invoked.
  click('reset'); click('loadout', 'time'); click('start');
  for (const question of QUESTIONS.slice(0, 6)) { click('answer', String(question.answer)); click('next'); }
  click('shop');
  assert.match(markup, /01:45 → 02:00/);
  const staleBuy = buttons.find(b => b.dataset.action === 'buy' && b.dataset.id === 'reactor');
  click('buy', 'reactor'); staleBuy.click();
  assert.match(markup, /02:00/);
  assert.match(markup, /ACTIVE · 15 seconds added/);
  click('resume'); click('finish');
  assert.match(markup, /KIT<\/b> Time Kit/);
  assert.match(markup, /UPGRADES<\/b> Time Reactor/);
  click('replay');
  assert.match(markup, /01:45/);
});
