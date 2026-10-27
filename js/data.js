// Mafiozo – game content. Helpers come from game.js: rnd, chance, pick, cash,
// ok/bad/meh (outcomes), brawl (starts a fight), arrest, extend, escapePrison, queueEvent.
// Effect keys: money, health, str, smarts, respect, heat.

const CITY = 'Velmora City';
const DISTRICTS = ['the Narrows', 'Old Quay', 'Southside', 'Harbor Heights', 'Crown Hill', 'Saltmarsh'];
const FIRST_M = ['Marco', 'Luca', 'Vito', 'Dante', 'Nico', 'Sal', 'Tony', 'Enzo', 'Ray', 'Frankie', 'Leo', 'Johnny', 'Danny', 'Stefan', 'Milan', 'Victor'];
const FIRST_F = ['Gia', 'Lena', 'Rosa', 'Mia', 'Carla', 'Nina', 'Sofia', 'Vera', 'Tess', 'Angela', 'Mara', 'Lucia', 'Jess', 'Ana', 'Dina', 'Kat'];
const LAST = ['Russo', 'Marino', 'Costa', 'Moretti', 'Novak', 'Keane', 'Volkov', 'Esposito', 'Brennan', 'Lombardi', 'Petrov', 'Calloway', 'DeLuca', 'Hart', 'Vance', 'Rinaldi'];
const NICKS = ['Knuckles', 'Two Times', 'The Ox', 'Slick', 'Fingers', 'Saint', 'Little Nicky', 'The Weasel', 'Ice', 'Smiles', 'Big Lou', 'Ghost'];
const CREWS = ['the Kestrel Boys', 'the Southside Vipers', 'the Quay Rats', 'the Carrow Street Crew', 'the Neon Saints'];
const FAMILIES = ['Moretti', 'Volkov', 'Delacroix', 'Castellano'];

// What the street says about each family, and the event (`scene`) that tests newcomers.
// Families without a scene are not open yet.
const FAMILY_INFO = {
  Moretti: { rumor: 'The old men respect honor, and those who know how to stay quiet.', scene: 'moretti' },
  Volkov: { rumor: 'With the Russians, only your fists talk.', scene: 'volkov' },
  Delacroix: { rumor: 'The Delacroix have no patience for fools.', scene: 'delacroix' },
  Castellano: { rumor: 'With the Castellanos, everything has a price.' },
};
const FAM_RANKS = ['Associate', 'Soldier', 'Capo', 'Underboss', 'Don'];

// The Volkov test is a ring fight. Venue and opponent change every time.
const VOLKOV_VENUES = [
  'The Volkovs run the Iron Bear, a boxing gym under the Saltmarsh fish market.',
  'The Volkovs hold fights in a cage inside a cold-storage warehouse at Old Quay.',
  'Tonight the Volkovs fight in the cargo hold of a freighter that sails at dawn.',
  'The Volkovs rent out a closed bathhouse on Crown Hill for fight night.',
];
const VOLKOV_FIGHTERS = [
  { name: 'Dmitri the Anvil', note: 'Hits like a truck. Moves like one too.', hp: 70, pow: 18, spd: 0.9, mix: { punch: 3, block: 1, grapple: 1 } },
  { name: 'Yuri the Fox', note: 'Fast hands. Hard to time.', hp: 55, pow: 13, spd: 1.6, mix: { punch: 1, block: 1, grapple: 1 } },
  { name: 'Old Sasha', note: 'Covers up and waits for your mistake.', hp: 60, pow: 14, spd: 1.1, mix: { punch: 1, block: 3, grapple: 1 } },
  { name: 'Bogdan', note: 'A wrestler. Wants you on the floor.', hp: 75, pow: 15, spd: 1.2, mix: { punch: 1, block: 1, grapple: 3 } },
];
const VOLKOV_CHAMP = { name: 'Viktor the Bear', note: 'Nobody has lasted three rounds with the champion this year.', hp: 100, pow: 22, spd: 1.4, mix: { punch: 2, block: 1, grapple: 2 } };

// Win and you are in. Lose after hurting them badly and you may still be in. Run and you are a joke.
function volkovFight(p, foe, champ) {
  p.done.seek = true;
  return brawl(foe, foe.name,
    () => joinFamily('Volkov', champ
      ? `You put ${foe.name} on the floor. The room goes silent, then the vodka comes out.`
      : `You beat ${foe.name}. The lieutenant nods once. "Tomorrow you work for us."`, champ ? { respect: rnd(10, 15) } : {}),
    f => f.them <= foe.hp / 2
      ? joinFamily('Volkov', `${foe.name} won, but you kept getting up. "This one has heart," the lieutenant says.`)
      : bad(`${foe.name} knocked you out cold. You woke up in the alley out back.`, { respect: -2 }, 'Died in a Volkov fight ring'),
    () => bad('You ran from a Volkov fight. They will be laughing about it all year.', { respect: -4 }));
}
const COPS = ['Harlow', 'Briggs', 'Okafor', 'Reyes', 'Kowalski'];
const PARENTS = [
  'Your father fixes boats at the Old Quay. Your mother works nights at a diner.',
  'Your mother runs a laundromat that only takes cash. Nobody asks why.',
  'Your father drives a cab and says he has "friends downtown." Your mother says nothing.',
  'You were raised by your grandmother above her bakery on Crown Hill.',
];

