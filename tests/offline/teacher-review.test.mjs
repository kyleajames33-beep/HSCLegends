import test from 'node:test';
import assert from 'node:assert/strict';
import { pageHarness, elements, textContent } from '../support/source-harness.mjs';
import * as importer from '../../lib/teacher-question-import.mjs';

const row = { id: 'q1', stem: 'Which gas is produced?', options: ['Hydrogen', 'Oxygen'], correctIndex: 1, explanation: 'Oxygen is produced here.', subject: 'chemistry', year: 12, module: 'module-5', syllabusVersion: '2017', source: 'Teacher-created' };
const file = (name, data) => ({ name, size: data.length, text: async () => data });
const input = tree => elements(tree).find(node => node.type === 'input' && node.props.id === 'question-file');
const checkbox = tree => elements(tree).find(node => node.type === 'input' && node.props.type === 'checkbox');

test('teacher can inspect marked answer and provenance, track review locally, and clear checks by importing another file', async () => {
  const page = pageHarness('app/question-import/page.tsx', null, undefined, undefined, { dependencies: {
    '@/lib/teacher-question-import.mjs': importer,
    '@/lib/solo-arena': { arenaQuestionsFromDraft: () => null },
    '@/lib/solo-arena-recovery': { ARENA_DRAFT_KEY: 'draft' },
  } });
  try {
    let tree = await page.render();
    input(tree).props.onChange({ target: { files: [file('questions.json', JSON.stringify([row]))], value: 'questions.json' } });
    await page.render(); tree = await page.render();
    assert.match(textContent(tree), /B\. Oxygen \(marked correct\)/);
    assert.match(textContent(tree), /Explanation: Oxygen is produced here/);
    assert.match(textContent(tree), /Source: Teacher-created/);
    assert.match(textContent(tree), /0 of 1 checked in this session/);
    checkbox(tree).props.onChange({ target: { checked: true } });
    tree = await page.render();
    assert.match(textContent(tree), /1 of 1 checked in this session/);
    assert.equal(checkbox(tree).props.checked, true);
    input(tree).props.onChange({ target: { files: [file('new.json', JSON.stringify([row]))], value: 'new.json' } });
    await page.render(); tree = await page.render();
    assert.match(textContent(tree), /0 of 1 checked in this session/);
    assert.equal(checkbox(tree).props.checked, false);
    assert.match(textContent(tree), /Review status: unreviewed/);
  } finally { page.unmount(); }
});
