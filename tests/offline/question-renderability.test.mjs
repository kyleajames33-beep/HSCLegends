import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessQuestion } from '../../scripts/lib/question-integrity.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = { id: 'synthetic', stem: 'Which choice is correct?', options: ['first', 'second'], correct: 0, explanation: 'Synthetic example.' };

test('question markup requiring a missing image renderer is quarantined', () => {
  for (const stem of ['Consider ![alt](https://example.invalid/a.png).', 'Consider <img src="/fig.png">.', 'Consider <svg viewBox="0 0 10 10">.', 'Refer to data:image/png;base64,AAAA', 'Use <table><tr><td>2</td></tr></table>.']) {
    assert.ok(assessQuestion({ ...base, stem }).reasons.includes('inline-media-needs-supported-renderer'), stem);
  }
  assert.ok(assessQuestion({ ...base, options: ['<img src="/a">', 'second'] }).reasons.includes('inline-media-needs-supported-renderer'));
  assert.ok(assessQuestion({ ...base, explanation: 'See the diagram below: ![circuit](/circuit.png)' }).reasons.includes('explanation-visual-needs-supported-renderer'));
  // Ordinary equations and mathematical comparisons are not HTML elements.
  assert.deepEqual(assessQuestion({ ...base, stem: 'For x < 2, which graph is increasing?' }).reasons, []);
});

test('unresolved visual references are marked for review without treating every graph as missing', () => {
  for (const stem of ['Examine the graph below.', 'The diagram shown describes the system.', 'In the FIGURE ABOVE, what is measured?', 'Use the table shown below.']) {
    assert.ok(assessQuestion({ ...base, stem }).reasons.includes('figure-reference-needs-review'), stem);
  }
  for (const stem of ['What does an increasing graph show?', 'A graph is shown to be increasing.', 'Why does the image form on the retina?']) {
    assert.ok(!assessQuestion({ ...base, stem }).reasons.includes('figure-reference-needs-review'), stem);
  }
});

test('duplicate answers are checked as displayed without erasing chemistry distinctions', () => {
  for (const options of [['First   value', 'First value'], ['Café', 'Cafe\u0301'], ['first\nvalue', 'first value']]) {
    assert.ok(assessQuestion({ ...base, options }).reasons.includes('duplicate-options'));
  }
  // Chemical case, subscripts and ordinary alternatives are meaningful.
  for (const options of [['Co', 'CO'], ['H₂O', 'H2O'], ['Higher', 'Lower']]) {
    assert.ok(!assessQuestion({ ...base, options }).reasons.includes('duplicate-options'));
  }
});

test('normalizer preserves the missing-image question for human review and exits nonzero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hsc-renderability-'));
  try {
    const file = path.join(dir, 'subjects/physics/year12/module5/question-bank-data.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const row = { ...base, stem: 'Read the diagram below. ![A circuit](/fig.png)' };
    fs.writeFileSync(file, `window.HSCQuestionBankData.lesson = { questions: ${JSON.stringify([row])} };`);
    const out = path.join(dir, 'output.json');
    const result = spawnSync(process.execPath, ['--import', path.join(root, 'tests/support/deny-network.mjs'), path.join(root, 'scripts/normalise-banks.mjs'), dir, out], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), []);
    const audit = JSON.parse(fs.readFileSync(`${out}.audit.json`, 'utf8'));
    assert.equal(audit.invalid.length, 1);
    assert.ok(audit.invalid[0].reasons.includes('inline-media-needs-supported-renderer'));
    assert.ok(audit.invalid[0].reasons.includes('figure-reference-needs-review'));
    assert.equal(audit.questions[0].question.stem, row.stem);
    assert.equal(audit.questions[0].contentReview, 'not-assessed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