// Respect titles, lowest first.
const RANKS = [[0, 'Nobody'], [10, 'Street Rat'], [25, 'Hustler'], [45, 'Known Face'], [65, 'Feared'], [85, 'Legend']];

// Fight opponents: fight points, hit power, needle speed (sweeps per second) and how often they pick each move.
const FOES = {
  kid: { hp: 30, pow: 8, spd: 0.8, mix: { punch: 2, block: 1, grapple: 1 } },
  drunk: { hp: 35, pow: 10, spd: 0.9, mix: { punch: 3, block: 0.5, grapple: 1 } },
  thug: { hp: 50, pow: 14, spd: 1.1, mix: { punch: 1, block: 1, grapple: 1 } },
  gang: { hp: 65, pow: 17, spd: 1.2, mix: { punch: 2, block: 1, grapple: 2 } },
  brute: { hp: 80, pow: 21, spd: 1.3, mix: { punch: 3, block: 1, grapple: 1 } },
};

// Sneaking rooms for the turn-based minigame. Map rows run top to bottom:
// # wall, B desk or cabinet (blocks sight), . floor, S front door, R back way, * target, $ bonus.
// Nobody can see into a doorway, so waiting at the door is always safe.
// cop: walks between `points` the shortest way and sees a cone 3 tiles deep. cam: sits on a wall and
// turns through `turns` (repeat a direction to make it linger). dog: roams its `zone` [x1, y1, x2, y2]
// and smells the 4 tiles around it. Keep the entrance out of every cone so the start is safe.
const SNEAK_TEST = {
  target: '📁',
  bonus: { icon: '💵', text: 'You pocketed $500.', fx: { money: 500 } },
  map: ['#.*..B.', '.....B.', '.BB....', '....B..', '.B..B..', '...B...', 'B.....B', '.B.B..$', '.B..B..', '###S###'],
  guards: [
    { type: 'cop', x: 6, y: 1, face: 'left', points: [[6, 1], [1, 1], [3, 3], [1, 5], [5, 4]] },
    { type: 'cam', x: 0, y: 0, turns: ['right', 'right', 'down-right', 'down-right', 'down', 'down', 'down-right', 'down-right'] },
    { type: 'dog', x: 5, y: 7, zone: [4, 5, 6, 8] },
  ],
};

// The Delacroix test: a safe job. Code length, seconds before the owner is back, who you could bribe,
// and who has you if it goes wrong. The safe test room in Profile picks from these too.
const DELACROIX_JOBS = [
  { place: 'the Grand Velmora Hotel', digits: 4, time: 15, insider: 'the maid', caughtBy: 'police',
    brief: 'A businessman at the Grand Velmora owes us and hides it in the safe of his suite. Bring us his bearer bonds.',
    win: 'You laid the bonds on the white tablecloth.' },
  { place: 'a gallery on Rue Royale', digits: 5, time: 18, insider: 'the assistant', caughtBy: 'police',
    brief: 'We sold a painting that is, let us say, younger than it looks. The gallery owner keeps the proof in a safe. Bring it to us.',
    win: 'The proof of the forgery went into the fireplace.' },
  { place: 'a yacht in the marina', digits: 5, time: 16, insider: 'a deckhand', caughtBy: 'mob',
    brief: 'A rival keeps a hard drive with our accounts in the safe of a yacht in the marina. We want it back.',
    win: 'You handed over the hard drive. Nobody asked how.' },
  { place: 'a jeweler on Crown Hill', digits: 6, time: 20, insider: 'the clerk', caughtBy: 'police',
    brief: 'A jeweler on Crown Hill would like to be robbed, for the insurance. Empty the safe. He gets the payout, we get the stones.',
    win: 'The diamonds were on their way to Antwerp by morning.' },
];
const BRIBE = 1000;

function delacroixJob(p, c, method) {
  const job = DELACROIX_JOBS[c.job];
  if (method === 'bribe' && p.money < BRIBE) return meh(`You cannot afford ${job.insider}. The Delacroix smile politely and wait.`);
  p.done.seek = true;
  if (method === 'bribe' && chance(0.15)) { // the insider talked
    P.pending.unshift({ id: 'nabbed', c: { by: job.caughtBy } });
    return bad(`${job.insider.charAt(0).toUpperCase() + job.insider.slice(1)} took your money and sold you out. Someone was waiting by the safe.`, { money: -BRIBE });
  }
  if (method === 'closet' && chance(closetRisk())) { // the owner opened the closet
    P.pending.unshift({ id: 'nabbed', c: { by: job.caughtBy } });
    return bad(CLOSET_FOUND);
  }
  return { safe: { ...job, method, end: (how, tries) => delacroixEnd(job, method, how, tries) } };
}

// First try earns the most respect. Locked or too slow leads to the `nabbed` event.
function delacroixEnd(job, method, how, tries) {
  const fee = method === 'bribe' ? { money: -BRIBE } : {};
  if (how === 'open') {
    const clean = tries === 3, respect = clean ? rnd(8, 12) : rnd(3, 6);
    const text = clean ? `Not a single wrong digit. ${job.win}` : `It took a few tries, but ${job.win.charAt(0).toLowerCase()}${job.win.slice(1)}`;
    return joinFamily('Delacroix', text, { ...fee, respect });
  }
  if (how === 'quit') return meh('You backed off before anyone saw you. Maybe next year.', fee);
  P.pending.unshift({ id: 'nabbed', c: { by: job.caughtBy } });
  return bad(how === 'locked' ? 'The safe locked itself and an alarm went off.' : 'The owner walked in on you.', fee);
}

