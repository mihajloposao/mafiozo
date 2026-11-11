// Mafiozo – engine and UI. Game content (crimes, events, names) lives in data.js.

const SAVE_KEY = 'mafiozo.save.v1';
const STATS = [['health', 'HP'], ['str', 'Strength'], ['smarts', 'Smarts'], ['respect', 'Respect'], ['heat', 'Heat'], ['soul', 'Soul']]; // soul runs -100 (evil) to +100 (good)
const LABEL = Object.fromEntries(STATS);
let P = null; // the life being played, saved after every change

// ---------- helpers (data.js uses these too) ----------

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const chance = p => Math.random() < p;
const pick = list => list[Math.floor(Math.random() * list.length)];
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// Starting HP for a child: 1-35, bell-shaped around 26 (a draw outside the range is drawn again).
function childHp() {
  for (;;) {
    const v = Math.round(26 + 6 * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()));
    if (v >= 1 && v <= 35) return v;
  }
}
const hpMax = () => (P.age <= 12 ? 35 : 100); // HP (the health stat) is capped at 35 in childhood, 100 later
const cash = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const $ = sel => document.querySelector(sel);

// An outcome: a line for the life log, stat effects, and the cause of death if it kills you.
const ok = (text, fx = {}, cause) => ({ text, fx, cause, tone: 'good' });
const bad = (text, fx = {}, cause) => ({ text, fx, cause, tone: 'bad' });
const meh = (text, fx = {}, cause) => ({ text, fx, cause, tone: '' });

const rank = p => (p.fam ? `${FAM_RANKS[p.fam.rank]}, ${p.fam.name} family` : '');

// ---------- the life ----------

function newLife(first, last, gender) {
  P = {
    first, last, gender, age: 0, born: new Date().getFullYear() - 5, district: pick(DISTRICTS),
    money: 0, health: childHp(), str: rnd(5, 20), smarts: rnd(15, 90), respect: 0, heat: 0, soul: 0,
    alive: true, cause: '', done: {}, pending: [], tally: { peak: 0 }, log: [],
  };
  newYear();
  note(`You were born in ${CITY}, in ${P.district}. It's a ${gender === 'M' ? 'boy' : 'girl'}.`);
  note(pick(PARENTS));
  [...new Set([pick(KID_MEMORIES), pick(KID_MEMORIES)])].forEach(t => note(t)); // a couple of early memories
  P.age = 5; // life starts in earnest at five, with the first challenge
  newYear();
  queueChallenge();
  save();
  render();
  nextEvent();
}

function newYear() {
  P.done = {};
  P.log.push({ age: P.age, items: [] });
  if (P.log.length > 100) P.log.shift();
}

function note(text, tone = '', fx = '') {
  P.log[P.log.length - 1].items.push({ text, tone, fx });
}

// Applies stat effects and returns a readable summary like "+$300 · Respect +4".
function applyFx(fx = {}) {
  const parts = [];
  for (const [k, v] of Object.entries(fx)) {
    if (!v) continue;
    if (k === 'money') {
      const before = P.money;
      P.money = Math.max(0, P.money + v);
      if (P.money !== before) parts.push((v > 0 ? '+' : '') + cash(P.money - before));
    } else {
      const before = P[k];
      P[k] = clamp(P[k] + v, k === 'soul' ? -100 : 0, k === 'health' ? hpMax() : 100);
      const d = P[k] - before;
      if (d) parts.push(`${LABEL[k]} ${d > 0 ? '+' : ''}${d}`);
    }
  }
  P.tally.peak = Math.max(P.tally.peak, P.money);
  return parts.join(' · ');
}

function die(cause) {
  P.alive = false;
  P.cause = cause;
  P.pending = [];
  note(`You died at ${P.age}. ${cause}.`, 'bad');
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(P)); } catch (e) { /* storage blocked: play without saving */ }
}

function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}

// ---------- families ----------

function joinFamily(name, text, fx = {}) {
  P.fam = { name, rank: 0 };
  return ok(`${text} You are now an Associate of the ${name} family.`, { respect: 5, ...fx });
}

// Starts a random test for that family right away.
function seekFamily(name) {
  closeSheet();
  const kind = pick(FAMILY_TESTS), e = EVENTS.find(x => x.id === kind);
  P.pending.unshift({ id: e.id, c: makeCtx(e, { fam: name }) });
  save();
  nextEvent();
}

// ---------- years and events ----------

function ageUp() {
  if (!P.alive) return render();
  if (P.pending.length) return nextEvent();
  P.age++;
  newYear();
  applyFx({ health: rnd(0, 5) }); // agreed: HP grows by itself 0-5 a year, up to the age cap; nothing else changes by itself
  queueChallenge();
  save();
  render();
  nextEvent();
}

// The yearly challenge: first a minigame that fits the age (never the same one twice in a row when there is a
// choice), then one of its stories, so every minigame comes up equally often however many stories it has.
function queueChallenge() {
  const fits = CHALLENGES.filter(c => P.age >= c.min && P.age <= c.max), games = [...new Set(fits.map(c => c.game))];
  const fresh = games.filter(g => g !== P.lastGame), game = pick(fresh.length ? fresh : games);
  if (!game) return;
  P.lastGame = game;
  const story = pick(fits.filter(c => c.game === game)).id, e = EVENTS.find(x => x.id === story);
  P.pending.unshift({ id: e.id, c: makeCtx(e) });
}

function makeCtx(e, extra = {}) {
  const first = pick(FIRST_M.concat(FIRST_F)), last = pick(LAST);
  const c = {
    first, last, full: `${first} ${last}`, fam: pick(FAMILIES), ...extra,
  };
  return { ...c, ...(e.ctx ? e.ctx(P, c) : {}) };
}

const titleOf = (e, c) => (typeof e.title === 'function' ? e.title(P, c) : e.title);

// Shows the next queued event, skipping any that no longer exist (an old save).
function nextEvent() {
  while (P.pending.length) {
    const { id, c } = P.pending[0];
    const e = EVENTS.find(x => x.id === id);
    if (!e) { P.pending.shift(); continue; }
    if (e.auto) { P.pending.shift(); return resolve(e.auto(P, c), titleOf(e, c)); }
    return showEvent(e, c);
  }
}

function showEvent(e, c) {
  const choices = e.choices
    .map((ch, i) => `<button class="opt" data-choice="${i}">${esc(typeof ch.label === 'function' ? ch.label(P, c) : ch.label)}</button>`)
    .join('');
  showModal(`<div class="card" role="dialog" aria-modal="true"><p class="kicker">Age ${P.age} · Event</p><h2>${esc(titleOf(e, c))}</h2><p>${esc(e.text(P, c))}</p>${e.hint ? `<p class="tell">${esc(e.hint)}</p>` : ''}<div class="choices">${choices}</div></div>`);
}

function choose(i) {
  const { id, c } = P.pending.shift();
  const e = EVENTS.find(x => x.id === id);
  play(e.choices[i].run(P, c), titleOf(e, c));
}

// An outcome either resolves right away or starts a fight first.
const play = (r, title) => (r.fight ? startFight(r, title) : r.sneak ? startSneak(r.sneak, title) : r.safe ? startSafe(r.safe, title) : r.memory ? startMemory(r.memory, title) : r.sling ? startSling(r.sling, title) : resolve(r, title));

function resolve(r, title) {
  const fx = applyFx(r.fx);
  note(r.text, r.tone, fx);
  if (P.health <= 0 && P.alive) die(r.cause || 'Your injuries were too much');
  save();
  render();
  showModal(`<div class="card ${r.tone}" role="dialog" aria-modal="true"><p class="kicker">Age ${P.age}</p><h2>${esc(title)}</h2><p>${esc(r.text)}</p>${fx ? `<p class="fx">${esc(fx)}</p>` : ''}<div class="choices"><button class="primary" data-do="next">Continue</button></div></div>`);
}

// ---------- fights ----------
// Each round the opponent picks a move and you pick yours while the needle crosses. Punch hits hardest but a block
// stops it; Grapple hits softer but breaks a block and drains stamina; Block stops a punch and gets stamina back;
// Punch against Grapple: both land. Where the needle is grades your timing for every move, blocks included.
// Strength sets your hit power and zone size, HP (the health stat) your fight points, smarts can reveal the next move;
// lost stamina makes the needle faster and the zones narrower.
const MOVES = { punch: 'Punch', block: 'Block', grapple: 'Grapple' };
const TELLS = { punch: 'pulls a fist back', block: 'raises both arms', grapple: 'crouches low, arms wide' };
const MOVE_ICON = { punch: '👊', block: '🛡️', grapple: '🤼', flee: '🏃' };
const COUNTER = { punch: 'block', grapple: 'punch', block: 'grapple' }; // the best answer to each move (test room reads)
const COST = { punch: 25, grapple: 30, block: 0, flee: 0 }; // stamina a move costs the one who makes it
const DRAIN = { punch: 5, grapple: 20 }; // stamina a landed move takes from the one it hits
const GRAPPLE = 0.6; // a grapple hits for 60% of a punch
const cap = s => s[0].toUpperCase() + s.slice(1);
let F = null; // the fight in progress (not saved)

// `foe` is a key of FOES or a fighter object; win/lose/flee get the final fight state.
// A foe with str/health ranges is built by your own rules: HP from health, punch and stamina formulas as you.
const fighter = f => {
  if (!f.str) return f;
  const s = rnd(...f.str), h = typeof f.health === 'function' ? f.health() : rnd(...f.health);
  return { ...f, hp: h, pow: Math.round(12 + s / 4), stam: 60 + Math.round(s * 0.6) };
};
const brawl = (foe, name, win, lose, flee) => ({ fight: { ...fighter(typeof foe === 'string' ? FOES[foe] : foe), name }, win, lose, flee });

function startFight(r, title) {
  const you = Math.max(1, P.health); // you fight with the HP you have
  F = { ...r, title, foe: r.fight, you, youMax: you, them: r.fight.hp, round: 1, taken: 0, last: r.intro || '' };
  Object.assign(F, { stam: 60 + Math.round(P.str * 0.6), stamMax: 60 + Math.round(P.str * 0.6), hist: [], reads: 0 });
  F.fstam = F.fstamMax = F.foe.stam || 70 + F.foe.pow * 2; // the opponent's stamina, same costs as yours
  fightMenu();
}

