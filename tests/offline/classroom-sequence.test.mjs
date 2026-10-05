import test from 'node:test';
import assert from 'node:assert/strict';
import { pageHarness, elements, textContent, memoryStorage } from '../support/source-harness.mjs';
import { classroomSequenceDouble } from '../support/classroom-sequence-double.mjs';
import { classroomFixture } from '../fixtures/classroom.mjs';
const settle = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const button = (tree, label) => elements(tree).find((node) => node.type === 'button' && textContent(node) === label);

// Runs actual page handlers against explicitly invented transport responses,
// not browsers or the server. It does not count as a classroom readiness test.
test('ACTUAL PAGE SEQUENCE + SCRIPTED TRANSPORT: host, 30 guests, two answers, cached rejoin, final scores', async () => {
  const transport = classroomSequenceDouble(); const hostStorage = memoryStorage();
  let host = pageHarness('app/host/page.tsx', transport.client(), hostStorage);
  const students = [];
  try {
    await button(await host.render(), 'Y12').props.onClick();
    for (let n = 0; n < 30; n++) {
      const storage = memoryStorage(); const sb = transport.client(); const page = pageHarness('app/join/page.tsx', sb, storage);
      const record = { page, storage, sb }; students.push(record);
      let tree = await page.render();
      const inputs = elements(tree).filter((node) => node.type === 'input');
      inputs[0].props.onChange({ target: { value: 'LAB001' } }); inputs[1].props.onChange({ target: { value: `Fixture Guest ${n + 1}` } });
      tree = await page.render(); await elements(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
      assert.match(textContent(await page.render()), /Waiting for the host/);
    }
    await settle(); await button(await host.render(), 'Start game').props.onClick(); await settle();
    for (let round = 0; round < 2; round++) {
      for (const { page } of students) {
        const tree = await page.render(); assert.match(textContent(tree), new RegExp(`Question ${round + 1}/2`));
        const answer = elements(tree).find((node) => node.type === 'AnswerTile' && node.props.index === classroomFixture.questions[round].correctIndex);
        await answer.props.onClick(); await answer.props.onClick();
        assert.match(textContent(await page.render()), /Correct!/);
      }
      if (round === 0) {
        const first = students[0]; first.page.unmount(); first.page = pageHarness('app/join/page.tsx', first.sb, first.storage);
        const tree = await first.page.render(); await elements(tree).find((node) => node.type === 'button' && /Rejoin game/.test(textContent(node))).props.onClick();
        assert.match(textContent(await first.page.render()), /acknowledged answer saved on this device/);
        host.unmount(); host = pageHarness('app/host/page.tsx', transport.client(), hostStorage);
        await button(await host.render(), 'Resume game').props.onClick();
        assert.match(textContent(await host.render()), /Question 1\/2/);
      }
      await button(await host.render(), round === 0 ? 'Next question' : 'Finish').props.onClick(); await settle();
    }
    assert.match(textContent(await host.render()), /Podium/);
    for (const { page, storage } of students) {
      const text = textContent(await page.render()); assert.match(text, /GAME OVER/); assert.match(text, /#1/); assert.match(text, /200 pts/);
      assert.equal(storage.getItem('legends_arena_live'), null);
    }
    assert.equal(transport.players.length, 30); assert.equal(transport.receipts.size, 60);
    assert.equal(transport.calls.filter((call) => call.name === 'submit_answer').length, 60);
    assert.equal(transport.calls.filter((call) => call.name === 'next_question').length, 2);
  } finally { host.unmount(); for (const { page } of students) page.unmount(); }
});