// Debtors for the Castellano test (memory minigame): what they owe, seconds to sweep the place, and the six
// kinds of things in it. Matching a pair takes it; junk is worth nothing and only eats the clock.
const DEBTORS = [
  { who: 'the barber', place: 'a barbershop on Carrow Street', owes: 2000, time: 20, items: [
    { icon: '💵', name: 'Cash from the register', value: 400 }, { icon: '⌚', name: 'A gold watch', value: 900 },
    { icon: '✂️', name: 'Silver shears', value: 300 }, { icon: '💍', name: 'A wedding ring', value: 600 },
    { icon: '🧴', name: 'Hair tonic', value: 0 }, { icon: '📰', name: 'Old newspapers', value: 0 }] },
  { who: 'the bookie', place: 'a betting shop on the Strip', owes: 5000, time: 20, items: [
    { icon: '💰', name: 'A bag of cash', value: 1500 }, { icon: '💵', name: 'A roll of twenties', value: 500 },
    { icon: '⌚', name: 'A gold watch', value: 1200 }, { icon: '💎', name: 'A loose diamond', value: 2000 },
    { icon: '🎟️', name: 'Losing tickets', value: 0 }, { icon: '🧦', name: 'Socks', value: 0 }] },
  { who: 'the widow', place: 'a bakery on Crown Hill', owes: 1500, time: 20, items: [
    { icon: '📿', name: 'A pearl necklace', value: 700 }, { icon: '💍', name: 'A diamond ring', value: 900 },
    { icon: '🏺', name: 'An antique vase', value: 500 }, { icon: '💵', name: 'The till', value: 200 },
    { icon: '🍞', name: 'Day-old bread', value: 0 }, { icon: '🧶', name: 'Yarn', value: 0 }] },
  { who: 'the bar owner', place: 'a bar in Old Quay', owes: 3000, time: 20, items: [
    { icon: '💵', name: 'The till', value: 600 }, { icon: '🍾', name: 'Vintage champagne', value: 400 },
    { icon: '🎸', name: 'A signed guitar', value: 1100 }, { icon: '⌚', name: 'A gold watch', value: 1000 },
    { icon: '🥜', name: 'Bar nuts', value: 0 }, { icon: '🧾', name: 'Unpaid tabs', value: 0 }] },
];

// The Moretti test: a random job, then a way in. `shiftOff` is the guard missing during the shift change,
// `shiftMoves` how long until the next shift arrives. `caughtBy` decides who has you if it goes wrong.
const MORETTI_JOBS = [
  { place: 'the Old Quay precinct', caughtBy: 'police',
    brief: 'The cops have a rat inside our family. The rat\'s file sits in the Old Quay precinct. Bring it to us.',
    win: 'You walked out of the precinct with the rat\'s file under your coat.',
    room: { target: '📁', bonus: { icon: '🗂️', text: 'You swiped your own police file too.', fx: { heat: -20 } }, shiftOff: 2, shiftMoves: 40,
      map: ['###R###', '.B..B..', '...B.B.', '.B.....', '...B.B.', '.B.....', '*..B.B.', '.B.B..$', '.B..B..', '###S###'],
      guards: [
        { type: 'cop', x: 6, y: 3, face: 'left', points: [[6, 3], [2, 4], [4, 5], [6, 6], [0, 3]] },
        { type: 'cam', x: 0, y: 0, turns: ['down', 'down', 'down-right', 'down-right'] },
        { type: 'cam', x: 0, y: 9, turns: ['up', 'up', 'up-right', 'up-right'] },
      ] } },
  { place: 'a rival club', caughtBy: 'mob',
    brief: 'The {rival}s keep our late Don\'s ring in the VIP booth of their club, like a trophy. Bring it home.',
    win: 'You brought the old Don\'s ring home. The widow cried.',
    room: { target: '💍', bonus: { icon: '💵', text: 'You emptied the bar till: $1,500.', fx: { money: 1500 } }, shiftOff: 1, shiftMoves: 40,
      map: ['###R###', '.B..B..', '...B...', 'B.....B', '..BBB..', '.......', '*B...B.', '.B.B..$', '.B..B..', '###S###'],
      guards: [
        { type: 'cop', icon: '🕴️', x: 5, y: 3, face: 'left', points: [[5, 3], [1, 3], [2, 5], [6, 5]] },
        { type: 'dog', x: 5, y: 7, zone: [4, 5, 6, 8] },
        { type: 'cam', x: 6, y: 0, turns: ['down', 'down', 'down-left', 'down-left'] },
      ] } },
  { place: 'a house in Harbor Heights', caughtBy: 'police',
    brief: 'A witness is blackmailing one of our capos with photos. They are in a house in Harbor Heights, under police protection. Get them.',
    win: 'You burned the photos in the bakery oven that night.',
    room: { target: '📸', bonus: { icon: '💎', text: 'You pocketed a jewelry box worth $1,000.', fx: { money: 1000 } }, shiftOff: 1, shiftMoves: 40,
      map: ['###R###', '.B..B..', '...B...', '##.##.#', '.......', '.B.#.B.', '*..#...', '.B.B..$', '.B..B..', '###S###'],
      guards: [
        { type: 'cop', x: 6, y: 4, face: 'left', points: [[6, 4], [0, 4], [1, 6], [5, 6]] },
        { type: 'dog', x: 5, y: 7, zone: [4, 5, 6, 8] },
      ] } },
  { place: 'a law office downtown', caughtBy: 'police',
    brief: 'A lawyer is about to hand the DA a tape of one of our capos confessing. It is in the lawyer\'s office downtown. Get it first.',
    win: 'The tape went into the harbor. The capo sent you a case of wine.',
    room: { target: '💾', bonus: { icon: '💵', text: 'You found $2,000 of petty cash.', fx: { money: 2000 } }, shiftOff: 1, shiftMoves: 40,
      map: ['###R###', '.B..B..', '...B...', '.B...B.', '...B...', 'B.....B', '.B..B.*', '.B.B...', '.B..B.$', '###S###'],
      guards: [
        { type: 'cop', x: 0, y: 4, face: 'right', points: [[0, 4], [6, 4], [3, 6]] },
        { type: 'cop', x: 6, y: 2, face: 'left', points: [[6, 2], [0, 2], [2, 4]] },
        { type: 'cam', x: 0, y: 0, turns: ['down', 'down', 'down-right', 'down-right'] },
      ] } },
];