function fightCard(body) {
  const bar = (label, v, max, cls) => `<div class="hp ${cls}"><span>${esc(label)}</span><b>${Math.max(0, v)}</b><i style="--v:${(Math.max(0, v) / max) * 100}%"></i></div>`;
  return `<div class="card fight" role="dialog" aria-modal="true"><p class="kicker">Round ${F.round} · Strength ${P.str}</p><h2>${esc(F.title)}</h2>
    <div class="hps">${bar('You', F.you, F.youMax, 'me')}${bar('Stamina', F.stam, F.stamMax, 'stam')}${bar(F.foe.name, F.them, F.foe.hp, 'foe')}</div>
    ${F.last ? `<p class="flog">${esc(F.last)}</p>` : ''}${body}</div>`;
}

// Each round the needle waits a moment (longer with smarts), then crosses the meter once. The zones are wider with
// strength and narrower as stamina runs out: the bright middle is Perfect, the band around it Solid, the rest Sloppy.
function fightMenu() {
  const mix = F.foe.mix;
  let roll = Math.random() * Object.values(mix).reduce((x, y) => x + y, 0);
  F.next = Object.keys(mix).find(k => (roll -= mix[k]) < 0) || 'punch';
  if (F.fstam < 30 && F.next !== 'block' && chance(0.6)) F.next = 'block'; // a tired opponent backs off to catch a breath
  if (F.v2) foeThinks();
  const fit = Math.max(0, F.stam) / F.stamMax; // 1 fresh, 0 out of stamina
  const tired = 0.6 + 0.4 * fit; // out of stamina the zones shrink to 60%
  const solid = (12 + P.str * 0.12) * tired, perfect = (4 + P.str * 0.04) * tired, x = 15 + Math.random() * (85 - solid);
  F.zone = { x, solid, px: x + (solid - perfect) / 2, perfect };
  F.delay = 200 + P.smarts * 6;
  F.speed = (F.foe.cross ? 100 / F.foe.cross : F.foe.spd * 60) * (1 + 0.4 * (1 - fit)); // percent per second; up to 40% faster tired
  const t0 = (F.t0 = performance.now());
  const shown = F.v2 ? F.shown : chance(P.smarts / 130) ? F.next : null;
  const tell = (shown ? `${cap(F.foe.name)} ${TELLS[shown]}.` : `You can't read ${F.foe.name}.`) + (F.fstam < 30 ? ` ${cap(F.foe.name)} is out of breath.` : '');
  showModal(fightCard(`<p class="tell">${esc(tell)}</p>
    <div class="meter"><i class="solid" style="left:${x}%;width:${solid}%"></i><i class="perfect" style="left:${F.zone.px}%;width:${perfect}%"></i><b id="needle"></b></div>
    <div class="moves">${Object.entries(MOVES).map(([k, v]) => `<button class="opt" data-move="${k}">${v}<small>${k === 'block' ? '+15' : `−${COST[k]}`} stamina</small></button>`).join('')}</div>
    <p class="rules">Tap a move while the needle is in the bright zone. It crosses only once: hesitate and the hit lands unopposed.<br>Punch hits hardest, Block stops it · Grapple hits softer, breaks Block and drains stamina · Punch and Grapple both land<br>Timing counts for every move. Only a clean block gets stamina back; the less stamina, the faster the needle and the narrower the zones.${F.v2 ? '<br>A tell can be a feint, and fighters punish a move you keep repeating.' : ''}</p>
    <button class="ghost flee" data-do="flee">Run for it</button>`));
  const sweep = () => {
    if (!F || F.t0 !== t0) return; // the next round or the end of the fight stops this loop
    const pos = needlePos();
    $('#needle').style.left = `${pos}%`;
    if (pos >= 100) return hesitate();
    requestAnimationFrame(sweep);
  };
  requestAnimationFrame(sweep);
}

// One pass: the needle waits F.delay ms, then crosses at F.speed percent per second.
const needlePos = () => Math.min(100, Math.max(0, ((performance.now() - F.t0 - F.delay) / 1000) * F.speed));

// The opponent's blow before your timing counts: harder if you were left open, softer (down to 60%) when out of breath.
const foeHit = () => rnd(F.foe.pow - 3, F.foe.pow + 3) * (F.exposed ? 1.5 : 1) * (0.6 + (0.4 * Math.max(0, F.fstam)) / F.fstamMax);

// The needle ran out before you picked a move, so the opponent's move lands unopposed.
function hesitate() {
  const them = F.next, Name = cap(F.foe.name), hit = foeHit();
  F.reads = 0;
  F.opening = F.exposed = false;
  if (them === 'block') return hitRound({ text: `${Name} only kept a guard up.`, label: 'Too slow.' });
  hitRound({ took: Math.round(them === 'grapple' ? hit * GRAPPLE : hit), drainMe: DRAIN[them], label: 'Too slow.',
    text: them === 'grapple' ? `${Name} took you down.` : `${Name} hit you clean.` });
}

function strike(me) {
  const pos = needlePos(), z = F.zone;
  const [q, label] = pos >= z.px && pos <= z.px + z.perfect ? [1.5, 'Perfect!'] : pos >= z.x && pos <= z.x + z.solid ? [1, 'Solid.'] : [0.5, 'Sloppy.'];
  F.hist.push(me);
  if (F.v2) F.reads = F.shown && me === COUNTER[F.shown] ? F.reads + 1 : 0; // following the tell again and again gets noticed
  const them = F.next, name = F.foe.name, Name = cap(name); // Name starts a sentence
  const flabel = F.fstam < 30 ? 'Tired.' : '', hit = foeHit();
  const power = (12 + P.str / 4) * q * (F.opening ? 1.5 : 1); // your punch; someone left open last round takes 50% more
  F.opening = F.exposed = false;
  const mine = Math.round(me === 'grapple' ? power * GRAPPLE : power);
  const theirs = Math.round((them === 'grapple' ? hit * GRAPPLE : hit) * (2 - q)); // your timing decides how well you take it
  let dealt = 0, took = 0, drainThem = 0, drainMe = 0, text;
  const land = (share = 1) => { dealt = Math.round(mine * share); drainThem = Math.round(DRAIN[me] * share); };
  const hurt = (share = 1) => { took = Math.round(theirs * share); drainMe = Math.round(DRAIN[them] * share); };
  if (me === 'block' && them === 'block') text = 'You both kept your guard up. Nothing landed.';
  else if (me === them) { land(0.5); hurt(0.5); text = me === 'punch' ? 'You traded punches.' : `You and ${name} went down wrestling.`; }
  else if (me === 'block' && them === 'punch') { // a block never hurts anyone; its timing decides how much gets through
    if (q === 1.5) { F.opening = true; text = `Perfect block. ${Name} is wide open.`; }
    else if (q === 1) text = `You blocked ${name}'s punch.`;
    else { took = Math.round(hit / 2); drainMe = Math.round(DRAIN.punch / 2); text = `Your guard came up late. Half of ${name}'s punch got through.`; }
  } else if (me === 'punch' && them === 'block') { // and the punch's timing decides what the guard does with it
    if (q === 1.5) { land(0.5); text = `Your punch broke through ${name}'s guard.`; }
    else if (q === 1) text = `${Name} blocked your punch.`;
    else { F.exposed = true; text = `${Name} blocked your sloppy punch. You are wide open.`; }
  } else if (me === 'grapple' && them === 'block') { land(); text = `You got past the guard and took ${name} down.`; }
  else if (me === 'block' && them === 'grapple') { hurt(); text = `${Name} got past your guard and took you down.`; }
  else { // punch against grapple: both land
    land(); hurt();
    text = me === 'punch' ? `You caught ${name} coming in, but ${name} still took you down.` : `You took ${name} down, but ate a punch on the way in.`;
  }
  if (F.v2 && F.feint) text += ' It was a feint.';
  if (F.v2 && F.learned && took) text += ` ${Name} saw that coming.`;
  hitRound({ dealt, took, text, mine: me, label, flabel, drainMe, drainThem,
    rest: me === 'block' && q > 0.5 && them !== 'grapple', frest: them === 'block' && me !== 'grapple' });
}

// Applies a round, then shows both moves side by side; the next round starts only when the player asks for it.
// Stamina: each move costs its maker, a landed move drains the one it hits, a block that held gets 15 back.
function hitRound({ dealt = 0, took = 0, text, mine = null, label = '', flabel = '', drainMe = 0, drainThem = 0, rest = false, frest = F.next === 'block' }) {
  F.t0 = null; // stops this round's needle
  F.stam = Math.min(F.stamMax, Math.max(0, F.stam - (mine ? COST[mine] : 0) - drainMe) + (rest ? 15 : 0));
  F.fstam = Math.min(F.fstamMax, Math.max(0, F.fstam - COST[F.next] - drainThem) + (frest ? 15 : 0));
  F.them -= dealt;
  F.you -= took;
  F.taken += took;
  F.clash = { mine, label, theirs: F.next, flabel, text, dealt, took };
  F.ended = F.them <= 0 ? 'win' : F.you <= 0 ? 'lose' : null;
  const c = F.clash, name = cap(F.foe.name);
  const side = (who, move, note) => `<div><small>${esc(who)}</small><b>${move ? MOVE_ICON[move] : '…'}</b><span>${move ? MOVES[move] || 'Ran' : 'Nothing'}</span>${note ? `<em>${esc(note)}</em>` : ''}</div>`;
  showModal(fightCard(`<div class="clash">${side('You', c.mine, c.label)}<i>vs</i>${side(name, c.theirs, c.flabel)}</div>
    <p class="flog">${esc(c.text)} (You −${c.took} · ${esc(name)} −${c.dealt})</p>
    <button class="primary next" data-do="fightNext">${F.ended ? 'Continue' : 'Next round'}</button>`));
}

function fightNext() {
  if (!F) return;
  if (F.ended) return endFight(F.ended);
  F.round++;
  F.last = F.opening ? `${cap(F.foe.name)} is wide open: your move lands 50% harder.` : F.exposed ? 'You are wide open: the next hit against you lands 50% harder.' : '';
  fightMenu();
}

