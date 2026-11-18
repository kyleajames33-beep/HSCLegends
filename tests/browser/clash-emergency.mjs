// Resolve the test answer from the host's practice fixture on the test runner.
import { loadSourceModule } from '../support/source-harness.mjs';
import { QUESTIONS } from '../../prototypes/lab-tycoon/src/content.mjs';

const liveGame = loadSourceModule('lib/live-game.ts', { react: {}, '@supabase/supabase-js': {} });
const { PRACTICE_BANK } = loadSourceModule('lib/clash/questions.ts', {
  '@/lib/live-game': liveGame, '@/prototypes/lab-tycoon/src/content.mjs': { QUESTIONS },
});

export async function answerEmergency(page, correct) {
  const dialog = page.getByRole('dialog', { name: 'Out of energy' });
  await dialog.locator('button:enabled').first().waitFor({ timeout: 10000 });
  const text = await dialog.innerText();
  const question = PRACTICE_BANK.find(q => text.includes(q.stem));
  if (!question) throw Error('Emergency question is missing from the practice fixture');
  const choice = correct ? question.correct_index : (question.correct_index + 1) % question.options.length;
  await dialog.getByRole('button').nth(choice).click();
}