function morettiJob(p, c, entry) {
  p.done.seek = true;
  const job = MORETTI_JOBS[c.job];
  return { sneak: { room: job.room, entry, label: 'Moretti test', end: (how, bonus) => morettiEnd(job, how, bonus) } };
}

// Clean gets you in with respect, loud gets you in with heat. Caught leads to a last choice (the `nabbed` event).
function morettiEnd(job, how, bonus) {
  const extra = bonus ? job.room.bonus.fx : {};
  if (how === 'win') return joinFamily('Moretti', `Not a soul saw you. ${job.win} The old men were impressed.`, { respect: rnd(8, 12), ...extra });
  if (how === 'loud') return joinFamily('Moretti', `It got loud and people saw your face, but ${job.win.charAt(0).toLowerCase()}${job.win.slice(1)}`, { heat: rnd(20, 30), ...extra });
  if (how === 'fled') return bad('You got out, but empty-handed. The Morettis will not try you again this year.', { respect: -3, ...extra });
  if (how === 'quit') return meh('You walked away before it went wrong. Maybe next year.');
  P.pending.unshift({ id: 'nabbed', c: { by: job.caughtBy } });
  return null;
}

// Crimes: base success chance plus reward, respect, heat and sentence ranges.
// Real odds also depend on smarts, respect, heat, your crew and lockpicking (see odds() in game.js).
const CRIMES = [
  { id: 'pickpocket', name: 'Pickpocket', minAge: 10, base: 0.78,
    reward: [15, 180], respect: [1, 2], heat: [3, 6], jail: [0, 1],
    ok: 'You lifted a fat wallet off a tourist on Pier Street.', fail: 'The mark felt your hand and started yelling. You ran.', caught: 'A beat cop grabbed you by the collar.' },
  { id: 'shoplift', name: 'Shoplift', minAge: 10, base: 0.72,
    reward: [20, 320], respect: [1, 2], heat: [3, 7], jail: [0, 1],
    ok: 'You walked out with a jacket full of electronics and fenced them by dinner.', fail: 'The alarm went off at the door. You dropped everything and bolted.', caught: 'Store security tackled you in the parking lot.' },
  { id: 'car', name: 'Boost a Car', minAge: 15, base: 0.56,
    reward: [800, 5200], respect: [3, 6], heat: [8, 14], jail: [1, 3],
    ok: 'You hotwired a sedan and the chop shop paid cash, no questions.', fail: 'The car alarm screamed. You left it running in the street.', caught: 'A patrol car boxed you in two blocks later.' },
  { id: 'burglary', name: 'Burglary', minAge: 16, base: 0.5,
    reward: [500, 9000], respect: [3, 6], heat: [8, 15], jail: [1, 4],
    ok: 'In and out in twelve minutes. Jewelry, cash, a gold watch.', fail: 'A dog woke the whole street. You went out the back window empty-handed.', caught: 'The silent alarm brought the cops to the front door.' },
  { id: 'store', name: 'Rob a Liquor Store', minAge: 17, base: 0.46,
    reward: [300, 2600], respect: [5, 9], heat: [12, 20], jail: [2, 6], hurt: 0.4,
    ok: 'The clerk emptied the register with shaking hands.', fail: 'The clerk pulled a shotgun from under the counter.', caught: 'You ran straight into a squad car on the corner.' },
  { id: 'truck', name: 'Hijack a Truck', minAge: 18, minRespect: 25, base: 0.4,
    reward: [5000, 30000], respect: [6, 10], heat: [15, 25], jail: [3, 8], hurt: 0.3,
    ok: 'The driver handed over the keys. The cargo sold before sunrise.', fail: 'The driver floored it and nearly ran you over.', caught: 'The truck was a police sting. Cops everywhere.' },
  { id: 'bank', name: 'Bank Job', minAge: 21, minRespect: 50, base: 0.26,
    reward: [40000, 250000], respect: [12, 20], heat: [30, 45], jail: [8, 20], hurt: 0.5,
    ok: 'Ninety seconds in the vault. The getaway car was waiting. Clean.', fail: 'The guard was faster than you planned. You fled under fire.', caught: 'SWAT was waiting outside before you reached the door.' },
];