// Getting away depends on how much fight you have left in you right now: fight points and stamina.
// A failed run ends in a grapple: grapple damage and its stamina drain.
function flee() {
  if (chance(0.15 + (0.35 * Math.max(0, F.you)) / F.youMax + (0.3 * F.stam) / F.stamMax)) return endFight('flee');
  F.next = 'grapple'; // you were grabbed on the way out
  const took = Math.round(foeHit() * GRAPPLE);
  F.opening = F.exposed = false;
  hitRound({ took, drainMe: DRAIN.grapple, mine: 'flee', text: `You tried to run. ${cap(F.foe.name)} grabbed you and dragged you back.` });
}

function endFight(kind) {
  if (F.test) { // fight test room: show the result, touch nothing in the life
    const { title, foe, round, testFoe } = F;
    F = null;
    return showModal(`<div class="card ${kind === 'win' ? 'good' : 'bad'}" role="dialog" aria-modal="true"><p class="kicker">${esc(title)}</p>
      <h2>${{ win: 'You Won', lose: 'You Lost', flee: 'You Ran' }[kind]}</h2><p>${kind === 'win' ? `You beat ${esc(foe.name)} in ${round} rounds.` : kind === 'lose' ? `${esc(cap(foe.name))} put you down in round ${round}.` : 'You ran for the door.'}</p>
      <div class="choices"><button class="primary" data-ft="${testFoe}">Fight again</button><button class="opt" data-ft="menu">Pick another opponent</button><button class="ghost" data-ft="close">Close</button></div></div>`);
  }
  const r = F[kind] ? F[kind](F) : meh('You ran. Your pride did not make it.', { respect: -2 });
  if (!r.exact) r.fx = { ...r.fx, health: (r.fx.health || 0) - Math.round(F.taken * 0.35) }; // `exact` outcomes set their own injuries
  const title = F.title;
  F = null;
  resolve(r, title);
}

// New rules (fight test room for now): fighters punish a move you keep repeating and sometimes fake their tell,
// more often the more you blindly follow their tells. Smarts make tells show up more often and feints rarer.
function foeThinks() {
  const recent = F.hist.slice(-3), fav = Object.keys(MOVES).find(m => recent.filter(x => x === m).length >= 2);
  F.learned = !!fav && chance(F.foe.learn || 0.4);
  if (F.learned) F.next = COUNTER[fav];
  F.feint = false;
  F.shown = null;
  if (chance((F.foe.read ?? 0.7) * (0.7 + P.smarts / 333))) {
    F.feint = chance(Math.min(0.8, (F.foe.feint || 0.15) * (1 + F.reads) * (1 - P.smarts / 200)));
    F.shown = F.feint ? pick(Object.keys(MOVES).filter(m => m !== F.next)) : F.next;
  }
}

function fightTestMenu() {
  showModal(`<div class="card" role="dialog" aria-modal="true"><p class="kicker">Fight test</p><h2>Pick a Sparring Partner</h2>
    <p>Extra rules here: a tell can be a feint, and fighters punish a move you keep repeating. Nothing here affects your life.</p>
    <div class="choices">${SPARRING.map((f, i) => `<button class="opt" data-ft="${i}">${esc(cap(f.name))} · ${f.level}</button>`).join('')}<button class="ghost" data-ft="close">Close</button></div></div>`);
}

function ftCmd(v) {
  if (v === 'close') return hideModal();
  if (v === 'menu') return fightTestMenu();
  const f = SPARRING[+v];
  startFight({ ...brawl(f, f.name), v2: true, test: true, testFoe: v }, 'Fight Test');
}

// ---------- sneaking (turn-based) ----------
// Tap a tile next to you to step there, wait, or toss a coin. After every action the guards take their turn.
// Guards and cameras see a cone in front of them (walls and desks block it); the dog smells the 4 tiles around it.
// Whoever notices you (guard, camera or dog) sounds the alarm: the guard runs at you, two steps for each of yours,
// to where you were last seen, looks around there and gives up if you stay hidden. Only a tackle catches you.
// Step on a guard from right behind to knock them out.
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR8 = { ...DIRS, 'up-left': [-1, -1], 'up-right': [1, -1], 'down-left': [-1, 1], 'down-right': [1, 1] };
const ARROW = { up: '↑', down: '↓', left: '←', right: '→', 'up-left': '↖', 'up-right': '↗', 'down-left': '↙', 'down-right': '↘' };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const CCW = { up: 'left', left: 'down', down: 'right', right: 'up' };
const GUARD_ICON = { cop: '👮', cam: '📷', dog: '🐕' };
const ALARM = { cop: 'The guard spotted you. Run!', cam: 'The camera spotted you. The guard is coming!', dog: 'The dog started barking. The guard is coming!' };
const ENDING = { win: ['Clean Job', 'good'], loud: ['Got Away', 'good'], fled: ['Slipped Out', ''], caught: ['Caught', 'bad'], quit: ['Walked Away', ''] };
const CONE = { cop: 3, cam: 3 }; // how many tiles deep each one sees
const dirOf = (a, b) => (b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up');
let S = null; // the sneak in progress (not saved)

// `job` is { room, entry?, label?, end?(how, bonus) }. Entry: 'mask' (guards only notice you up close but never let go),
// 'back' (start at R), 'shift' (one guard fewer, limited moves). With `end`, the result goes back into the life.
function startSneak(job, title) {
  const room = job.room, entry = job.entry || 'front', door = entry === 'back' ? 'R' : 'S';
  const tiles = room.map.map(r => r.split('').map(t => ('SR'.includes(t) && t !== door ? '#' : t)));
  const y = tiles.findIndex(r => r.includes(door)), x = tiles[y].indexOf(door);
  const guards = room.guards.filter((g, i) => !(entry === 'shift' && i === room.shiftOff))
    .map(g => ({ face: g.turns ? g.turns[0] : 'down', k: 0, wait: 0, path: [], looks: [], ...g }));
  S = { job, title, room, tiles, guards, x, y, door, mask: entry === 'mask', limit: entry === 'shift' ? room.shiftMoves : 0,
    got: false, loud: false, bonus: false, coins: 2, moves: 0, aiming: false, over: null, msg: '' };
  guards.forEach(planGuard);
  renderSneak();
}

const say = text => { S.msg = S.msg ? `${S.msg} ${text}` : text; };
const tileAt = (x, y) => (S.tiles[y] || [])[x];
const clearAt = (x, y) => { const t = tileAt(x, y); return !!t && t !== '#' && t !== 'B'; }; // sight and steps pass
const guardAt = (x, y) => S.guards.find(g => !g.down && g.x === x && g.y === y);
const walkable = (x, y) => clearAt(x, y) && !guardAt(x, y);
const seeable = (x, y) => clearAt(x, y) && !'SR'.includes(tileAt(x, y)); // nobody sees into a doorway
const roamable = (x, y) => ['.', '$'].includes(tileAt(x, y)); // guards keep off the door and the target
const chased = () => S.guards.some(g => g.chase);

// Shortest walk for a guard, as a list of steps.
function pathTo(x0, y0, [gx, gy]) {
  const prev = { [`${x0},${y0}`]: null }, queue = [[x0, y0]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === gx && y === gy) {
      const steps = [];
      for (let k = `${x},${y}`; prev[k]; k = prev[k]) steps.unshift(k.split(',').map(Number));
      return steps;
    }
    for (const [dx, dy] of Object.values(DIRS)) {
      const k = `${x + dx},${y + dy}`;
      if (!(k in prev) && roamable(x + dx, y + dy)) { prev[k] = `${x},${y}`; queue.push([x + dx, y + dy]); }
    }
  }
  return [];
}

function lineClear(x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 1; i < n; i++) if (!clearAt(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n))) return false;
  return true;
}

// Tiles a guard covers, with their distance: a cone for guards and cameras, the 4 neighbors for the dog.
function sightOf(g) {
  if (g.down) return [];
  if (g.type === 'dog' || (g.type === 'cop' && S.mask)) return Object.values(DIRS).map(([dx, dy]) => [g.x + dx, g.y + dy, 1]).filter(([x, y]) => seeable(x, y));
  const [fx, fy] = DIR8[g.face], fl = Math.hypot(fx, fy), out = [];
  S.tiles.forEach((row, y) => row.forEach((t, x) => {
    const dx = x - g.x, dy = y - g.y, dist = Math.hypot(dx, dy);
    if (dist && dist <= CONE[g.type] + 0.5 && seeable(x, y) && (dx * fx + dy * fy) / (dist * fl) >= 0.85 && lineClear(g.x, g.y, x, y)) out.push([x, y, dist]);
  }));
  return out;
}
const sees = g => sightOf(g).some(([x, y]) => x === S.x && y === S.y);

// Each guard decides its next action a turn ahead, so the arrows can show it.
function planGuard(g) {
  if (g.down) return;
  if (g.type === 'cam') g.plan = { face: g.turns[(g.k + 1) % g.turns.length] };
  else if (g.type === 'cop' && g.chase) planChase(g);
  else if (g.type === 'cop' && g.wait > 0) g.plan = { stay: true }; // listening for the coin
  else if (g.looks.length) g.plan = { face: g.looks[0] };
  else if (g.type === 'dog') g.plan = dogStep(g);
  else {
    if (!g.path.length) g.path = pathTo(g.x, g.y, pick(g.points.filter(([x, y]) => x !== g.x || y !== g.y)));
    if (g.path.length && chance(0.1)) { g.looks = [OPP[g.face]]; g.plan = { face: OPP[g.face] }; } // a look over the shoulder
    else g.plan = g.path.length ? { to: g.path[0] } : { stay: true };
  }
}

// Runs to where you were last seen; once there, looks around, then goes back to the patrol.
function planChase(g) {
  g.path = pathTo(g.x, g.y, g.chase);
  if (g.path.length) return (g.plan = { run: true });
  if (!g.searched) Object.assign(g, { searched: true, looks: [CCW[g.face], OPP[CCW[g.face]], OPP[g.face]] });
  if (g.looks.length) return (g.plan = { face: g.looks[0] });
  Object.assign(g, { chase: null, searched: false });
  say('The guard lost your trail.');
  planGuard(g);
}

