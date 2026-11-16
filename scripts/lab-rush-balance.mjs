// Deterministic planning model, not the game implementation. See docs/LAB_RUSH_RULES.md.
// The player answers with a fixed accuracy pattern and active-time cost, buys
// at most one upgrade as soon as affordable, and never spends blast charge.
const upgrades = { none: 0, income: 30, attack: 45, time: 60 };
function simulate(kit, secondsPerAnswer, choice, pattern) {
  let seconds = kit === 'time' ? 105 : 90;
  let hp = 100, cash = 0, earned = 0, correct = 0, attempts = 0, bought = false;
  while (hp > 0 && seconds > secondsPerAnswer && correct < 10) {
    seconds -= secondsPerAnswer;
    const isCorrect = pattern[attempts++ % pattern.length];
    if (!isCorrect) continue;
    correct += 1;
    const payout = bought && choice === 'income' ? 18 : 10;
    hp = Math.max(0, hp - (bought && choice === 'attack' ? 15 : 10));
    cash += payout;
    earned += payout;
    if (hp > 0 && !bought && choice !== 'none' && cash >= upgrades[choice]) {
      cash -= upgrades[choice]; bought = true;
      if (choice === 'time') seconds += 15;
    }
  }
  return { kit, secondsPerAnswer, accuracy: pattern.length === 1 ? '100%' : '2/3', choice, attempts, correct, hp, earned, bought, secondsLeft: seconds };
}
const rows = [];
for (const speed of [6, 12, 18]) for (const pattern of [[true], [true, true, false]]) for (const kit of ['blast', 'time']) for (const choice of Object.keys(upgrades)) rows.push(simulate(kit, speed, choice, pattern));
console.table(rows);
