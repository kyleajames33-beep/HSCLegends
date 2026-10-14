// Local art-review battle. No accounts, network calls or persisted rewards.
export const QUESTIONS = [
  { prompt: 'What does a catalyst change?', options: ['The activation energy', 'The reaction enthalpy', 'The equilibrium constant', 'The energy of the products'], correct: 0, why: 'A catalyst provides an alternative reaction pathway with lower activation energy. It does not change ΔH or the equilibrium constant.' },
  { prompt: 'At equilibrium, which statement is true?', options: ['Both reactions have stopped', 'Reactant and product concentrations are equal', 'Forward and reverse reaction rates are equal', 'All reactants have become products'], correct: 2, why: 'Equilibrium is dynamic: both reactions continue at equal rates. Concentrations stay constant, but need not be equal.' },
  { prompt: 'At 25 °C, what is the pH of 0.010 mol L⁻¹ HCl?', options: ['1', '2', '7', '12'], correct: 1, why: 'HCl is a strong acid. Assuming complete ionisation, [H₃O⁺] = 0.010 mol L⁻¹, so pH = −log₁₀(0.010) = 2.' },
  { prompt: 'Which change increases the rate of most reactions?', options: ['Lowering the temperature', 'Reducing reactant concentration', 'Increasing the temperature', 'Removing a catalyst'], correct: 2, why: 'A higher temperature increases the fraction of collisions with sufficient energy to overcome the activation energy.' },
  { prompt: 'Which process is oxidation?', options: ['Gain of electrons', 'Loss of electrons', 'Gain of neutrons', 'Loss of protons'], correct: 1, why: 'Oxidation is the loss of electrons; reduction is the gain of electrons.' },
  { prompt: 'For an exothermic reaction, ΔH is…', options: ['Negative', 'Positive', 'Always zero', 'Equal to the activation energy'], correct: 0, why: 'An exothermic reaction releases energy to the surroundings. Products have lower enthalpy than reactants, so ΔH < 0.' },
  { prompt: 'How many moles are in 5.85 g of NaCl? (M = 58.5 g mol⁻¹)', options: ['0.010 mol', '0.100 mol', '1.00 mol', '10.0 mol'], correct: 1, why: 'n = m/M = 5.85/58.5 = 0.100 mol.' },
  { prompt: 'Adding a catalyst to a system at equilibrium…', options: ['Favours the products', 'Favours the reactants', 'Increases the equilibrium constant', 'Leaves the equilibrium position unchanged'], correct: 3, why: 'A catalyst speeds up forward and reverse reactions. It helps a system reach equilibrium faster but does not shift the equilibrium position.' },
];

export function initialState() {
  return { playerHp: 100, bossHp: 100, energy: 0, combo: 0, question: 0, answer: null, shield: false, status: 'playing', event: 'Ready. Answer correctly to charge Spark.' };
}

export function reduceBattle(state, action) {
  if (action.type === 'reset') return initialState();
  if (state.status !== 'playing') return state;
  if (action.type === 'answer') {
    if (state.answer !== null || !Number.isInteger(action.choice) || action.choice < 0 || action.choice > 3) return state;
    const correct = action.choice === QUESTIONS[state.question % QUESTIONS.length].correct;
    const playerHp = correct || state.shield ? state.playerHp : Math.max(0, state.playerHp - 20);
    return { ...state, playerHp, energy: correct ? Math.min(5, state.energy + 1) : state.energy, combo: correct ? state.combo + 1 : 0, answer: action.choice, shield: correct ? state.shield : false, status: playerHp === 0 ? 'lost' : 'playing', event: correct ? '+1 energy · Choose an action or keep charging.' : state.shield ? 'Shield absorbed the hit.' : 'The Catalyst strikes! −20 HP' };
  }
  if (action.type === 'next') {
    return state.answer === null ? state : { ...state, question: state.question + 1, answer: null, event: 'Answer correctly to build energy.' };
  }
  const costs = { hit: 1, special: 3, block: 1 };
  const cost = costs[action.type];
  if (cost === undefined || state.energy < cost || (action.type === 'block' && state.shield)) return state;
  if (action.type === 'block') return { ...state, energy: state.energy - cost, shield: true, playerHp: Math.min(100, state.playerHp + 10), event: 'Shield ready · next wrong answer is blocked.' };
  const damage = action.type === 'special' ? 45 : state.combo >= 3 ? 21 : 14;
  const bossHp = Math.max(0, state.bossHp - damage);
  return { ...state, energy: state.energy - cost, bossHp, status: bossHp === 0 ? 'won' : 'playing', event: bossHp === 0 ? 'The Catalyst is defeated!' : `${action.type === 'special' ? 'Reactor burst' : 'Spark strike'} · −${damage} boss HP` };
}