function dogStep(g) {
  if (g.goal) {
    const path = g.wait > 0 ? pathTo(g.x, g.y, g.goal) : [];
    if (path.length) return { to: path[0] }; // running to the coin
    g.goal = null;
  }
  if (chance(0.3)) return { stay: true }; // nose to the floor
  const [x1, y1, x2, y2] = g.zone;
  const steps = Object.values(DIRS).map(([dx, dy]) => [g.x + dx, g.y + dy])
    .filter(([x, y]) => x >= x1 && x <= x2 && y >= y1 && y <= y2 && roamable(x, y));
  return steps.length ? { to: pick(steps) } : { stay: true };
}

// Carries out the planned action. Returns why you got caught, if you did.
function actGuard(g) {
  const p = g.plan;
  if (g.down || !p) return '';
  if (g.type === 'cam') { g.k = (g.k + 1) % g.turns.length; g.face = g.turns[g.k]; }
  else if (p.run) {
    for (let n = 0; n < 2; n++) {
      if (S.mask || sees(g)) g.chase = [S.x, S.y]; // in disguise, once they make you they never let go
      const next = pathTo(g.x, g.y, g.chase)[0];
      if (!next) break;
      if (next[0] === S.x && next[1] === S.y) return 'The guard tackled you.';
      if (guardAt(...next)) break;
      g.face = dirOf([g.x, g.y], next);
      [g.x, g.y] = next;
    }
  } else if (p.to) {
    const onYou = p.to[0] === S.x && p.to[1] === S.y;
    if (onYou && g.type === 'cop') return 'The guard walked right into you.';
    if (!onYou && !guardAt(...p.to)) {
      g.face = dirOf([g.x, g.y], p.to);
      [g.x, g.y] = p.to;
      if (g.type === 'cop') {
        g.path.shift();
        if (!g.path.length && chance(0.5)) g.looks = [CCW[g.face], OPP[CCW[g.face]]]; // arrived: look left, then right
      }
    }
  } else if (p.face) { g.face = p.face; g.looks.shift(); }
  if (g.wait > 0) g.wait--;
  planGuard(g);
  return '';
}

// Sends every guard running at you; the noise even wakes a guard you knocked out.
function alarm(text) {
  const cops = S.guards.filter(g => g.type === 'cop');
  if (!chased()) say(text);
  if (cops.some(c => c.down)) say('The noise woke the guard up!');
  S.loud = true;
  for (const c of cops) { Object.assign(c, { down: false, chase: [S.x, S.y], searched: false, looks: [], wait: 0 }); planGuard(c); }
}

function detect() {
  const watchers = S.guards.filter(g => !g.down && sees(g));
  if (watchers.length) alarm(ALARM[(watchers.find(g => g.type === 'cop') || watchers[0]).type]);
}

function endTurn(msg) {
  S.moves++;
  if (msg) say(msg);
  for (const g of S.guards) { const why = actGuard(g); if (why) return sneakOver('caught', why); }
  detect();
  if (S.limit && S.moves >= S.limit) { S.limit = 0; alarm('The next shift walked in!'); }
  renderSneak();
}

function sneakOver(how, msg) {
  S.over = how;
  S.msg = msg;
  renderSneak();
}

function sneakTap(key) {
  if (!S || S.over) return;
  const [x, y] = key.split(',').map(Number);
  const dist = Math.abs(x - S.x) + Math.abs(y - S.y);
  if (S.aiming) {
    if (dist > 3 || !clearAt(x, y)) return;
    Object.assign(S, { aiming: false, coins: S.coins - 1, msg: '' });
    for (const g of S.guards) {
      const far = Math.abs(g.x - x) + Math.abs(g.y - y), dx = x - g.x, dy = y - g.y;
      if (g.down) continue;
      if (g.type === 'cop' && g.chase && far <= 6) Object.assign(g, { chase: [x, y], searched: false, looks: [] }); // runs to check the sound
      else if (g.type === 'cop' && !g.chase && far <= 5) {
        g.face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        Object.assign(g, { wait: 2, looks: [] });
      } else if (g.type === 'dog' && far <= 6) Object.assign(g, { goal: [x, y], wait: 4 });
      else continue;
      planGuard(g);
    }
    return endTurn('Clink. Heads turn toward the sound.');
  }
  if (dist !== 1) return;
  const g = guardAt(x, y);
  if (g) {
    const [dx, dy] = DIRS[g.face] || [0, 0];
    if (g.type !== 'cop' || S.x !== x - dx || S.y !== y - dy) return; // only from right behind
    if (!chance(Math.min(0.95, 0.45 + P.str / 150))) return sneakOver('caught', 'The guard turned around just in time.');
    Object.assign(g, { down: true, chase: null });
    S.msg = '';
    return endTurn('You choked the guard out. Lights out.');
  }
  if (!walkable(x, y)) return;
  Object.assign(S, { x, y, msg: '' });
  const t = tileAt(x, y);
  if (t === '*') { S.got = true; S.tiles[y][x] = '.'; say('Got it. Now get back to the door.'); }
  if (t === '$') { S.bonus = true; S.tiles[y][x] = '.'; say(S.room.bonus.text); }
  if (t === S.door && (S.got || chased())) {
    S.moves++;
    if (!S.got) return sneakOver('fled', 'You slipped out the door empty-handed.');
    return sneakOver(S.loud ? 'loud' : 'win', S.loud ? `You got out with it, but they saw your face. ${S.moves} moves.` : `Clean job in ${S.moves} moves.`);
  }
  detect();
  endTurn('');
}

function sneakCmd(cmd) {
  if (cmd === 'done') { // a real job: hand the result back to the life
    const { job, title, over, bonus } = S;
    S = null;
    hideModal();
    const r = job.end(over, bonus);
    return r ? resolve(r, title) : nextEvent();
  }
  if (cmd === 'quit' && S.job.end && !S.over) return sneakOver('quit', 'You slipped back out before anyone noticed.');
  if (cmd === 'quit') { S = null; return hideModal(); }
  if (cmd === 'retry') return startSneak(S.job, S.title);
  if (S.over) return;
  if (cmd === 'wait') { S.msg = ''; return endTurn('You held still.'); }
  if (cmd === 'coin' && S.coins) { S.aiming = !S.aiming; renderSneak(); }
}

function renderSneak() {
  const cover = {}, next = {}, route = new Set(), readsRoutes = !!P && P.smarts >= 65;
  for (const g of S.guards) {
    for (const [x, y, dist] of sightOf(g)) {
      const c = (cover[`${x},${y}`] ||= {});
      c[g.type] = Math.max(c[g.type] || 0, dist <= 1.5 ? 0.5 : dist <= 2.5 ? 0.36 : 0.24); // stronger close to the source
    }
    if (g.down || !g.plan) continue;
    if (g.plan.to) next[g.plan.to.join(',')] = g.type;
    if (g.plan.run) g.path.slice(0, 2).forEach(t => (next[t.join(',')] = 'cop')); // two steps a turn
    if (g.type === 'cop' && readsRoutes) g.path.forEach(([x, y]) => route.add(`${x},${y}`)); // only smart crooks read the route
  }
  const me = esc(P ? P.first[0] + P.last[0] : 'ME');
  let cells = '';
  S.tiles.forEach((row, y) => row.forEach((t, x) => {
    const key = `${x},${y}`, g = guardAt(x, y), c = cover[key] || {}, d = Math.abs(x - S.x) + Math.abs(y - S.y);
    const ko = S.guards.some(o => o.down && o.x === x && o.y === y);
    const cls = [t === '#' ? 'wall' : t === 'B' ? 'cover' : 'floor', g && g.type === 'cam' && 'camera',
      c.cop && 'cop', c.cam && 'cam', c.dog && 'smell', next[key] && `next-${next[key]}`, route.has(key) && 'route',
      !S.over && (S.aiming ? d <= 3 && clearAt(x, y) && 'aim' : d === 1 && walkable(x, y) && 'near')].filter(Boolean).join(' ');
    let inner = { '*': S.room.target, $: S.room.bonus.icon, S: '🚪', R: '🚪' }[t] || (ko ? '💤' : '');
    if (x === S.x && y === S.y) inner = `<span class="me">${me}</span>`;
    else if (g) {
      const p = g.plan || {}, arrow = p.run ? '!' : p.to ? ARROW[dirOf([g.x, g.y], p.to)] : p.face ? ARROW[p.face] : '';
      inner = (g.icon || GUARD_ICON[g.type]) + (arrow ? `<i class="nx ${g.type}">${arrow}</i>` : '');
    }
    cells += `<button class="tl ${cls}" style="--ac:${c.cop || 0};--ak:${c.cam || 0}" data-tile="${key}" aria-label="Tile ${x + 1}, ${y + 1}">${inner}</button>`;
  }));
  const tip = S.aiming ? 'Tap a tile up to 3 steps away to toss the coin.' : S.msg || `Grab the ${S.room.target} and get back to the door 🚪.`;
  const mission = !!S.job.end;
  const controls = S.over
    ? (mission ? `<button class="primary" data-sn="done">Continue</button>` : `<button class="primary" data-sn="retry">Try again</button><button class="ghost" data-sn="quit">Close</button>`)
    : `<button class="opt" data-sn="wait">Wait</button><button class="opt" data-sn="coin"${S.coins ? '' : ' disabled'}>${S.aiming ? 'Cancel' : `Coin ×${S.coins}`}</button><button class="ghost" data-sn="quit"${mission && chased() ? ' disabled' : ''}>${mission ? 'Give up' : 'Quit'}</button>`;
  const [title, tone] = S.over ? ENDING[S.over] : ['Sneak In', ''];
  showModal(`<div class="card sneak ${tone}" role="dialog" aria-modal="true">
    <p class="kicker">${esc(S.job.label || 'Test room')} · Move ${S.moves}${S.limit ? `/${S.limit}` : ''}${S.got ? ' · Got it' : ''}${!S.over && chased() ? ' · <span class="alarm">Alarm</span>' : ''}</p>
    <h2>${title}</h2>
    <p class="tell">${esc(tip)}</p>
    <div class="sgrid" style="--cols:${S.tiles[0].length}">${cells}</div>
    <div class="row sctl">${controls}</div>
    <div class="legend"><span><i class="k cop"></i>Guard sees</span><span><i class="k cam"></i>Camera sees</span><span><i class="k dog"></i>Dog smells</span></div>
    <p class="rules">${S.mask ? 'In disguise, guards only notice you right next to them, but then they never let go. ' : ''}${S.limit ? 'When the move counter runs out, the next shift walks in. ' : ''}Walls and desks block the view. Arrows show each one's next move. ${readsRoutes ? 'Your smarts let you read the guard\'s route (dots).' : 'A smarter crook could read the guard\'s whole route.'} If anyone notices you, the guard runs 2 steps for each of yours and has to catch you. Get out of sight and the guard gives up. Step on a guard from behind to knock them out.</p></div>`);
  modal.querySelector('.sctl button')?.focus();
}