// Once a year each, while free.
const ACTIVITIES = [
  { id: 'gym', name: 'Gym', desc: 'Strength and health up.', minAge: 12,
    run: () => ok('You trained hard at the Iron Lung all year.', { str: rnd(3, 6), health: rnd(2, 5) }) },
  { id: 'library', name: 'Library', desc: 'Smarts up.', minAge: 6,
    run: () => ok('You spent long nights at the public library.', { smarts: rnd(2, 5) }) },
  { id: 'corner', name: 'Hang on the Corner', desc: 'Respect up. Trouble may find you.', minAge: 12,
    run: () => {
      queueEvent('street', 0.45);
      return meh('You spent the year on the corner of Carrow and 5th, watching how things work.', { respect: rnd(1, 3), heat: rnd(0, 2) });
    } },
  { id: 'night', name: 'Night Out', desc: 'Respect up. Costs money. Fights happen.', minAge: 16,
    run: p => {
      const spent = -Math.min(p.money, rnd(80, 400));
      return chance(0.2)
        ? brawl('drunk', 'the drunk',
          () => ok('A drunk swung at you outside the club. You put them on the curb.', { money: spent, respect: rnd(1, 3) }),
          () => bad('A drunk swung at you outside the club and won. Embarrassing.', { money: spent }),
          () => meh('A drunk swung at you outside the club. You jumped in a cab.', { money: spent }))
        : ok('You were seen at the Velvet Room with the right people.', { money: spent, respect: rnd(1, 3) });
    } },
  { id: 'doctor', name: 'See a Doctor', desc: 'Heals injuries. $200, free for kids.', minAge: 0,
    run: p => {
      const fee = p.age < 18 ? 0 : 200;
      return p.money < fee
        ? bad("The clinic wants $200 up front. You don't have it.")
        : ok('The doctor patched you up and told you to slow down.', { money: -fee, health: rnd(6, 14) });
    } },
  { id: 'laylow', name: 'Lay Low', desc: 'Heat goes down.', minAge: 14,
    run: () => ok('You kept your head down and stayed off the streets.', { heat: -rnd(15, 25) }) },
];

// Once a year each, while locked up.
const PRISON_ACTIONS = [
  { id: 'yard', name: 'Hit the Weights', desc: 'Strength and health up.',
    run: () => ok('You pushed iron every day this year.', { str: rnd(3, 6), health: rnd(3, 6), respect: rnd(1, 2) }) },
  { id: 'books', name: 'Prison Library', desc: 'Smarts up.',
    run: () => ok('You read everything on the book cart.', { smarts: rnd(3, 6) }) },
  { id: 'fight', name: 'Pick a Fight', desc: 'Win respect. Risk injuries.',
    run: () => brawl('thug', 'the loudmouth',
      () => ok('You flattened a loudmouth from C-Block. Nobody looks at you wrong now.', { respect: rnd(5, 10) }),
      () => chance(0.3)
        ? extend(1, bad('You lost, and the guards wrote you up.', {}, 'Killed in a prison fight'))
        : bad('You lost. Badly.', {}, 'Killed in a prison fight')) },
  { id: 'escape', name: 'Attempt Escape', desc: 'Long odds. Freedom if it works.',
    run: p => chance(0.12 + p.smarts / 500)
      ? escapePrison()
      : extend(rnd(2, 4), bad('The guards caught you at the fence.', { health: -rnd(3, 8) })) },
];

const JOBS = [
  { id: 'dish', title: 'Dishwasher', place: 'Lucky Lotus Diner', salary: 17000, minAge: 16 },
  { id: 'bar', title: 'Bartender', place: 'The Velvet Room', salary: 28000, minAge: 18, req: {} },
  { id: 'docks', title: 'Dock Worker', place: 'Old Quay Docks', salary: 34000, minAge: 18, req: { health: 40 } },
  { id: 'teller', title: 'Bank Teller', place: 'First Velmora Bank', salary: 41000, minAge: 18, req: { smarts: 60 }, clean: true },
  { id: 'cars', title: 'Car Salesman', place: 'Velmora Motors', salary: 44000, minAge: 18, req: { smarts: 45 } },
];

