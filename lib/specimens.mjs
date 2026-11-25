// Specimen Lab: picture questions built on artwork from published HSCScience lesson videos
// (lesson-video-generator, public/assets; videos listed in lib/lesson-videos.mjs plus the
// Mould video). Each question is drawn from the video's fact-checked narration, attempt or
// feedback scene, so the answer and the trap it names match what the video teaches.
// Answering a question correctly for the first time earns its Specimen card (card_catalog
// rows with source 'specimen', see supabase/migrations/20261012_specimen_cards.sql).

/**
 * @typedef {{
 *   id: string, image: string, alt: string, stem: string, options: string[],
 *   correctIndex: number, explanation: string,
 *   card: { id: string, name: string, rarity: 'common' | 'rare' | 'epic', art: string, flavor: string },
 * }} SpecimenQuestion
 * @typedef {{
 *   id: string, subject: 'biology' | 'chemistry', title: string, lessonId: string,
 *   video: { youtubeId: string, title: string }, questions: SpecimenQuestion[],
 * }} SpecimenSet
 */

const CLASSIFY = ['Static equilibrium', 'Dynamic equilibrium', 'Neither'];

/** @type {SpecimenSet[]} */
export const SPECIMEN_SETS = [
  {
    id: 'equilibrium',
    subject: 'chemistry',
    title: 'Static, dynamic or neither?',
    lessonId: 'chem-y12-m5-l01',
    video: { youtubeId: 'zaC5iXuovKg', title: 'Static and Dynamic Equilibrium' },
    questions: [
      {
        id: 'spec-soda-sealed',
        image: 'soda-sealed',
        alt: 'A sealed bottle of soda water',
        stem: 'This soda water has sat in the fridge for a week with the cap on tight, and nothing about it changes. What is happening at the surface of the water?',
        options: [
          'Nothing. All the particles have stopped moving.',
          'Carbon dioxide escapes from the water and dissolves back in at the same rate.',
          'All of the carbon dioxide has already escaped into the gas space.',
          'Carbon dioxide dissolves faster than it escapes, so the gas space slowly empties.',
        ],
        correctIndex: 1,
        explanation: 'The bottle is closed, so escaping carbon dioxide builds up above the water until the return rate catches up with the escape rate. Both processes keep going at equal rates. That is dynamic equilibrium: equal rates, not equal amounts.',
        card: { id: 'spec-soda-sealed', name: 'Sealed Soda', rarity: 'common', art: 'soda-sealed', flavor: 'Looks still. Busy both ways.' },
      },
      {
        id: 'spec-soda-open',
        image: 'soda-open',
        alt: 'An open bottle of soda water with its cap beside it',
        stem: 'Now the cap comes off. Why can the soda no longer reach equilibrium?',
        options: [
          'Escaping carbon dioxide drifts into the room and rarely returns, so escape stays faster than return.',
          'Opening the bottle stops carbon dioxide from escaping.',
          'Equilibrium needs equal amounts of gas and dissolved carbon dioxide.',
          'The carbon dioxide reacts with air and becomes a new substance.',
        ],
        correctIndex: 0,
        explanation: 'With the cap off it is an open system. Carbon dioxide escapes into a huge room and very little comes back, so the two rates can never match and the drink goes flat. Dynamic equilibrium needs a closed system.',
        card: { id: 'spec-soda-open', name: 'Going Flat', rarity: 'common', art: 'soda-open', flavor: 'Open system. The fizz is not coming back.' },
      },
      {
        id: 'spec-campfire-ash',
        image: 'campfire-ash',
        alt: 'A ring of stones holding cold campfire ash',
        stem: 'The campfire has burned out, leaving cold ash. Classify it.',
        options: CLASSIFY,
        correctIndex: 0,
        explanation: 'The burning has finished and cannot run backwards: the ash will not turn back into wood. Both rates are zero, so it is static equilibrium. Sitting in open air does not change that, because the first question is whether the reaction has finished.',
        card: { id: 'spec-campfire-ash', name: 'Cold Ash', rarity: 'common', art: 'campfire-ash', flavor: 'Finished. Both rates zero.' },
      },
      {
        id: 'spec-iodine-flask',
        image: 'iodine-flask',
        alt: 'A sealed round flask of purple gas on a stand',
        stem: 'A sealed flask of hydrogen and iodine gas has been kept at 450 °C for several hours. Its purple colour is no longer changing. Classify it.',
        options: CLASSIFY,
        correctIndex: 1,
        explanation: 'The reaction can still go both ways, so it has not finished. The flask is sealed, so it is closed, and the colour is steady. Closed and steady while both directions continue means dynamic equilibrium.',
        card: { id: 'spec-iodine-flask', name: 'Purple Flask', rarity: 'rare', art: 'iodine-flask', flavor: 'Steady colour, busy molecules.' },
      },
      {
        id: 'spec-evaporating-beaker',
        image: 'evaporating-beaker',
        alt: 'An open beaker of water giving off vapour',
        stem: 'A beaker of water is slowly evaporating in a warm room. Classify it.',
        options: CLASSIFY,
        correctIndex: 2,
        explanation: 'Evaporation can go both ways, because some vapour condenses back, so it has not finished. But the beaker is open and far more water escapes than returns, so the level keeps dropping. It is neither.',
        card: { id: 'spec-evaporating-beaker', name: 'Open Beaker', rarity: 'common', art: 'evaporating-beaker', flavor: 'Two ways in theory. One way in practice.' },
      },
      {
        id: 'spec-salt-jar',
        image: 'salt-jar',
        alt: 'A sealed jar of water with a pile of salt crystals at the bottom',
        stem: 'A sealed jar of saturated salt water has sat untouched for weeks. The pile of crystals at the bottom stays exactly the same size. Classify it.',
        options: CLASSIFY,
        correctIndex: 1,
        explanation: 'Salt keeps dissolving from the pile while dissolved salt keeps crystallising back onto it, at the same rate, in a closed jar. That is why the pile stays the same size. If you said static, that is the trap: still-looking does not mean stopped.',
        card: { id: 'spec-salt-jar', name: 'Saturated Jar', rarity: 'rare', art: 'salt-jar', flavor: 'Still-looking does not mean stopped.' },
      },
      {
        id: 'spec-hot-coffee',
        image: 'hot-coffee',
        alt: 'A steaming cup of coffee on a saucer',
        stem: 'A cup of hot coffee is cooling on a desk. Classify it.',
        options: CLASSIFY,
        correctIndex: 2,
        explanation: 'The cup is open, and heat and steam keep leaving, so it is still changing. It is not at equilibrium at all, so it is neither.',
        card: { id: 'spec-hot-coffee', name: 'Cooling Coffee', rarity: 'common', art: 'hot-coffee', flavor: 'Still changing. Drink it anyway.' },
      },
      {
        id: 'spec-burned-magnesium',
        image: 'burned-magnesium',
        alt: 'White powder on a heat mat beside tongs',
        stem: 'A strip of magnesium has burned completely to white powder. Classify it.',
        options: CLASSIFY,
        correctIndex: 0,
        explanation: 'The reaction has finished and cannot run backwards, so it is static. If you said neither because it is sitting in open air, go back to the first question: has the reaction finished?',
        card: { id: 'spec-burned-magnesium', name: 'Magnesium Ash', rarity: 'rare', art: 'burned-magnesium', flavor: 'Burned out, for good.' },
      },
    ],
  },
  {
    id: 'reproduction',
    subject: 'biology',
    title: 'Copies or mixes?',
    lessonId: 'bio-y12-m5-l01',
    video: { youtubeId: '44FFfv7RGck', title: 'Sexual and Asexual Reproduction' },
    questions: [
      {
        id: 'spec-tr4',
        image: 'tr4-plantation',
        alt: 'A row of banana plants, several wilting and yellow',
        stem: 'Every Cavendish banana plant is a clone, grown from pieces of earlier plants. Why is the TR4 fungus such a serious threat to them?',
        options: [
          'They share essentially the same DNA, so a disease that one plant cannot resist can spread through nearly all of them.',
          'Clones grow more slowly, so the fungus has more time to spread.',
          'Cavendish plants reproduce sexually, so each new plant is weaker.',
          'TR4 can only infect plants that have varied DNA.',
        ],
        correctIndex: 0,
        explanation: 'Asexual copying gives every plant the same set of alleles. If that set cannot resist TR4, almost no plant has an allele that helps it survive. Variation from sexual reproduction is what gives some individuals a chance.',
        card: { id: 'spec-cavendish', name: 'The Cavendish', rarity: 'epic', art: 'cavendish', flavor: 'Every bunch a clone. Every clone at risk.' },
      },
      {
        id: 'spec-strawberry-runner',
        image: 'strawberry-runner',
        alt: 'A strawberry plant with a runner rooting into a new plantlet',
        stem: 'This new strawberry plantlet grew from a runner sent out by the parent plant. How does its DNA compare with the parent’s?',
        options: [
          'It is half from this parent and half from another plant.',
          'It is a copy of the parent’s DNA, though rare mutations can cause small differences.',
          'It is identical, and there is no way any difference could ever arise.',
          'It is completely different from the parent’s DNA.',
        ],
        correctIndex: 1,
        explanation: 'A runner is asexual reproduction: one parent, no gametes joining, so the offspring is a clone. Copying is not perfect, though. Occasional copying errors, called mutations, mean even clones can differ a little.',
        card: { id: 'spec-strawberry-runner', name: 'Strawberry Runner', rarity: 'common', art: 'strawberry-runner', flavor: 'One plant, one runner, one copy.' },
      },
      {
        id: 'spec-strawberry-flower',
        image: 'strawberry-flower',
        alt: 'A white strawberry flower with yellow stamens',
        stem: 'The same strawberry plant also makes flowers. What do the flowers let it do?',
        options: [
          'Reproduce asexually, making clones of itself.',
          'Grow runners faster.',
          'Reproduce sexually: gametes join, and the seeds carry new combinations of alleles.',
          'Stop its DNA from changing between generations.',
        ],
        correctIndex: 2,
        explanation: 'Flowers are where gametes are made and join. Each seed that forms carries a new combination of its parents’ alleles. That is sexual reproduction: slower than runners, but it produces variation.',
        card: { id: 'spec-strawberry-flower', name: 'Strawberry Flower', rarity: 'common', art: 'strawberry-flower', flavor: 'Where the new mixes begin.' },
      },
      {
        id: 'spec-varied-seedlings',
        image: 'varied-seedlings',
        alt: 'Five strawberry seedlings in pots, each a little different',
        stem: 'These seedlings all grew from seeds of the same two parent plants, yet they are all slightly different. Why?',
        options: [
          'Each is an average blend of the two parents.',
          'Seeds are clones of the mother plant, so the differences come from the soil.',
          'Each formed from a different pair of gametes, so each has its own mix of the parents’ alleles.',
          'Only mutations can make siblings differ.',
        ],
        correctIndex: 2,
        explanation: 'Each gamete carries a different mix of a parent’s alleles, and which gametes join is down to chance. So each seed gets a new combination. Sexual offspring are new combinations, not blends.',
        card: { id: 'spec-varied-seedlings', name: 'Seedling Siblings', rarity: 'rare', art: 'varied-seedlings', flavor: 'Siblings, not copies.' },
      },
      {
        id: 'spec-stable-pond',
        image: 'stable-pond',
        alt: 'A small, still pond edged with grass',
        stem: 'Bacteria live in a warm pond where the conditions have stayed the same for years. Which way of reproducing better helps them continue?',
        options: [
          'Asexual, because fast copying builds the population and keeps a combination that already suits the pond.',
          'Sexual, because variation is always better.',
          'Sexual, because asexual offspring can never vary at all.',
        ],
        correctIndex: 0,
        explanation: 'The bacteria already suit their pond, so fast copying keeps that winning combination. If you chose sexual because variation sounds better, remember variation only helps when conditions change.',
        card: { id: 'spec-stable-pond', name: 'Still Pond', rarity: 'rare', art: 'stable-pond', flavor: 'Nothing changes here. Copies win.' },
      },
      {
        id: 'spec-island-plant',
        image: 'island-plant',
        alt: 'A single flowering plant on a tiny sandy island',
        stem: 'A single plant has reached an island with no others of its kind, and it cannot fertilise itself. How can it start a population?',
        options: [
          'Sexually, because it needs variation to cope with a new island.',
          'Asexually, by copying itself, for example by growing runners.',
          'Sexually, by fertilising its own flowers.',
        ],
        correctIndex: 1,
        explanation: 'With no mate and no way to fertilise itself, asexual reproduction is its only option. It can only start a population by copying itself.',
        card: { id: 'spec-island-plant', name: 'Island Castaway', rarity: 'rare', art: 'island-plant', flavor: 'No mate. No problem. Copy.' },
      },
      {
        id: 'spec-warming-field',
        image: 'warming-field',
        alt: 'Trays of strawberry seedlings on dry, cracked soil',
        stem: 'A strawberry plant can send out runners and make seeds. Its field gets hotter and drier every year. Which gives its offspring the better long-term chance?',
        options: [
          'Runners, because copies of a parent that survived are guaranteed to survive.',
          'Runners, because more offspring sooner matters more than variation.',
          'Seeds, because varied seedlings mean some may carry alleles that cope better with heat and drought.',
        ],
        correctIndex: 2,
        explanation: 'Sexual reproduction gives the better long-term chance here. Its seeds produce varied seedlings, so some may cope better. Runners would only make more copies of a plant that may struggle as conditions keep changing.',
        card: { id: 'spec-warming-field', name: 'Dry Field', rarity: 'epic', art: 'warming-field', flavor: 'Conditions change. Variation helps.' },
      },
    ],
  },
  {
    id: 'mould',
    subject: 'biology',
    title: 'How bread mould spreads',
    lessonId: 'bio-y12-m5-l03',
    video: { youtubeId: 'w7edKqGAUwA', title: 'How Bread Mould Spreads' },
    questions: [
      {
        id: 'spec-rhizopus',
        image: 'rhizopus',
        alt: 'Mouldy bread beside a close-up of mould threads and spore cases',
        stem: 'Bread mould (Rhizopus) is growing on one slice. How does it reach a fresh slice nearby?',
        options: [
          'Its threads grow through the air to the new slice.',
          'Spore cases release spores, and moving air carries some to the new slice.',
          'Mould forms from the bread itself as the bread gets old.',
          'Only a whole piece of mould can start a new colony.',
        ],
        correctIndex: 1,
        explanation: 'Spore cases on the mould release spores. Moving air carries some of them to new bread. Spores carry the fungus to a new place; the threads take in nutrients where the fungus grows.',
        card: { id: 'spec-rhizopus', name: 'Rhizopus', rarity: 'rare', art: 'rhizopus', flavor: 'Spore cases up. Spores away.' },
      },
      {
        id: 'spec-fresh-bread',
        image: 'fresh-bread',
        alt: 'A clean slice of bread',
        stem: 'A Rhizopus spore lands on this moist slice of bread at a suitable temperature. What happens next?',
        options: [
          'The spore germinates and branches into threads, forming a new colony.',
          'The spore releases more spores straight away without growing.',
          'Nothing grows until the bread dries out.',
          'The spore turns into a seed.',
        ],
        correctIndex: 0,
        explanation: 'On moist bread at a suitable temperature, a landed spore germinates and branches into a new colony of threads.',
        card: { id: 'spec-fresh-bread', name: 'Fresh Slice', rarity: 'common', art: 'fresh-bread', flavor: 'Not for long.' },
      },
    ],
  },
];

/** @param {string} image */
export const specimenImageSrc = (image) => `/specimens/${image}.webp`;