// ---------- safe cracking (memory) ----------
// Watch the owner punch in the code, then break in and type it from memory: three tries and a clock.
// Smarts keep each digit lit longer. Hiding in the closet gives a closer, longer look, unless the owner opens it
// (smarter crooks pick better hiding spots); a bribed insider writes down half the code.
const METHODS = { scope: 'Binoculars across the street', closet: 'Hide in the closet', bribe: 'Bribe the staff' };
const closetRisk = () => Math.max(0.05, 0.25 - P.smarts / 500);
const CLOSET_FOUND = 'The owner opened the closet to hang a coat. There you were.';
let V = null; // the safe job in progress (not saved)

function startSafe(job, title) {
  V = { job, title, code: Array.from({ length: job.digits }, () => rnd(0, 9)).join(''), phase: 'choose', input: '', tries: 3, msg: '', run: 0 };
  if (job.method) watchCode(); else renderSafe();
}

function startSafeTest() { startSafe({ ...pick(DELACROIX_JOBS), test: true }, 'Safe Test'); }

// Lights the keys one by one, as if you were watching the owner's finger.
function watchCode() {
  V.phase = 'watch';
  const run = ++V.run, seq = V.code.split('');
  const hold = (250 + P.smarts * 4) * (V.job.method === 'closet' ? 1.6 : 1); // up close, each key stays lit longer
  let i = 0;
  renderSafe();
  const tick = () => {
    if (!V || V.run !== run) return;
    const d = seq[i++];
    if (d === undefined) { V.phase = 'ready'; return renderSafe(); }
    const key = $(`.pad [data-key="${d}"]`);
    key.classList.add('lit');
    setTimeout(() => { key.classList.remove('lit'); setTimeout(tick, 120); }, hold);
  };
  setTimeout(tick, 600);
}