// Random events. Each year rolls up to two. `inside` events happen only in prison,
// `anywhere` events in both; the rest only on the outside. `street` events can also
// come from hanging on the corner. `scene` events only run when you start them (see FAMILY_INFO). Context `c`: first, last, full, n (with nickname),
// crew, rival, fam, cop, plus whatever `ctx` adds. Write NPC lines without pronouns.
const EVENTS = [
  { id: 'volkov', title: 'The Volkov Test', scene: true, when: p => !p.fam,
    ctx: () => ({ venue: pick(VOLKOV_VENUES), foe: pick(VOLKOV_FIGHTERS) }),
    text: (p, c) => `${c.venue} A Volkov lieutenant looks you over. "You want in? Here, you fight. Tonight it is ${c.foe.name}." ${c.foe.note}`,
    choices: [
      { label: 'Step into the ring', run: (p, c) => volkovFight(p, c.foe, false) },
      { label: 'Ask for their champion', run: p => volkovFight(p, VOLKOV_CHAMP, true) },
      { label: 'Walk away', run: () => meh('Not tonight. The Volkovs are not going anywhere.') },
    ] },
  { id: 'moretti', title: 'The Moretti Test', scene: true, when: p => !p.fam,
    ctx: () => ({ job: rnd(0, MORETTI_JOBS.length - 1), rival: pick(['Volkov', 'Delacroix', 'Castellano']) }),
    text: (p, c) => `A Moretti capo meets you behind a bakery on Crown Hill. "You want in? Prove it. ${MORETTI_JOBS[c.job].brief.replace('{rival}', c.rival)}" In disguise, guards only notice you up close, but once they do they never let go. The back way is longer, with more cover. During the shift change there is one guard fewer, but the next shift comes fast.`,
    choices: [
      { label: 'Front door, in disguise', run: (p, c) => morettiJob(p, c, 'mask') },
      { label: 'The back way', run: (p, c) => morettiJob(p, c, 'back') },
      { label: 'During the shift change', run: (p, c) => morettiJob(p, c, 'shift') },
      { label: 'Walk away', run: () => meh('"Come back when you have the stomach for it."') },
    ] },
  { id: 'delacroix', title: 'The Delacroix Test', scene: true, when: p => !p.fam,
    ctx: () => ({ job: rnd(0, DELACROIX_JOBS.length - 1) }),
    text: (p, c) => `Dinner at Maison Delacroix. Nobody touches the food. "We hear you are clever. Show us. ${DELACROIX_JOBS[c.job].brief}" The safe has a ${DELACROIX_JOBS[c.job].digits}-digit code. Binoculars from across the street are safe, but you only catch a glimpse. A closet in the room gives you a close look, if nobody opens it. ${DELACROIX_JOBS[c.job].insider.charAt(0).toUpperCase() + DELACROIX_JOBS[c.job].insider.slice(1)} could give you half the code, for a price, and might talk.`,
    choices: [
      { label: 'Binoculars across the street', run: (p, c) => delacroixJob(p, c, 'scope') },
      { label: 'Hide in the closet', run: (p, c) => delacroixJob(p, c, 'closet') },
      { label: () => `Bribe the staff (${cash(BRIBE)})`, run: (p, c) => delacroixJob(p, c, 'bribe') },
      { label: 'Walk away', run: () => meh('"A pity. We so rarely meet anyone interesting."') },
    ] },
  { id: 'nabbed', title: 'Caught', scene: true, when: () => true,
    text: (p, c) => (c.by === 'mob' ? 'Two of their men have you pinned against the wall.' : 'A cop has you by the collar. Backup is two minutes out.'),
    choices: [
      { label: 'Break free and run', run: (p, c) => chance(0.3 + p.health / 250)
        ? bad('You twisted loose and ran. No prize, no family, but no cuffs either.', { heat: rnd(10, 15) })
        : c.by === 'mob' ? bad('You did not get far. They made sure you remember it.', { health: -rnd(20, 35) }, 'Beaten to death by a rival family')
        : arrest(rnd(1, 3), 'You did not get far.') },
      { label: 'Fight', run: (p, c) => brawl('thug', c.by === 'mob' ? 'the bouncer' : 'the cop',
        () => bad('You fought your way out, empty-handed. They know your face now.', { heat: rnd(12, 18), respect: 3 }),
        () => (c.by === 'mob' ? bad('They beat you and dumped you in the harbor. You crawled out.', { health: -rnd(10, 20) }, 'Beaten to death by a rival family')
          : arrest(rnd(2, 4), 'You lost the fight and woke up in cuffs.'))) },
      { label: 'Give up', run: (p, c) => (c.by === 'mob' ? bad('You raised your hands. They beat you anyway and dumped you in an alley.', { health: -rnd(20, 35) }, 'Beaten to death by a rival family')
        : arrest(rnd(1, 2), 'You raised your hands.')) },
    ] },
  { id: 'kid', title: 'Growing Up', w: 1.5, when: p => p.age >= 2 && p.age <= 6,
    auto: () => pick([
      meh('You stole a candy bar from the corner shop. Nobody noticed.'),
      meh('A kid at daycare took your toy. You bit them.', { respect: 1 }),
      bad('You fell off the monkey bars at Harbor Park.', { health: -3 }),
      ok('Your uncle taught you to play cards. You cheated on purpose.', { smarts: 2 }),
    ]) },
  { id: 'grades', title: 'Report Card', when: p => p.age >= 8 && p.age <= 17,
    auto: p => p.smarts >= 60 ? ok("Straight A's. Your teacher says you could be a lawyer someday.")
      : p.smarts >= 35 ? meh("B's and C's. Nobody at home asked.")
      : bad('You failed math. Again.') },
  { id: 'bully', title: 'Lunch Money', when: p => p.age >= 7 && p.age <= 13,
    text: (p, c) => `${c.n} has been shaking you down for lunch money all week.`,
    choices: [
      { label: 'Fight back', run: (p, c) => brawl('kid', c.first,
        () => ok(`You knocked ${c.first} flat in the hallway. Word gets around.`, { respect: rnd(4, 7) }),
        () => bad(`${c.first} beat you up in front of the whole school.`)) },
      { label: 'Tell a teacher', run: () => meh('The teacher handled it. Some kids call you a snitch now.', { smarts: 2, respect: -3 }) },
      { label: 'Pay up', run: p => meh('You hand over your money. Again.', { money: -Math.min(p.money, 20) }) },
    ] },
  { id: 'wallet', title: 'Lost Wallet', when: p => p.age >= 10, ctx: () => ({ amt: rnd(40, 600) }),
    text: (p, c) => `You find a wallet on the sidewalk with ${cash(c.amt)} inside.`,
    choices: [
      { label: 'Keep the cash', run: (p, c) => ok('Finders keepers.', { money: c.amt }) },
      { label: 'Return it', run: () => chance(0.35)
        ? ok('The owner tipped you $100 for your honesty.', { money: 100 })
        : ok('The owner thanked you. That felt good.') },
    ] },
  { id: 'package', title: 'Delivery Job', tag: 'street', once: true, when: p => p.age >= 12 && p.age <= 24,
    text: (p, c) => `${c.n}, a local hood, offers you $300 to carry a package across town. No questions asked.`,
    choices: [
      { label: 'Take the job', run: (p, c) => chance(0.8)
        ? ok(`You delivered it. ${c.first} says there's more work if you want it.`, { money: 300, respect: rnd(3, 5), heat: rnd(3, 6) })
        : bad('Cops stopped you on the way. You ditched the package and ran.', { heat: rnd(12, 18) }) },
      { label: 'Walk away', run: (p, c) => meh(`${c.first} shrugs. "Your loss, kid."`) },
    ] },
  { id: 'mentor', title: 'The Old-Timer', tag: 'street', once: true, when: p => p.age >= 13 && p.age <= 22,
    text: (p, c) => `An old safecracker named ${c.n} offers to teach you how to pick locks.`,
    choices: [
      { label: 'Learn the trade', run: p => { p.flags.locks = true; return ok('Months of practice. No lock in Velmora scares you now.', { smarts: rnd(2, 4), respect: 2 }); } },
      { label: 'No thanks', run: () => meh('The old-timer goes back to the crossword.') },
    ] },
  { id: 'crew', title: 'Join the Crew?', tag: 'street', once: true, when: p => p.age >= 15 && p.age <= 30 && p.respect >= 8 && !p.flags.crew,
    text: (p, c) => `${c.n} from ${c.crew} wants you to run with them.`,
    choices: [
      { label: 'Join them', run: (p, c) => { p.flags.crew = c.crew; return ok(`You're with ${c.crew} now. They have your back.`, { respect: rnd(6, 10), heat: 5 }); } },
      { label: 'Stay solo', run: () => meh('You work alone. Fewer friends, fewer snitches.') },
    ] },
  { id: 'jumped', title: 'Ambush', tag: 'street', when: p => p.age >= 15 && p.respect >= 5,
    text: (p, c) => `Three guys from ${c.rival} jump you in an alley off Carrow Street.`,
    choices: [
      { label: 'Fight', run: () => brawl('gang', 'the biggest one',
        () => ok('You put the biggest one on the pavement. The other two ran.', { respect: rnd(6, 9) }),
        () => bad('They stomped you and left you bleeding.', { respect: -2 }, 'Beaten to death in an alley')) },
      { label: 'Run', run: p => chance(0.5 + p.health / 300)
        ? meh('You got away. Your pride did not.', { respect: -2 })
        : bad('They caught you anyway.', { health: -rnd(8, 14) }, 'Beaten to death in an alley') },
      { label: 'Hand over your cash', run: p => meh('They took your cash and laughed.', { money: -Math.round(p.money * 0.3), respect: -5 }) },
    ] },
  { id: 'detective', title: 'Detective on Your Tail', when: p => p.age >= 16 && p.heat >= 45, ctx: p => ({ bribe: 2000 + p.heat * 60 }),
    text: (p, c) => `Detective ${c.cop} of the VCPD has been asking around about you.`,
    choices: [
      { label: 'Lay low for a while', run: () => meh('You stayed off the streets for months.', { heat: -rnd(12, 18) }) },
      { label: (p, c) => `Offer a bribe (${cash(c.bribe)})`, run: (p, c) => p.money < c.bribe
        ? bad("You don't have that kind of cash. The detective laughs.", { heat: 5 })
        : chance(0.65)
          ? ok('The envelope disappears into a coat pocket. So does your file.', { money: -c.bribe, heat: -30 })
          : arrest(rnd(1, 3), `Detective ${c.cop} was wearing a wire. Bribery charges.`) },
      { label: 'Ignore it', run: () => meh("The detective isn't going anywhere.", { heat: 5 }) },
    ] },
  { id: 'raid', title: 'Police Raid', when: p => p.age >= 16 && p.heat >= 65,
    text: () => 'The VCPD is kicking in doors on your block. Yours is next.',
    choices: [
      { label: 'Hide everything', run: () => chance(0.55)
        ? ok('They tore the place apart and found nothing.', { heat: -10 })
        : arrest(rnd(1, 4), 'They found the evidence under your floorboards.') },
      { label: 'Run for it', run: p => chance(0.35 + p.health / 300)
        ? ok('Over the rooftops and gone. The block will talk about it for years.', { respect: rnd(3, 6), heat: 8 })
        : arrest(rnd(2, 5), 'You made it one roof before they tackled you.', { health: -rnd(5, 12) }) },
    ] },
  { id: 'poker', title: 'Back-Room Poker', when: p => p.age >= 18 && p.money >= 500,
    text: (p, c) => `${c.n} invites you to a high-stakes game behind the Lucky Lotus. Buy-in is $500.`,
    choices: [
      { label: 'Buy in', run: p => chance(0.42 + p.smarts / 400)
        ? ok('You read every bluff at the table.', { money: rnd(600, 4000), respect: 2 })
        : bad('Cleaned out by a pair of nines.', { money: -500 }) },
      { label: 'Pass', run: () => meh('You keep your money in your pocket.') },
    ] },
  { id: 'snitch', title: 'A Rat in the Crew', when: p => p.age >= 17 && p.flags.crew,
    text: (p, c) => `Word is ${c.n} from ${p.flags.crew} has been talking to the cops.`,
    choices: [
      { label: 'Confront them', run: (p, c) => chance(0.6)
        ? ok(`${c.first} swore it was a mistake. It won't happen again.`, { respect: rnd(4, 7) })
        : bad(`${c.first} ran straight to the cops and gave them your name.`, { heat: rnd(12, 20) }) },
      { label: 'Teach a lesson', run: (p, c) => ok(`${c.first} will be eating through a straw for a while.`, { respect: rnd(8, 12), heat: rnd(10, 15) }) },
      { label: 'Let it go', run: () => bad('The crew noticed you did nothing.', { respect: -6 }) },
    ] },
  { id: 'family', title: 'A Man in a Good Suit', once: true, when: p => p.age >= 18 && p.respect >= 30,
    text: (p, c) => `A sharp-dressed man slides into your booth at the Velvet Room. "The ${c.fam} family has been hearing your name."`,
    choices: [
      { label: 'Hear him out', run: (p, c) => { p.flags.family = c.fam; return ok(`"Keep your nose clean. The ${c.fam}s will call."`, { respect: rnd(8, 12) }); } },
      { label: 'Not interested', run: () => meh('He smiles thinly. "Nobody says no twice."', { respect: -3 }) },
    ] },
  { id: 'shot', title: 'Drive-By', w: 0.6, when: p => p.age >= 18 && p.respect >= 45,
    text: () => 'Someone put four bullets through your car window. They missed. Barely.',
    choices: [
      { label: 'Hunt the shooter', run: (p, c) => chance(0.5 + p.respect / 300)
        ? ok(`It was a kid from ${c.rival}. Message sent.`, { respect: rnd(10, 15), heat: rnd(12, 18) })
        : bad('They were waiting for you.', { health: -rnd(25, 45) }, 'Shot in a gang war') },
      { label: 'Skip town for a while', run: p => meh('You spent a few months in a motel up the coast.', { money: -Math.min(p.money, 3000), heat: -20 }) },
      { label: 'Shrug it off', run: () => meh('You got the window fixed. The streets noticed you did nothing.', { respect: -4 }) },
    ] },
  { id: 'chowline', title: 'Chow Line', inside: true, w: 2, when: () => true,
    text: (p, c) => `A huge inmate called ${c.n} shoves your tray to the floor.`,
    choices: [
      { label: 'Stand your ground', run: (p, c) => brawl('brute', c.first,
        () => ok(`You put ${c.first} down. The whole block saw it.`, { respect: rnd(8, 12) }),
        () => bad('You got two broken ribs for your trouble.', {}, 'Killed in a prison fight')) },
      { label: 'Back down', run: () => bad('You picked your food off the floor. Everyone saw.', { respect: -6 }) },
      { label: 'Pay protection ($200)', run: p => p.money >= 200
        ? meh('Your commissary money buys you some peace.', { money: -200, respect: -2 })
        : bad("You can't pay. That's worse.", { health: -rnd(10, 15) }, 'Killed in a prison fight') },
    ] },
  { id: 'friend', title: 'Straight Job Offer', once: true, when: p => p.age >= 20 && !p.job,
    text: (p, c) => `Your childhood friend ${c.full} went straight and offers you a job at the family auto shop. $31,000 a year.`,
    choices: [
      { label: 'Take it', run: (p, c) => {
        p.job = { title: 'Mechanic', place: `${c.last} Auto Repair`, salary: 31000 };
        return ok('Grease under your nails. Honest money.', { heat: -5 });
      } },
      { label: 'Turn it down', run: () => meh('"Honest work isn\'t for everybody," you tell your old friend.') },
    ] },
  { id: 'crash', title: 'Car Crash', w: 0.4, when: p => p.age >= 16,
    auto: () => bad('A drunk driver T-boned you on the Harbor Expressway.', { health: -rnd(6, 18) }, 'Killed in a car crash') },
  { id: 'scratch', title: 'Lucky Ticket', w: 0.3, when: p => p.age >= 18,
    auto: () => { const won = pick([500, 1000, 5000, 20000]); return ok(`A $2 scratch card paid out ${cash(won)}.`, { money: won }); } },
];