function breakIn() {
  V.phase = 'enter';
  V.deadline = performance.now() + V.job.time * 1000;
  const run = ++V.run;
  renderSafe();
  const tick = () => {
    if (!V || V.run !== run) return;
    const left = (V.deadline - performance.now()) / (V.job.time * 1000);
    if (left <= 0) return safeOver('late', 'Footsteps in the hall. The owner is back early.');
    const clock = $('.clock');
    if (clock) { clock.firstChild.style.width = `${left * 100}%`; clock.classList.toggle('low', left < 0.3); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function safeKey(k) {
  if (!V || V.phase !== 'enter') return;
  V.msg = '';
  if (k === 'ok') return tryCode();
  if (k === 'del') V.input = V.input.slice(0, -1);
  else if (V.input.length < V.code.length) V.input += k;
  renderSafe();
}

function tryCode() {
  if (V.input.length < V.code.length) return renderSafe();
  if (V.input === V.code) return safeOver('open', V.tries === 3 ? 'Click. The door swings open on the first try.' : `Click. It opens on try number ${4 - V.tries}.`);
  V.tries--;
  V.input = '';
  if (!V.tries) return safeOver('locked', 'Three wrong codes. The safe locks itself and an alarm starts screaming.');
  V.msg = `Wrong code. ${V.tries === 1 ? 'One try' : `${V.tries} tries`} left.`;
  V.shake = true;
  renderSafe();
}

function safeOver(how, msg) {
  Object.assign(V, { phase: 'over', result: how, msg, run: V.run + 1 });
  renderSafe();
}

function safeCmd(cmd) {
  if (cmd === 'done') { // a real job: hand the result back to the life
    const { job, title, result, tries } = V;
    V = null;
    hideModal();
    const r = job.end(result, tries);
    return r ? resolve(r, title) : nextEvent();
  }
  if (cmd === 'quit' && V.job.end && V.phase !== 'over') return safeOver('quit', 'You backed off and walked away.');
  if (cmd === 'quit') { V = null; return hideModal(); }
  if (cmd === 'retry') return startSafeTest();
  if (cmd === 'go') return breakIn();
  if (METHODS[cmd] && V.phase === 'choose') {
    V.job.method = cmd;
    if (cmd === 'closet' && chance(closetRisk())) return safeOver('found', CLOSET_FOUND);
    watchCode();
  }
}

function renderSafe() {
  const j = V.job, n = V.code.length, ph = V.phase, half = Math.ceil(n / 2);
  const title = { choose: 'Safe Test', watch: 'Watch Closely', ready: 'Ready?', enter: 'Crack It' }[ph]
    || { open: 'Open!', locked: 'Locked', late: 'Too Slow', quit: 'Walked Away', found: 'Found' }[V.result];
  const tell = {
    choose: `The safe in ${j.place} has a ${n}-digit code. How do you learn it?`,
    watch: j.method === 'closet' ? 'Through the crack in the closet door you watch the owner punch in the code.' : 'Through the binoculars you watch the owner punch in the code.',
    ready: 'You have the code in your head. Hopefully.',
    enter: V.msg || 'Type the code. The owner is back when the clock runs out.',
  }[ph] || `${V.msg} The code was ${V.code}.`;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  const pad = `<div class="pad">${keys.map(k => `<button class="key${k === 'ok' ? ' ok' : ''}" data-key="${k}" aria-label="${k === 'del' ? 'Delete' : k === 'ok' ? 'Enter' : k}">${{ del: '⌫', ok: '✓' }[k] || k}</button>`).join('')}</div>`;
  const slots = `<div class="code${V.shake ? ' shake' : ''}">${Array.from({ length: n }, (_, i) => `<span>${V.input[i] ?? '·'}</span>`).join('')}</div>`;
  const note = j.method === 'bribe' && ph !== 'watch' ? `<p class="note"><small>${esc(cap(j.insider || 'the maid'))}'s note</small>${V.code.slice(0, half).split('').join(' ')}${' _'.repeat(n - half)}</p>` : '';
  const tries = `<p class="tries">${'●'.repeat(V.tries)}${'○'.repeat(3 - V.tries)}</p>`;
  const body = {
    choose: `<div class="choices">${Object.entries(METHODS).map(([k, v]) => `<button class="opt" data-sf="${k}">${v}</button>`).join('')}</div>`,
    watch: pad,
    ready: `${note}${pad}<div class="choices"><button class="primary" data-sf="go">Break in</button></div>`,
    enter: `${note}${slots}${tries}<div class="clock"><i></i></div>${pad}`,
  }[ph] || `${slots}<div class="row sctl">${j.end ? '<button class="primary" data-sf="done">Continue</button>' : '<button class="primary" data-sf="retry">Try again</button><button class="ghost" data-sf="quit">Close</button>'}</div>`;
  V.shake = false;
  showModal(`<div class="card safe ${V.result === 'open' ? 'good' : V.result && V.result !== 'quit' ? 'bad' : ''}" role="dialog" aria-modal="true">
    <p class="kicker">${esc(V.title)} · ${esc(j.place)} · ${n} digits${j.method ? ` · ${METHODS[j.method]}` : ''}</p>
    <h2>${title}</h2><p class="tell">${esc(tell)}</p>${body}
    ${ph === 'over' ? '' : '<div class="row sctl"><button class="ghost" data-sf="quit">Quit</button></div>'}</div>`);
  modal.querySelector('[data-sf]:not([data-sf=quit])')?.focus();
}

// ---------- collecting (memory) ----------
// The debtor swears there is nothing left, so you sweep the place. All cards start face down; flip two at a time
// and take every pair you match. Junk is worth nothing and only eats the clock. Smarts buy a few extra seconds.
let M = null; // the sweep in progress (not saved)

function startMemory(job, title) {
  const cards = job.items.flatMap((_, i) => [i, i]);
  for (let i = cards.length - 1; i > 0; i--) { const k = rnd(0, i); [cards[i], cards[k]] = [cards[k], cards[i]]; }
  M = { job, title, cards, done: cards.map(() => false), open: [], taken: 0, phase: 'intro', msg: '', run: 0,
    time: job.time + Math.round(P.smarts / 20) };
  renderMemory();
}

function startMemoryTest() { startMemory({ ...pick(DEBTORS), test: true }, 'Memory Test'); }

function memStart() {
  M.phase = 'play';
  M.deadline = performance.now() + M.time * 1000;
  const run = ++M.run;
  renderMemory();
  const tick = () => {
    if (!M || M.run !== run) return;
    const left = (M.deadline - performance.now()) / (M.time * 1000);
    if (left <= 0) return memOver('late', 'Time is up. Somebody called the cops.');
    const clock = $('.clock');
    if (clock) { clock.firstChild.style.width = `${left * 100}%`; clock.classList.toggle('low', left < 0.3); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Flips happen in place (no re-render) so the cards can animate: turn over, pop on a match, shake on a miss.
function memFlip(i) {
  if (!M || M.phase !== 'play' || M.lock || M.done[i] || M.open.includes(i)) return;
  const el = n => modal.querySelector(`[data-card="${n}"]`);
  M.open.push(i);
  el(i).classList.add('up');
  if (M.open.length < 2) return;
  const [a, b] = M.open, run = M.run, live = () => M && M.run === run;
  M.open = [];
  M.lock = true; // no more flips until this pair is settled
  if (M.cards[a] === M.cards[b]) {
    const it = M.job.items[M.cards[a]];
    M.done[a] = M.done[b] = true;
    M.taken += it.value;
    M.msg = it.value ? `${it.name}. +${cash(it.value)}` : `${it.name}. Worthless.`;
    setTimeout(() => {
      if (!live()) return;
      [a, b].forEach(n => el(n).classList.add('got'));
      M.lock = false;
      modal.querySelector('.haul').innerHTML = `${cash(M.taken)} <small>of ${cash(M.job.owes)}</small>`;
      modal.querySelector('.card.memo .tell').textContent = M.msg;
      if (M.done.every(Boolean)) setTimeout(() => live() && memOver('all', 'You cleaned the place out.'), 500);
    }, 350);
  } else {
    setTimeout(() => live() && [a, b].forEach(n => el(n).classList.add('miss')), 350);
    setTimeout(() => { if (!live()) return; [a, b].forEach(n => el(n).classList.remove('up', 'miss')); M.lock = false; }, 1000);
  }
}

function memOver(how, msg) {
  Object.assign(M, { phase: 'over', result: how, msg, run: M.run + 1, lock: false });
  renderMemory();
}

function memCmd(cmd) {
  if (cmd === 'done') { // a real job: hand the haul back to the life
    const { job, title, result, taken } = M;
    M = null;
    hideModal();
    const r = job.end(result, taken);
    return r ? resolve(r, title) : nextEvent();
  }
  if (cmd === 'start') return memStart();
  if (cmd === 'retry') return startMemoryTest();
  if (cmd === 'quit' && M.job.end && M.phase !== 'over') return memOver('quit', 'You walked out with what you had.');
  if (cmd === 'quit') { M = null; hideModal(); }
}

function renderMemory() {
  const j = M.job, ph = M.phase;
  const cards = M.cards.map((k, i) => {
    const it = j.items[k], up = M.done[i] || M.open.includes(i);
    return `<button class="mc${up ? ' up' : ''}${M.done[i] ? ' got' : ''}" data-card="${i}" aria-label="Card ${i + 1}"><span class="mc-in"><span class="face back">?</span><span class="face front">${it.icon}<small>${it.value ? cash(it.value) : 'junk'}</small></span></span></button>`;
  }).join('');
  const tell = ph === 'intro' ? `${cap(j.who)} owes ${cash(j.owes)} and swears there is nothing left. Flip two at a time; every pair you match, you take. You have ${M.time} seconds.`
    : ph === 'play' ? M.msg || 'Every pair you match, you take.' : `${M.msg} You took ${cash(M.taken)} of the ${cash(j.owes)} owed.`;
  const controls = ph === 'intro' ? '<button class="primary" data-mm="start">Start</button><button class="ghost" data-mm="quit">Quit</button>'
    : ph === 'play' ? '<button class="ghost" data-mm="quit">Quit</button>'
    : j.end ? '<button class="primary" data-mm="done">Continue</button>' : '<button class="primary" data-mm="retry">Try again</button><button class="ghost" data-mm="quit">Close</button>';
  showModal(`<div class="card memo ${ph === 'over' ? (M.taken >= j.owes ? 'good' : 'bad') : ''}" role="dialog" aria-modal="true">
    <p class="kicker">${esc(M.title)} · ${esc(j.place)}</p>
    <h2>${ph === 'over' ? { all: 'Cleaned Out', late: 'Time\'s Up', quit: 'Walked Out' }[M.result] : 'Clean the Place Out'}</h2><p class="tell">${esc(tell)}</p>
    <p class="haul">${cash(M.taken)} <small>of ${cash(j.owes)}</small></p>
    ${ph === 'play' ? '<div class="clock"><i></i></div>' : ''}
    <div class="mgrid">${cards}</div>
    <div class="row sctl">${controls}</div></div>`);
  modal.querySelector('[data-mm=start], [data-mm=retry]')?.focus();
  if (ph === 'over') modal.querySelectorAll('.mc:not(.up)').forEach((el, k) => setTimeout(() => el.classList.add('up'), 250 + k * 80)); // show what you missed
}

// ---------- slingshot ----------
// Five stones, five targets. Drag down anywhere and let go: the stone flies the opposite way, and the longer the pull,
// the farther it goes. While you pull, a circle shows where the stone can land (it falls anywhere inside it): smarts
// shrink the circle. The hand shakes harder the longer you hold the pull: strength keeps it calm for longer.
let SL = null; // the slingshot round in progress (not saved)
// pull: longest pull that counts; reach: how far the shortest and longest pull throw (canvas units).
// From stat 0 to stat 100: spread = landing circle radius (smarts); shake = times the wobble (base 0.8 units of pull,
// growing 3.5 a second) and calm = seconds before it starts to grow (both strength).
const SLING = { stones: 5, pull: 120, reach: [40, 300], spread: [26, 6], shake: [1.6, 0.5], calm: [0.5, 1.2] };
const slStat = (range, v) => range[0] + (range[1] - range[0]) * clamp(v) / 100;
let slTest = { scene: Object.keys(SLING_SCENES)[0], str: 50, smarts: 50, open: false }; // the test room's picks (open: shown)
// Strength on the slingshot's 0-100 scale, measured against the age: a child's strength runs 5-20 (older ages: not decided yet).
const slStr = p => (p.age <= 12 ? clamp((p.str - 5) / 15 * 100) : p.str);
const SL_W = 300, SL_H = 400, SL_O = { x: 150, y: 334 }; // canvas units; where the pouch rests
const SL_KINDS = { can: { w: 22, h: 30 } };

function startSling(job, title) {
  const sc = SLING_SCENES[job.scene];
  const str = job.str ?? slStr(P), smarts = job.smarts ?? P.smarts;
  SL = { job, title, sc, kind: SL_KINDS[sc.kind], phase: 'aim', spread: slStat(SLING.spread, smarts),
    shake: slStat(SLING.shake, str), calm: slStat(SLING.calm, str), left: SLING.stones, hits: 0, run: 0, fx: [], stone: null,
    targets: sc.targets.map(t => ({ ...t, x: t.x + rnd(-8, 8) * t.s, down: null })), city: skyline(sc.wall.top) };
  renderSling();
}

function startSlingTest() { startSling({ ...slTest, test: true }, 'Slingshot Test'); }

// The city behind the fence: a row of rooftops with a few lit windows.
function skyline(top) {
  const roofs = [], lights = [];
  for (let x = -4; x < SL_W;) {
    const w = rnd(18, 42), h = rnd(14, 60);
    roofs.push({ x, w, h });
    for (let i = 0; i < 3; i++) if (chance(0.5)) lights.push({ x: x + rnd(3, w - 5), y: top - rnd(6, h - 4) });
    x += w + rnd(0, 4);
  }
  return { roofs, lights };
}

function renderSling() {
  const j = SL.job, over = SL.phase === 'over', n = SL.hits;
  const grade = { great: 'Great', ok: 'Ok', bad: 'Bad' }[SL.result];
  const title = over ? { great: 'Dead Eye', ok: 'Not Bad', bad: 'Way Off' }[SL.result] : 'Knock Them Down';
  const tell = over ? `${n} of ${SLING.stones} down. Grade: ${grade}.`
    : 'Drag down anywhere and let go. The circle shows where the stone can land. Hold it too long and your hand starts to shake.';
  const row = (label, key, opts) => `<div class="chips"><span class="chip-l">${label}</span>${opts.map(([v, name]) =>
    `<button class="chip${v === slTest[key] ? ' on' : ''}" data-sl="${key}:${v}">${esc(name)}</button>`).join('')}</div>`;
  const picks = j.test && slTest.open ? row('Scene', 'scene', Object.entries(SLING_SCENES).map(([k, v]) => [k, v.name]))
    + row('Strength', 'str', [[10, 'Weak'], [50, 'Average'], [90, 'Strong']])
    + row('Smarts', 'smarts', [[10, 'Dim'], [50, 'Average'], [90, 'Sharp']]) : '';
  const settings = `<button class="ghost" data-sl="settings">${slTest.open ? 'Hide settings' : 'Settings'}</button>`;
  const controls = !over ? (j.test ? `${settings}<button class="ghost" data-sl="quit">Quit</button>` : '')
    : j.end ? '<button class="primary" data-sl="done">Continue</button>' : `<button class="primary" data-sl="retry">Try again</button>${settings}<button class="ghost" data-sl="quit">Close</button>`;
  showModal(`<div class="card sling ${over ? (SL.result === 'bad' ? 'bad' : 'good') : ''}" role="dialog" aria-modal="true">
    <p class="kicker">${esc(SL.title)} · ${esc(SL.sc.name)}</p>
    <h2>${title}</h2><p class="tell">${esc(tell)}</p>
    <p class="sl-hud" id="sl-hud">${slHud()}</p>
    <canvas id="sling" width="${SL_W}" height="${SL_H}" aria-label="Slingshot range: drag down and let go to shoot"></canvas>
    ${picks}${controls ? `<div class="row sctl">${controls}</div>` : ''}</div>`);
  modal.querySelector('[data-sl=retry], [data-sl=done]')?.focus();
  const cv = $('#sling'), dpr = window.devicePixelRatio || 1, cs = getComputedStyle(modal), card = modal.firstElementChild;
  const room = modal.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - (card.scrollHeight + card.offsetHeight - card.clientHeight - cv.offsetHeight);
  if (room < cv.offsetHeight) cv.style.width = `${Math.max(200, Math.floor(room * SL_W / SL_H))}px`; // short screens: the whole card fits
  cv.width = Math.round(cv.clientWidth * dpr) || SL_W;
  cv.height = Math.round(cv.width * SL_H / SL_W);
  Object.assign(SL, { cv, ctx: cv.getContext('2d'), k: cv.width / SL_W });
  cv.addEventListener('pointerdown', slDown);
  cv.addEventListener('pointermove', slMove);
  cv.addEventListener('pointerup', slUp);
  cv.addEventListener('pointercancel', () => { if (SL?.phase === 'pull') SL.phase = 'aim'; });
  const run = ++SL.run;
  const frame = now => {
    if (!SL || SL.run !== run || modal.hidden) return;
    if (SL.phase === 'fly' && now - SL.stone.t0 >= SL.stone.dur) slLand(now);
    slDraw(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const slHud = () => `<span class="stones">${'●'.repeat(SL.left)}${'○'.repeat(SLING.stones - SL.left)}</span><span>${plural(SL.hits, 'hit')}</span>`;

function slPoint(e) {
  const r = SL.cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * SL_W / r.width, y: (e.clientY - r.top) * SL_H / r.height };
}

function slDown(e) {
  if (!SL || SL.phase !== 'aim') return;
  e.preventDefault();
  SL.cv.setPointerCapture?.(e.pointerId);
  Object.assign(SL, { phase: 'pull', from: slPoint(e), drag: { x: 0, y: 0 }, held: performance.now(),
    noise: [0, 0, 0, 0].map(() => Math.random() * 6.3) });
}

function slMove(e) {
  if (SL?.phase !== 'pull') return;
  const p = slPoint(e);
  SL.drag = { x: p.x - SL.from.x, y: p.y - SL.from.y };
}

function slUp(e) {
  if (SL?.phase !== 'pull') return;
  slMove(e);
  const now = performance.now(), a = slAim(now);
  if (!a) { SL.phase = 'aim'; return; } // let go without pulling back: no stone used
  SL.left--;
  const r = SL.spread * Math.sqrt(Math.random()), ang = Math.random() * Math.PI * 2; // anywhere inside the circle
  SL.stone = { to: { x: a.at.x + r * Math.cos(ang), y: a.at.y + r * Math.sin(ang) }, t0: now, dur: 380 + 260 * a.p, hump: a.reach * 0.2 };
  SL.phase = 'fly';
  $('#sl-hud').innerHTML = slHud();
}

// The pull with the shaking hand on top, or null while it is too short to shoot. The angle stays within 55° of straight down.
// at: the centre of the landing circle.
function slAim(now) {
  if (SL.drag.y < 6 || Math.hypot(SL.drag.x, SL.drag.y) < 14) return null;
  const t = (now - SL.held) / 1000, n = SL.noise;
  const amp = SL.shake * (0.8 + 3.5 * Math.max(0, t - SL.calm) ** 1.3);
  const x = SL.drag.x + amp * (0.6 * Math.sin(8.2 * t + n[0]) + 0.4 * Math.sin(19.1 * t + n[1]));
  const y = SL.drag.y + amp * (0.6 * Math.sin(7.1 * t + n[2]) + 0.4 * Math.sin(17.3 * t + n[3]));
  const ang = clamp(Math.atan2(x, y), -0.96, 0.96), len = Math.min(Math.hypot(x, y), SLING.pull), p = len / SLING.pull;
  const reach = SLING.reach[0] + p * (SLING.reach[1] - SLING.reach[0]), dir = { x: -Math.sin(ang), y: -Math.cos(ang) };
  return { p, reach, dir, pull: { x: Math.sin(ang) * len, y: Math.cos(ang) * len }, at: { x: SL_O.x + dir.x * reach, y: SL_O.y + dir.y * reach } };
}

function slLand(now) {
  const to = SL.stone.to;
  SL.stone = null;
  const hit = slTargetAt(to);
  if (hit) {
    hit.down = { t0: now, dir: to.x < hit.x ? 1 : -1 };
    SL.hits++;
  }
  SL.fx.push({ x: to.x, y: to.y, t0: now, text: hit ? 'Clang!' : 'Miss', hit: !!hit });
  $('#sl-hud').innerHTML = slHud();
  if (SL.left) { SL.phase = 'aim'; return; }
  SL.phase = 'wait';
  const run = SL.run;
  setTimeout(() => {
    if (!SL || SL.run !== run) return;
    Object.assign(SL, { phase: 'over', result: SL.hits >= 4 ? 'great' : SL.hits >= 2 ? 'ok' : 'bad', fx: [] });
    renderSling();
  }, 900);
}

// The standing target a stone landing here knocks down (the closest one first).
function slTargetAt(to) {
  const kd = SL.kind;
  return SL.targets.filter(t => !t.down).sort((a, b) => b.y - a.y)
    .find(t => Math.abs(to.x - t.x) <= kd.w * t.s / 2 + 3 && to.y <= t.y + 3 && to.y >= t.y - kd.h * t.s - 3);
}

function slCmd(cmd) {
  if (cmd === 'done') { // a real challenge: hand the result back to the life
    const { job, title, result, hits } = SL;
    SL = null;
    hideModal();
    const r = job.end(result, hits);
    return r ? resolve(r, title) : nextEvent();
  }
  if (cmd === 'quit') { SL = null; return hideModal(); }
  if (cmd === 'retry') return startSlingTest();
  if (cmd === 'settings') { // show or hide the test room's picks; the round goes on
    if (SL.phase === 'wait') return;
    slTest.open = !slTest.open;
    return renderSling();
  }
  const [key, v] = cmd.split(':'); // a test room pick: scene, strength or smarts
  if (key in slTest) { slTest[key] = key === 'scene' ? v : +v; startSlingTest(); }
}

function slDraw(now) {
  const c = SL.ctx, sc = SL.sc, { top, bottom } = sc.wall;
  c.setTransform(SL.k, 0, 0, SL.k, 0, 0);
  let g = c.createLinearGradient(0, 0, 0, top);
  g.addColorStop(0, sc.sky[0]);
  g.addColorStop(1, sc.sky[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, SL_W, top);
  c.fillStyle = sc.city;
  for (const r of SL.city.roofs) c.fillRect(r.x, top - r.h, r.w, r.h);
  c.fillStyle = 'rgba(202, 162, 76, .55)';
  for (const l of SL.city.lights) c.fillRect(l.x, l.y, 2, 3);
  g = c.createLinearGradient(0, bottom, 0, SL_H);
  g.addColorStop(0, sc.ground[0]);
  g.addColorStop(1, sc.ground[1]);
  c.fillStyle = g;
  c.fillRect(0, bottom, SL_W, SL_H - bottom);
  c.fillStyle = sc.wall.color; // the back fence, plank by plank
  c.fillRect(0, top, SL_W, bottom - top);
  c.fillStyle = 'rgba(0, 0, 0, .3)';
  for (let x = 6; x < SL_W; x += 14) c.fillRect(x, top, 1, bottom - top);
  c.fillStyle = 'rgba(255, 255, 255, .1)';
  c.fillRect(0, top, SL_W, 2);
  for (const t of [...SL.targets].sort((a, b) => a.y - b.y)) { slStand(c, t); slCan(c, t, now); } // far to near

  SL.fx = SL.fx.filter(f => now - f.t0 < 800);
  c.textAlign = 'center';
  c.font = '800 16px "Big Shoulders Display", "Arial Narrow", sans-serif';
  for (const f of SL.fx) {
    const k = (now - f.t0) / 800;
    c.globalAlpha = 1 - k;
    if (!f.hit) { // a puff of dust where it fell
      c.fillStyle = 'rgba(200, 190, 170, .6)';
      c.beginPath();
      c.arc(f.x, f.y, 3 + 9 * k, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = f.hit ? '#caa24c' : '#ece6d6';
    c.fillText(f.text, f.x, f.y - 14 - 18 * k);
    c.globalAlpha = 1;
  }

  if (SL.stone) { // in flight: a lob that shrinks as it goes away from you
    const st = SL.stone, k = Math.min(1, (now - st.t0) / st.dur);
    const x = SL_O.x + (st.to.x - SL_O.x) * k, y = SL_O.y + (st.to.y - SL_O.y) * k - st.hump * Math.sin(Math.PI * k);
    slStone(c, x, y, 5.5 - 3.5 * k * clamp((SL_O.y - st.to.y) / 200, 0, 1));
  }

  const a = SL.phase === 'pull' ? slAim(now) : null;
  if (a) { // where it can land, and three dots leaving the fork
    c.fillStyle = 'rgba(236, 230, 214, .14)';
    c.strokeStyle = 'rgba(236, 230, 214, .7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(a.at.x, a.at.y, SL.spread, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#ece6d6';
    for (let d = 14; d <= 34; d += 10) {
      c.globalAlpha = 0.9 - d / 50;
      c.beginPath();
      c.arc(SL_O.x + a.dir.x * d, SL_O.y + a.dir.y * d, 2, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }
  const pouch = a ? { x: SL_O.x + a.pull.x * 0.42, y: SL_O.y + a.pull.y * 0.42 } : SL_O;
  const armL = { x: 126, y: 318 }, armR = { x: 174, y: 318 };
  c.lineCap = 'round';
  c.strokeStyle = '#6b4a2b';
  c.lineWidth = 10;
  slLine(c, { x: 150, y: 410 }, { x: 150, y: 360 });
  c.lineWidth = 7;
  slLine(c, { x: 150, y: 362 }, armL);
  slLine(c, { x: 150, y: 362 }, armR);
  c.strokeStyle = '#b0603e'; // rubber bands
  c.lineWidth = 3;
  slLine(c, armL, pouch);
  slLine(c, armR, pouch);
  if (SL.phase === 'aim' || SL.phase === 'pull') {
    c.fillStyle = '#3b2a1e';
    c.beginPath();
    c.ellipse(pouch.x, pouch.y + 2, 9, 5, 0, 0, Math.PI * 2);
    c.fill();
    slStone(c, pouch.x, pouch.y, 5.5);
  }
}

function slLine(c, a, b) { c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }

function slStone(c, x, y, r) {
  c.fillStyle = '#9a958a';
  c.strokeStyle = '#3a372f';
  c.lineWidth = 1;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

// What a target stands on, with a shadow on the ground under it.
function slStand(c, t) {
  const s = t.s;
  let w = 0, h = 0;
  if (t.on === 'crate') {
    w = 36 * s; h = 30 * s;
    c.fillStyle = '#6b4f2e';
    c.fillRect(t.x - w / 2, t.y, w, h);
    c.strokeStyle = '#3e2d19';
    c.lineWidth = 1.5 * s;
    c.strokeRect(t.x - w / 2, t.y, w, h);
    slLine(c, { x: t.x - w / 2, y: t.y }, { x: t.x + w / 2, y: t.y + h });
  } else if (t.on === 'post') {
    w = 10 * s; h = 64 * s;
    c.fillStyle = '#4f3a22';
    c.fillRect(t.x - w / 2, t.y, w, h);
  } else return;
  c.fillStyle = 'rgba(0, 0, 0, .3)';
  c.beginPath();
  c.ellipse(t.x, t.y + h, w * 0.7, 3 * s, 0, 0, Math.PI * 2);
  c.fill();
}

// A tin can; once hit it tumbles off and fades.
function slCan(c, t, now) {
  const s = t.s, w = SL.kind.w * s, h = SL.kind.h * s;
  c.save();
  if (t.down) {
    const k = (now - t.down.t0) / 1000;
    if (k > 1.1) return c.restore();
    c.globalAlpha = 1 - clamp((k - 0.6) / 0.5, 0, 1);
    c.translate(t.x + t.down.dir * 40 * s * k, t.y - h / 2 - 60 * s * k + 260 * s * k * k);
    c.rotate(t.down.dir * k * 9);
  } else c.translate(t.x, t.y - h / 2);
  c.fillStyle = '#a9b0b2';
  c.fillRect(-w / 2, -h / 2, w, h);
  c.fillStyle = '#b8473a'; // the label
  c.fillRect(-w / 2, -h / 6, w, h / 3);
  c.fillStyle = 'rgba(255, 255, 255, .35)';
  c.fillRect(-w / 2 + w * 0.18, -h / 2, w * 0.12, h);
  c.fillStyle = '#d6dbdc'; // the lid
  c.beginPath();
  c.ellipse(0, -h / 2, w / 2, w * 0.18, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// ---------- screens ----------

const app = $('#app');
const layer = cls => document.body.appendChild(Object.assign(document.createElement('div'), { className: `overlay ${cls}`, hidden: true }));
const sheet = layer('sheet');
const modal = layer('modal');

const list = items => `<div class="list">${items.join('')}</div>`;
const msg = text => `<p class="empty">${esc(text)}</p>`;
const facts = rows => `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
const SHEETS = {
  activities() {
    return ['Activities', msg('Nothing to do here yet.')];
  },
  families() {
    return ['Families', `<p class="hint">One try a year, and every family tests you differently each time. Here is what the street says:</p>` + list(FAMILIES.map(name =>
      `<button class="item" data-seek="${name}"><span class="nm">The ${name} family</span><span class="ds">${esc(FAMILY_INFO[name].rumor)}</span></button>`))];
  },
  crime() {
    if (P.fam) return ['Crime', msg(`You answer to the ${clan(P.fam.name)} now.`)];
    if (P.age < 16) return ['Crime', msg('Too young for this life. For now.')];
    return ['Crime', `<div class="list"><button class="item seek" data-sheet="families"${P.done.seek ? ' disabled' : ''}><span class="nm">Seek Out a Family</span><span class="ds">Try to get in with one of the four families.</span>${P.done.seek ? '<span class="mt">Tried this year</span>' : ''}</button></div>`];
  },
  life() {
    const rows = [
      ['Born', `${P.born} in ${P.district}`], ...(P.fam ? [['Family', `${P.fam.name} · ${FAM_RANKS[P.fam.rank]}`]] : []),
    ];
    return ['Profile', facts(rows) +
      `<div class="list"><button class="item seek" data-do="slingTest"><span class="nm">Slingshot Test Room</span><span class="ds">Try the new slingshot minigame. Nothing here affects your life.</span></button><button class="item seek" data-do="fightTest"><span class="nm">Fight Test Room</span><span class="ds">Try the new fight rules. Nothing here affects your life.</span></button><button class="item seek" data-do="memoryTest"><span class="nm">Memory Test Room</span><span class="ds">Try the new collecting minigame. Nothing here affects your life.</span></button><button class="item seek" data-do="safeTest"><span class="nm">Safe Test Room</span><span class="ds">Try the new safe-cracking minigame. Nothing here affects your life.</span></button><button class="item seek" data-do="sneakTest"><span class="nm">Sneak Test Room</span><span class="ds">Try the new sneaking minigame. Nothing here affects your life.</span></button></div><div class="list" id="restart"><button class="item danger" data-do="askRestart"><span class="nm">Start a New Life</span><span class="ds">This life and its save end for good.</span></button></div>` +
      `<p class="ver">Mafiozo 0.32</p>`];
  },
};

function openSheet(kind) {
  const [title, body] = SHEETS[kind]();
  sheet.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><header><h2 id="sheet-title">${title}</h2><button class="close" data-close>Close</button></header>${body}</div>`;
  sheet.hidden = false;
}

function closeSheet() { sheet.hidden = true; }

function showModal(html) {
  modal.innerHTML = html;
  modal.hidden = false;
  modal.querySelector('button')?.focus();
}

function hideModal() { modal.hidden = true; }

function render() {
  if (!P) return renderStart();
  if (!P.alive) return renderDeath();
  const log = P.log.map(y => `<section class="yr"><h3>${y.age ? `Age ${y.age}` : 'Born'} · ${P.born + y.age}</h3>${y.items
    .map(it => `<p class="${it.tone}">${esc(it.text)}${it.fx ? `<small>${esc(it.fx)}</small>` : ''}</p>`).join('')}</section>`).join('');
  const bars = STATS.map(([k, label]) => {
    const v = P[k], warn = k === 'heat' ? v >= 50 : k === 'health' && v < hpMax() / 4;
    if (k === 'soul') return `<div class="stat soul${v < 0 ? ' neg' : ''}"><b>${v > 0 ? '+' : ''}${v}</b><span>${label}</span><i style="--l:${v < 0 ? 50 + v / 2 : 50}%;--w:${Math.abs(v) / 2}%"></i></div>`; // fills out from the middle
    return `<div class="stat ${k}${warn ? ' warn' : ''}"><b>${v}</b><span>${label}</span><i style="--v:${k === 'health' ? Math.min(100, (v / hpMax()) * 100) : v}%"></i></div>`;
  }).join('');
  app.innerHTML = `
    <header class="top">
      <div class="mug" aria-hidden="true">${esc(P.first[0] + P.last[0])}</div>
      <div class="who"><h1>${esc(P.first)} ${esc(P.last)}</h1><p>${P.fam ? `${rank(P)} · ` : ''}Age ${P.age}</p></div>
      <div class="cash"><small>Cash</small><b>${cash(P.money)}</b></div>
    </header>
    <main class="log" id="log">${log}</main>
    <section class="stats" aria-label="Stats">${bars}</section>
    <nav class="nav">
      <button data-sheet="activities">Activities</button>
      <button data-sheet="crime">Crime</button>
      <button data-sheet="life">Profile</button>
      <button class="age" data-do="age">Age +1</button>
    </nav>`;
  const el = $('#log');
  el.scrollTop = el.scrollHeight;
}

function renderStart() {
  app.innerHTML = `
    <section class="start">
      <p class="eyebrow">${CITY}</p>
      <h1 class="logo">Mafiozo</h1>
      <p class="tag">Born with nothing. Leave a name the whole city whispers.</p>
      <form id="newlife" autocomplete="off">
        <div class="field"><label for="first">First name</label><input id="first" maxlength="16"></div>
        <div class="field"><label for="last">Last name</label><input id="last" maxlength="16"></div>
        <fieldset class="gender"><legend>Gender</legend>
          <label><input type="radio" name="gender" value="M" id="g-m"><span>Male</span></label>
          <label><input type="radio" name="gender" value="F" id="g-f"><span>Female</span></label>
        </fieldset>
        <div class="row"><button type="button" class="ghost" data-do="randomize">Randomize</button><button type="submit" class="primary">Begin Life</button></div>
      </form>
    </section>`;
  randomize();
}

function randomize() {
  const g = pick(['M', 'F']);
  $('#first').value = pick(g === 'M' ? FIRST_M : FIRST_F);
  $('#last').value = pick(LAST);
  $(`#g-${g.toLowerCase()}`).checked = true;
}

function renderDeath() {
  app.innerHTML = `
    <section class="dead">
      <p class="stamp">Case Closed</p>
      <h1 class="logo small">${esc(P.first)} ${esc(P.last)}</h1>
      <p class="tag">${P.born}–${P.born + P.age}. Died at ${P.age}. ${esc(P.cause)}.</p>
      ${facts([...(P.fam ? [['Rank', rank(P)]] : []), ['Cash left behind', cash(P.money)], ['Most cash ever', cash(P.tally.peak)]])}
      <button class="primary big" data-do="restart">Start a New Life</button>
    </section>`;
}

const DO = {
  age: ageUp,
  next() { hideModal(); if (P.alive) nextEvent(); else render(); },
  randomize,
  fightNext,
  sneakTest() { closeSheet(); startSneak({ room: SNEAK_TEST }); },
  safeTest() { closeSheet(); startSafeTest(); },
  memoryTest() { closeSheet(); startMemoryTest(); },
  slingTest() { closeSheet(); startSlingTest(); },
  fightTest() { closeSheet(); fightTestMenu(); },
  flee,
  askRestart() {
    $('#restart').innerHTML = `<p class="hint">End ${esc(P.first)}'s life for good?</p><div class="row"><button class="danger" data-do="restart">Yes, start over</button><button class="ghost" data-close>Keep playing</button></div>`;
  },
  restart() {
    P = null;
    F = S = V = M = SL = null; // a minigame left running stops with the life
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing saved */ }
    closeSheet();
    hideModal();
    render();
  },
};

document.addEventListener('click', e => {
  if (e.target === sheet) return closeSheet();
  if (e.target === modal) { if (modal.querySelector('[data-do=next]')) DO.next(); return; } // tap outside a result to continue
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.sheet) openSheet(d.sheet);
  else if (d.move) strike(d.move);
  else if (d.seek) seekFamily(d.seek);
  else if (d.tile) sneakTap(d.tile);
  else if (d.sn) sneakCmd(d.sn);
  else if (d.key) safeKey(d.key);
  else if (d.sf) safeCmd(d.sf);
  else if (d.card) memFlip(+d.card);
  else if (d.mm) memCmd(d.mm);
  else if (d.sl) slCmd(d.sl);
  else if (d.ft) ftCmd(d.ft);
  else if ('choice' in d) choose(+d.choice);
  else if ('close' in d) closeSheet();
  else if (d.do) DO[d.do]();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  if (V && V.phase === 'enter') safeKey(/^\d$/.test(e.key) ? e.key : { Backspace: 'del', Enter: 'ok' }[e.key]); // typing on a keyboard
});

document.addEventListener('submit', e => {
  e.preventDefault();
  newLife($('#first').value.trim() || 'Johnny', $('#last').value.trim() || 'Nobody', e.target.gender.value || 'M');
});

// Boot. In the Claude app viewer, keep the life across live updates of the page.
function start(data) {
  P = (data && data.P) || load();
  if (P && P.str == null) P.str = 20; // saves from before strength existed
  if (P && P.soul == null) P.soul = 0; // ...and before soul
  render();
  if (P && P.alive) nextEvent();
}
window.claude?.hot?.snapshot?.(() => ({ P }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
