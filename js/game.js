// Mafiozo – engine and UI. Game content (crimes, events, names) lives in data.js.

const SAVE_KEY = 'mafiozo.save.v1';
const STATS = [['health', 'Health'], ['str', 'Strength'], ['smarts', 'Smarts'], ['respect', 'Respect'], ['heat', 'Heat']];
const LABEL = Object.fromEntries(STATS);
let P = null; // the life being played, saved after every change

// ---------- helpers (data.js uses these too) ----------

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const chance = p => Math.random() < p;
const pick = list => list[Math.floor(Math.random() * list.length)];
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const cash = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const $ = sel => document.querySelector(sel);

// An outcome: a line for the life log, stat effects, and the cause of death if it kills you.
const ok = (text, fx = {}, cause) => ({ text, fx, cause, tone: 'good' });
const bad = (text, fx = {}, cause) => ({ text, fx, cause, tone: 'bad' });
const meh = (text, fx = {}, cause) => ({ text, fx, cause, tone: '' });

const rank = p => (p.fam ? `${FAM_RANKS[p.fam.rank]}, ${p.fam.name} family` : RANKS.filter(([min]) => p.respect >= min).pop()[1]);
const riskLabel = p => (p >= 0.7 ? 'Low risk' : p >= 0.45 ? 'Medium risk' : p >= 0.25 ? 'High risk' : 'Suicide mission');

// ---------- the life ----------

function newLife(first, last, gender) {
  P = {
    first, last, gender, age: 0, born: new Date().getFullYear(), district: pick(DISTRICTS),
    money: 0, health: rnd(75, 100), str: rnd(5, 20), smarts: rnd(15, 90), respect: 0, heat: 0,
    job: null, prison: 0, inmate: rnd(10000, 99999), alive: true, cause: '',
    flags: {}, seen: {}, done: {}, pending: [], tally: { crimes: 0, arrests: 0, served: 0, peak: 0 }, log: [],
  };
  newYear();
  note(`You were born in ${CITY}, in ${P.district}. It's a ${gender === 'M' ? 'boy' : 'girl'}.`);
  note(pick(PARENTS));
  save();
  render();
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
      P[k] = clamp(P[k] + v);
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

// ---------- crime and punishment ----------

function odds(c) {
  let p = c.base + (P.smarts - 50) / 250 + P.respect / 400 - P.heat / 250;
  if (P.flags.crew) p += 0.05;
  if (P.flags.locks && (c.id === 'burglary' || c.id === 'car')) p += 0.08;
  return clamp(p, 0.05, 0.95);
}

function commitCrime(c) {
  P.tally.crimes++;
  if (chance(odds(c))) return ok(c.ok, { money: rnd(...c.reward), respect: rnd(...c.respect), heat: rnd(...c.heat) });
  if (chance(Math.min(0.95, 0.45 + P.heat / 200))) return arrest(rnd(...c.jail), c.caught);
  if (c.hurt && chance(c.hurt)) return bad(`${c.fail} You got hurt getting away.`, { health: -rnd(10, 30), heat: rnd(...c.heat) }, 'Killed during a botched job');
  return bad(c.fail, { respect: -1, heat: Math.ceil(c.heat[0] / 2) });
}

// More heat means a longer sentence.
function arrest(years, text, fx = {}) {
  years += Math.floor(P.heat / 34);
  P.tally.arrests++;
  if (years <= 0) return bad(`${text} The judge let you off with a warning.`, { ...fx, heat: 10 });
  P.prison = years;
  P.job = null;
  P.heat = clamp(P.heat - 40);
  delete P.flags.fugitive;
  const where = P.age < 18 ? 'juvenile hall' : 'Velmora State Penitentiary';
  return bad(`${text} Sentenced to ${plural(years, 'year')} in ${where}.`, fx);
}

function extend(years, r) {
  P.prison += years;
  r.text += ` ${plural(years, 'year')} added to your sentence.`;
  return r;
}

function escapePrison() {
  P.prison = 0;
  P.heat = 90;
  P.flags.fugitive = true;
  return ok('You rode out in a laundry truck. Free, and the most wanted face in Velmora.', { respect: rnd(10, 15) });
}

// ---------- families ----------

function joinFamily(name, text, fx = {}) {
  P.fam = { name, rank: 0 };
  return ok(`${text} You are now an Associate of the ${name} family.`, { respect: 5, ...fx });
}

// Starts the family's test scene right away.
function seekFamily(name) {
  closeSheet();
  const e = EVENTS.find(x => x.id === FAMILY_INFO[name].scene);
  P.pending.unshift({ id: e.id, c: makeCtx(e) });
  save();
  nextEvent();
}

// ---------- work ----------

function applyJob(j) {
  if (j.clean && (P.tally.arrests || P.heat > 30)) return bad('Your background check came back dirty.');
  const qualified = Object.entries(j.req || {}).every(([k, v]) => P[k] >= v);
  if (!qualified || !chance(0.85)) return bad(`${j.place} hired someone else.`);
  P.job = { title: j.title, place: j.place, salary: j.salary };
  return ok(`You're the new ${j.title} at ${j.place}.`);
}

function askRaise() {
  if (!chance(0.35 + P.smarts / 300)) return bad('Your boss laughed you out of the office.');
  const raise = Math.round((P.job.salary * rnd(5, 12)) / 100 / 100) * 100;
  P.job.salary += raise;
  return ok(`Your boss gave you a ${cash(raise)} raise.`);
}

// ---------- years and events ----------

function ageUp() {
  if (!P.alive) return render();
  if (P.pending.length) return nextEvent();
  P.age++;
  newYear();
  const a = P.age;
  if (P.prison > 0) {
    P.prison--;
    P.tally.served++;
    applyFx({ respect: 1 });
    if (P.prison) note(`Another year inside. ${plural(P.prison, 'year')} to go.`);
    else note('You walked out of the gates a free person.', 'good');
  } else {
    if (a === 5) note('You started school at P.S. 41.');
    if (a >= 6 && a <= 18) applyFx({ smarts: rnd(0, 3) });
    if (a >= 10 && a <= 20) applyFx({ str: rnd(0, 2) });
    if (a === 18) note(P.smarts >= 35 ? 'You graduated from Velmora High.' : 'You dropped out of Velmora High.');
    if (P.job) {
      applyFx({ money: P.job.salary, heat: -3 });
      note(`You earned ${cash(P.job.salary)} as a ${P.job.title}.`);
    }
  }
  // Health tracks injuries, not illness: wounds heal a little every year.
  applyFx({ health: rnd(2, 5), heat: -rnd(4, 9) });
  if (P.health <= 0) die('Your body gave out');
  else if (a > 60 && chance(((a - 60) ** 2 / 1600) * (1.6 - P.health / 100))) die(pick(['Heart attack', 'Stroke', 'Old age']));
  if (P.alive) {
    if (chance(0.75)) queueEvent();
    if (chance(0.2)) queueEvent();
  }
  save();
  render();
  if (P.alive) nextEvent();
}

const eligible = e => (P.prison ? e.inside || e.anywhere : !e.inside) && e.when(P);

function queueEvent(tag, prob = 1) {
  if (!chance(prob)) return;
  const pool = EVENTS.filter(e => !e.scene && (!tag || e.tag === tag) && !(e.once && P.seen[e.id]) && !P.pending.some(x => x.id === e.id) && eligible(e));
  if (!pool.length) return;
  let roll = Math.random() * pool.reduce((sum, e) => sum + (e.w || 1), 0);
  const e = pool.find(x => (roll -= x.w || 1) < 0) || pool[0];
  P.seen[e.id] = true;
  P.pending.push({ id: e.id, c: makeCtx(e) });
}

function makeCtx(e) {
  const first = pick(FIRST_M.concat(FIRST_F)), last = pick(LAST);
  return {
    first, last, full: `${first} ${last}`, n: `${first} '${pick(NICKS)}' ${last}`,
    crew: pick(CREWS), rival: pick(CREWS.filter(c => c !== P.flags.crew)), fam: pick(FAMILIES), cop: pick(COPS),
    ...(e.ctx ? e.ctx(P) : {}),
  };
}

// Shows the next queued event, skipping any that no longer fit (say, you got arrested earlier this year).
function nextEvent() {
  while (P.pending.length) {
    const { id, c } = P.pending[0];
    const e = EVENTS.find(x => x.id === id);
    if (!e || !eligible(e)) { P.pending.shift(); continue; }
    if (e.auto) { P.pending.shift(); return resolve(e.auto(P, c), e.title); }
    return showEvent(e, c);
  }
}

function showEvent(e, c) {
  const choices = e.choices
    .map((ch, i) => `<button class="opt" data-choice="${i}">${esc(typeof ch.label === 'function' ? ch.label(P, c) : ch.label)}</button>`)
    .join('');
  showModal(`<div class="card" role="dialog" aria-modal="true"><p class="kicker">Age ${P.age} · Event</p><h2>${esc(e.title)}</h2><p>${esc(e.text(P, c))}</p><div class="choices">${choices}</div></div>`);
}

function choose(i) {
  const { id, c } = P.pending.shift();
  const e = EVENTS.find(x => x.id === id);
  play(e.choices[i].run(P, c), e.title);
}

// An outcome either resolves right away or starts a fight first.
const play = (r, title) => (r.fight ? startFight(r, title) : resolve(r, title));

function resolve(r, title) {
  const fx = applyFx(r.fx);
  note(r.text, r.tone, fx);
  if (P.health <= 0 && P.alive) die(r.cause || 'Your injuries were too much');
  save();
  render();
  showModal(`<div class="card ${r.tone}" role="dialog" aria-modal="true"><p class="kicker">Age ${P.age}</p><h2>${esc(title)}</h2><p>${esc(r.text)}</p>${fx ? `<p class="fx">${esc(fx)}</p>` : ''}<div class="choices"><button class="primary" data-do="next">Continue</button></div></div>`);
}

function perform(kind, id) {
  closeSheet();
  if (kind === 'crime') {
    const c = CRIMES.find(x => x.id === id);
    return resolve(commitCrime(c), c.name);
  }
  if (kind === 'act' || kind === 'prison') {
    const a = (kind === 'act' ? ACTIVITIES : PRISON_ACTIONS).find(x => x.id === id);
    P.done[a.id] = true;
    return play(a.run(P), a.name);
  }
  if (kind === 'hire') {
    const j = JOBS.find(x => x.id === id);
    return resolve(applyJob(j), j.place);
  }
  if (id === 'raise') {
    P.done.raise = true;
    return resolve(askRaise(), 'Raise');
  }
  if (id === 'quit') {
    const title = P.job.title;
    P.job = null;
    return resolve(meh(`You quit your job as a ${title}.`), 'Quit');
  }
}

// ---------- fights ----------
// Each round is one tap: pick Punch, Block or Grapple (punch beats grapple, grapple beats block, block beats punch)
// while a needle swings; where it is at that moment sets the power. Timing scales damage dealt and taken.
// Strength sets your hit power, health sets your fight points and zone size, smarts can reveal the next move.
const MOVES = { punch: 'Punch', block: 'Block', grapple: 'Grapple' };
const BEATS = { punch: 'grapple', grapple: 'block', block: 'punch' };
const TELLS = { punch: 'pulls a fist back', block: 'raises both arms', grapple: 'crouches low, arms wide' };
const WIN_TEXT = { punch: 'You caught them coming in.', grapple: 'You got past the guard and slammed them down.', block: 'You blocked and countered.' };
const LOSE_TEXT = { punch: 'They caught you coming in.', grapple: 'They got past your guard and slammed you down.', block: 'They blocked and countered.' };
const cap = s => s[0].toUpperCase() + s.slice(1);
let F = null; // the fight in progress (not saved)

// `foe` is a key of FOES or a fighter object; win/lose/flee get the final fight state.
const brawl = (foe, name, win, lose, flee) => ({ fight: { ...(typeof foe === 'string' ? FOES[foe] : foe), name }, win, lose, flee });

function startFight(r, title) {
  const you = 40 + Math.round(P.health * 0.6);
  F = { ...r, title, foe: r.fight, you, youMax: you, them: r.fight.hp, round: 1, taken: 0, last: '' };
  fightMenu();
}

function fightCard(body) {
  const bar = (label, v, max, cls) => `<div class="hp ${cls}"><span>${esc(label)}</span><b>${Math.max(0, v)}</b><i style="--v:${(Math.max(0, v) / max) * 100}%"></i></div>`;
  return `<div class="card fight" role="dialog" aria-modal="true"><p class="kicker">Round ${F.round} · Strength ${P.str}</p><h2>${esc(F.title)}</h2>
    <div class="hps">${bar('You', F.you, F.youMax, 'me')}${bar(F.foe.name, F.them, F.foe.hp, 'foe')}</div>
    ${F.last ? `<p class="flog">${esc(F.last)}</p>` : ''}${body}</div>`;
}

function fightMenu() {
  const mix = F.foe.mix, w = 14 + Math.round(P.health / 10);
  let roll = Math.random() * Object.values(mix).reduce((x, y) => x + y, 0);
  F.next = Object.keys(mix).find(k => (roll -= mix[k]) < 0) || 'punch';
  F.zone = { x: rnd(5, 95 - w), w };
  const t0 = (F.t0 = performance.now());
  const tell = chance(P.smarts / 130) ? `${cap(F.foe.name)} ${TELLS[F.next]}.` : `You can't read ${F.foe.name}.`;
  showModal(fightCard(`<p class="tell">${esc(tell)}</p>
    <div class="meter"><i style="left:${F.zone.x}%;width:${w}%"></i><b id="needle"></b></div>
    <div class="moves">${Object.entries(MOVES).map(([k, v]) => `<button class="opt" data-move="${k}">${v}</button>`).join('')}</div>
    <p class="rules">Tap a move while the needle is in the bright zone.<br>Punch beats Grapple · Grapple beats Block · Block beats Punch</p>
    <button class="ghost flee" data-do="flee">Run for it</button>`));
  const sweep = () => {
    if (!F || F.t0 !== t0) return; // the next round or the end of the fight stops this loop
    $('#needle').style.left = `${needlePos()}%`;
    requestAnimationFrame(sweep);
  };
  requestAnimationFrame(sweep);
}

const needlePos = () => { const ph = (((performance.now() - F.t0) / 1000) * F.foe.spd) % 2; return (ph < 1 ? ph : 2 - ph) * 100; };

function strike(me) {
  const pos = needlePos(), { x, w } = F.zone;
  const [q, label] = pos >= x && pos <= x + w ? [1.5, 'Perfect!'] : pos >= x - 10 && pos <= x + w + 10 ? [1, 'Solid.'] : [0.5, 'Sloppy.'];
  const mine = Math.round((12 + P.str / 4) * q), theirs = Math.round(rnd(F.foe.pow - 3, F.foe.pow + 3) * (2 - q));
  const them = F.next;
  let dealt = 0, took = 0, text;
  if (me === them) {
    if (me === 'block') text = 'You both kept your guard up. Nothing landed.';
    else { dealt = Math.round(mine / 2); took = Math.round(theirs / 2); text = 'You traded blows.'; }
  } else if (BEATS[me] === them) {
    dealt = me === 'block' ? Math.round(mine * 0.7) : mine;
    text = WIN_TEXT[me];
  } else {
    took = them === 'block' ? Math.round(theirs * 0.7) : theirs;
    text = LOSE_TEXT[them];
  }
  hitRound(dealt, took, `${label} ${text}`);
}

function hitRound(dealt, took, text) {
  F.them -= dealt;
  F.you -= took;
  F.taken += took;
  F.last = `${text} (You −${took} · ${cap(F.foe.name)} −${dealt})`;
  if (F.them <= 0) return endFight('win');
  if (F.you <= 0) return endFight('lose');
  F.round++;
  fightMenu();
}

function flee() {
  if (chance(0.35 + P.health / 300)) return endFight('flee');
  hitRound(0, rnd(F.foe.pow - 3, F.foe.pow + 3), 'You tried to run. They dragged you back.');
}

function endFight(kind) {
  const r = F[kind] ? F[kind](F) : meh('You ran. Your pride did not make it.', { respect: -2 });
  r.fx = { ...r.fx, health: (r.fx.health || 0) - Math.round(F.taken * 0.35) };
  const title = F.title;
  F = null;
  resolve(r, title);
}

// ---------- sneaking (turn-based) ----------
// Tap a tile next to you to step there, wait, or toss a coin. After every action the guards take their turn.
// Guards and cameras see a cone in front of them (walls and desks block it); the dog smells the 4 tiles around it.
// Ending up on a covered tile means you are spotted. Step on a guard from right behind to knock them out.
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR8 = { ...DIRS, 'up-left': [-1, -1], 'up-right': [1, -1], 'down-left': [-1, 1], 'down-right': [1, 1] };
const ARROW = { up: '↑', down: '↓', left: '←', right: '→', 'up-left': '↖', 'up-right': '↗', 'down-left': '↙', 'down-right': '↘' };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const CCW = { up: 'left', left: 'down', down: 'right', right: 'up' };
const GUARD_ICON = { cop: '👮', cam: '📷', dog: '🐕' };
const SPOTTED = { cop: 'The guard saw you.', cam: 'The camera caught you.', dog: 'The dog smelled you and started barking.' };
const CONE = { cop: 3, cam: 4 }; // how many tiles deep each one sees
const dirOf = (a, b) => (b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up');
let S = null; // the sneak in progress (not saved)

function startSneak(room) {
  const tiles = room.map.map(r => r.split(''));
  const y = tiles.findIndex(r => r.includes('S')), x = tiles[y].indexOf('S');
  const guards = room.guards.map(g => ({ face: g.turns ? g.turns[0] : 'down', k: 0, wait: 0, path: [], looks: [], ...g }));
  S = { room, tiles, guards, x, y, got: false, cash: 0, coins: 2, moves: 0, aiming: false, over: null, msg: '' };
  guards.forEach(planGuard);
  renderSneak();
}

const tileAt = (x, y) => (S.tiles[y] || [])[x];
const clearAt = (x, y) => { const t = tileAt(x, y); return !!t && t !== '#' && t !== 'B'; }; // sight and steps pass
const guardAt = (x, y) => S.guards.find(g => !g.down && g.x === x && g.y === y);
const walkable = (x, y) => clearAt(x, y) && !guardAt(x, y);
const roamable = (x, y) => ['.', '$'].includes(tileAt(x, y)); // guards keep off the door and the target

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
  if (g.type === 'dog') return Object.values(DIRS).map(([dx, dy]) => [g.x + dx, g.y + dy, 1]).filter(([x, y]) => clearAt(x, y));
  const [fx, fy] = DIR8[g.face], fl = Math.hypot(fx, fy), out = [];
  S.tiles.forEach((row, y) => row.forEach((t, x) => {
    const dx = x - g.x, dy = y - g.y, dist = Math.hypot(dx, dy);
    if (dist && dist <= CONE[g.type] + 0.5 && clearAt(x, y) && (dx * fx + dy * fy) / (dist * fl) >= 0.85 && lineClear(g.x, g.y, x, y)) out.push([x, y, dist]);
  }));
  return out;
}
const spotter = () => S.guards.find(g => sightOf(g).some(([x, y]) => x === S.x && y === S.y));

// Each guard decides its next action a turn ahead, so the arrows can show it.
function planGuard(g) {
  if (g.down) return;
  if (g.type === 'cam') g.plan = { face: g.turns[(g.k + 1) % g.turns.length] };
  else if (g.type === 'cop' && g.wait > 0) g.plan = { stay: true }; // listening for the coin
  else if (g.looks.length) g.plan = { face: g.looks[0] };
  else if (g.type === 'dog') g.plan = dogStep(g);
  else {
    if (!g.path.length) g.path = pathTo(g.x, g.y, pick(g.points.filter(([x, y]) => x !== g.x || y !== g.y)));
    if (g.path.length && chance(0.1)) { g.looks = [OPP[g.face]]; g.plan = { face: OPP[g.face] }; } // a look over the shoulder
    else g.plan = g.path.length ? { to: g.path[0] } : { stay: true };
  }
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

// Carries out the planned action. Returns true when the guard walks straight into you.
function actGuard(g) {
  const p = g.plan;
  if (g.down || !p) return false;
  if (g.type === 'cam') { g.k = (g.k + 1) % g.turns.length; g.face = g.turns[g.k]; }
  else if (p.to) {
    if (p.to[0] === S.x && p.to[1] === S.y) return true;
    if (!guardAt(...p.to)) {
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
  return false;
}

function endTurn(msg) {
  S.moves++;
  S.msg = msg;
  for (const g of S.guards) if (actGuard(g)) return sneakOver('caught', g.type === 'dog' ? 'The dog ran right into you.' : 'The guard walked right into you.');
  const g = spotter();
  if (g) return sneakOver('caught', SPOTTED[g.type]);
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
    S.aiming = false;
    S.coins--;
    for (const g of S.guards) {
      const far = Math.abs(g.x - x) + Math.abs(g.y - y), dx = x - g.x, dy = y - g.y;
      if (g.down) continue;
      if (g.type === 'cop' && far <= 5) {
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
    g.down = true;
    return endTurn('You choked the guard out. Lights out.');
  }
  if (!walkable(x, y)) return;
  S.x = x;
  S.y = y;
  const t = tileAt(x, y);
  let msg = '';
  if (t === '*') { S.got = true; S.tiles[y][x] = '.'; msg = 'Got it. Now get back to the door.'; }
  if (t === '$') { S.cash += 500; S.tiles[y][x] = '.'; msg = 'You pocketed $500.'; }
  if (t === 'S' && S.got) { S.moves++; return sneakOver('win', `Clean job in ${S.moves} moves.${S.cash ? ` Plus ${cash(S.cash)} for your pocket.` : ''}`); }
  const seenBy = spotter();
  if (seenBy) return sneakOver('caught', SPOTTED[seenBy.type]);
  endTurn(msg);
}

function sneakCmd(cmd) {
  if (cmd === 'quit') { S = null; return hideModal(); }
  if (cmd === 'retry') return startSneak(S.room);
  if (S.over) return;
  if (cmd === 'wait') return endTurn('You held still.');
  if (cmd === 'coin' && S.coins) { S.aiming = !S.aiming; renderSneak(); }
}

function renderSneak() {
  const cover = {}, next = {};
  for (const g of S.guards) {
    for (const [x, y, dist] of sightOf(g)) {
      const c = (cover[`${x},${y}`] ||= {});
      c[g.type] = Math.max(c[g.type] || 0, dist <= 1.5 ? 0.5 : dist <= 2.5 ? 0.36 : 0.24); // stronger close to the source
    }
    if (!g.down && g.plan && g.plan.to) next[g.plan.to.join(',')] = g.type;
  }
  const me = esc(P ? P.first[0] + P.last[0] : 'ME');
  let cells = '';
  S.tiles.forEach((row, y) => row.forEach((t, x) => {
    const key = `${x},${y}`, g = guardAt(x, y), c = cover[key] || {}, d = Math.abs(x - S.x) + Math.abs(y - S.y);
    const ko = S.guards.some(o => o.down && o.x === x && o.y === y);
    const cls = [t === '#' ? 'wall' : t === 'B' ? 'cover' : 'floor', g && g.type === 'cam' && 'camera',
      c.cop && 'cop', c.cam && 'cam', c.dog && 'smell', next[key] && `next-${next[key]}`,
      !S.over && (S.aiming ? d <= 3 && clearAt(x, y) && 'aim' : d === 1 && walkable(x, y) && 'near')].filter(Boolean).join(' ');
    let inner = { '*': '📁', $: '💵', S: '🚪' }[t] || (ko ? '💤' : '');
    if (x === S.x && y === S.y) inner = `<span class="me">${me}</span>`;
    else if (g) {
      const p = g.plan || {}, arrow = p.to ? ARROW[dirOf([g.x, g.y], p.to)] : p.face ? ARROW[p.face] : '';
      inner = GUARD_ICON[g.type] + (arrow ? `<i class="nx ${g.type}">${arrow}</i>` : '');
    }
    cells += `<button class="tl ${cls}" style="--ac:${c.cop || 0};--ak:${c.cam || 0}" data-tile="${key}" aria-label="Tile ${x + 1}, ${y + 1}">${inner}</button>`;
  }));
  const tip = S.aiming ? 'Tap a tile up to 3 steps away to toss the coin.' : S.msg || 'Grab the file 📁 and get back to the door 🚪.';
  const controls = S.over
    ? `<button class="primary" data-sn="retry">Try again</button><button class="ghost" data-sn="quit">Close</button>`
    : `<button class="opt" data-sn="wait">Wait</button><button class="opt" data-sn="coin"${S.coins ? '' : ' disabled'}>${S.aiming ? 'Cancel' : `Coin ×${S.coins}`}</button><button class="ghost" data-sn="quit">Quit</button>`;
  showModal(`<div class="card sneak ${S.over === 'win' ? 'good' : S.over ? 'bad' : ''}" role="dialog" aria-modal="true">
    <p class="kicker">Test room · Move ${S.moves}${S.got ? ' · File in hand' : ''}</p>
    <h2>${S.over === 'win' ? 'Clean Job' : S.over ? 'Spotted' : 'Sneak In'}</h2>
    <p class="tell">${esc(tip)}</p>
    <div class="sgrid" style="--cols:${S.tiles[0].length}">${cells}</div>
    <div class="row sctl">${controls}</div>
    <div class="legend"><span><i class="k cop"></i>Guard sees</span><span><i class="k cam"></i>Camera sees</span><span><i class="k dog"></i>Dog smells</span></div>
    <p class="rules">Walls and desks block the view. Arrows show each one's next move. Step on a guard from behind to knock them out.</p></div>`);
  modal.querySelector('.sctl button')?.focus();
}

// ---------- screens ----------

const app = $('#app');
const layer = cls => document.body.appendChild(Object.assign(document.createElement('div'), { className: `overlay ${cls}`, hidden: true }));
const sheet = layer('sheet');
const modal = layer('modal');

const item = (act, name, desc, meta, locked) =>
  `<button class="item" data-act="${act}"${locked ? ' disabled' : ''}><span class="nm">${esc(name)}</span><span class="ds">${esc(desc)}</span><span class="mt">${esc(locked || meta)}</span></button>`;
const list = items => `<div class="list">${items.join('')}</div>`;
const msg = text => `<p class="empty">${esc(text)}</p>`;
const facts = rows => `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
const needs = j => Object.entries(j.req || {}).map(([k, v]) => `${LABEL[k]} ${v}+`).concat(j.clean ? ['Clean record'] : []).join(' · ') || 'No experience needed';

const prisonList = () => ['Prison', list(PRISON_ACTIONS.map(a => item(`prison:${a.id}`, a.name, a.desc, '', P.done[a.id] && 'Done this year')))];

const SHEETS = {
  activities() {
    if (P.prison) return prisonList();
    const job = P.job
      ? `<div class="job"><p class="mt">Your job</p><h3>${esc(P.job.title)}</h3><p>${esc(P.job.place)} · ${cash(P.job.salary)} a year</p>
        <div class="row"><button class="ghost" data-act="job:raise"${P.done.raise ? ' disabled' : ''}>Ask for a Raise</button><button class="ghost" data-act="job:quit">Quit</button></div></div>`
      : '';
    const findJob = !P.job && P.age >= 16
      ? [`<button class="item" data-sheet="jobs"><span class="nm">Find a Job</span><span class="ds">Steady pay every year. Lowers heat.</span></button>`]
      : [];
    return ['Activities', job + list(findJob.concat(ACTIVITIES.map(a =>
      item(`act:${a.id}`, a.name, a.desc, '', P.age < a.minAge ? `Age ${a.minAge}+` : P.done[a.id] && 'Done this year'))))];
  },
  jobs() {
    return ['Jobs', list(JOBS.map(j => item(`hire:${j.id}`, j.title, `${cash(j.salary)} a year · ${needs(j)}`, '', P.age < j.minAge && `Age ${j.minAge}+`)))];
  },
  families() {
    return ['Families', `<p class="hint">One try a year. Here is what the street says:</p>` + list(FAMILIES.map(name => {
      const open = FAMILY_INFO[name].scene;
      return `<button class="item" data-seek="${name}"${open ? '' : ' disabled'}><span class="nm">The ${name} family</span><span class="ds">${esc(FAMILY_INFO[name].rumor)}</span>${open ? '' : '<span class="mt">Coming soon</span>'}</button>`;
    }))];
  },
  crime() {
    if (P.prison) return prisonList();
    if (P.age < 10) return ['Crime', msg('Too young for a life of crime. For now.')];
    const seek = !P.fam && P.age >= 16
      ? `<div class="list"><button class="item seek" data-sheet="families"${P.done.seek ? ' disabled' : ''}><span class="nm">Seek Out a Family</span><span class="ds">Try to get in with one of the four families.</span>${P.done.seek ? '<span class="mt">Tried this year</span>' : ''}</button></div><h3 class="sub">Street crimes</h3>`
      : '';
    return ['Crime', seek + list(CRIMES.map(c => {
      const lock = P.age < c.minAge ? `Age ${c.minAge}+` : P.respect < (c.minRespect || 0) ? `Respect ${c.minRespect}+` : '';
      return item(`crime:${c.id}`, c.name, '', `${riskLabel(odds(c))} · ${cash(c.reward[0])}–${cash(c.reward[1])}`, lock);
    }))];
  },
  life() {
    const rows = [
      ['Born', `${P.born} in ${P.district}`], ['Rank', rank(P)], ['Crew', P.flags.crew || 'None'],
      ...(P.fam ? [['Family', `${P.fam.name} · ${FAM_RANKS[P.fam.rank]}`]] : P.flags.family ? [['Contacts', `The ${P.flags.family} family`]] : []),
      ['Crimes committed', P.tally.crimes], ['Arrests', P.tally.arrests], ['Years inside', P.tally.served],
    ];
    return ['Profile', facts(rows) +
      `<div class="list"><button class="item seek" data-do="sneakTest"><span class="nm">Sneak Test Room</span><span class="ds">Try the new sneaking minigame. Nothing here affects your life.</span></button></div><div class="list" id="restart"><button class="item danger" data-do="askRestart"><span class="nm">Start a New Life</span><span class="ds">This life and its save end for good.</span></button></div>` +
      `<p class="ver">Mafiozo 0.5</p>`];
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
  const [status, hot] = P.prison ? [`Inmate #${P.inmate} · ${plural(P.prison, 'year')} left`, true]
    : P.flags.fugitive ? ['Fugitive', true]
    : [P.job ? P.job.title : P.age < 5 ? 'Child' : P.age < 18 ? 'Student' : 'Unemployed', false];
  const log = P.log.map(y => `<section class="yr"><h3>Age ${y.age} · ${P.born + y.age}</h3>${y.items
    .map(it => `<p class="${it.tone}">${esc(it.text)}${it.fx ? `<small>${esc(it.fx)}</small>` : ''}</p>`).join('')}</section>`).join('');
  const bars = STATS.map(([k, label]) => {
    const v = P[k], warn = k === 'heat' ? v >= 50 : k === 'health' && v < 25;
    return `<div class="stat ${k}${warn ? ' warn' : ''}"><b>${v}</b><span>${label}</span><i style="--v:${v}%"></i></div>`;
  }).join('');
  app.innerHTML = `
    <header class="top">
      <div class="mug" aria-hidden="true">${esc(P.first[0] + P.last[0])}</div>
      <div class="who"><h1>${esc(P.first)} ${esc(P.last)}</h1><p>${rank(P)} · Age ${P.age}</p><p class="st${hot ? ' hot' : ''}">${esc(status)}</p></div>
      <div class="cash"><small>Cash</small><b>${cash(P.money)}</b></div>
    </header>
    <main class="log" id="log">${log}</main>
    <section class="stats" aria-label="Stats">${bars}</section>
    <nav class="nav">
      <button data-sheet="activities">Activities</button>
      <button data-sheet="crime">${P.prison ? 'Prison' : 'Crime'}</button>
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
      <p class="eyebrow">VCPD File ${P.born}-${P.inmate}</p>
      <h1 class="logo small">${esc(P.first)} ${esc(P.last)}</h1>
      <p class="tag">${P.born}–${P.born + P.age}. Died at ${P.age}. ${esc(P.cause)}.</p>
      ${facts([['Rank', rank(P)], ['Cash left behind', cash(P.money)], ['Most cash ever', cash(P.tally.peak)], ['Crimes committed', P.tally.crimes],
        ['Arrests', P.tally.arrests], ['Years inside', P.tally.served], ['Crew', P.flags.crew || 'None']])}
      <button class="primary big" data-do="restart">Start a New Life</button>
    </section>`;
}

const DO = {
  age: ageUp,
  next() { hideModal(); if (P.alive) nextEvent(); else render(); },
  randomize,
  sneakTest() { closeSheet(); startSneak(SNEAK_TEST); },
  flee,
  askRestart() {
    $('#restart').innerHTML = `<p class="hint">End ${esc(P.first)}'s life for good?</p><div class="row"><button class="danger" data-do="restart">Yes, start over</button><button class="ghost" data-close>Keep playing</button></div>`;
  },
  restart() {
    P = null;
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
  else if (d.act) perform(...d.act.split(':'));
  else if (d.move) strike(d.move);
  else if (d.seek) seekFamily(d.seek);
  else if (d.tile) sneakTap(d.tile);
  else if (d.sn) sneakCmd(d.sn);
  else if ('choice' in d) choose(+d.choice);
  else if ('close' in d) closeSheet();
  else if (d.do) DO[d.do]();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

document.addEventListener('submit', e => {
  e.preventDefault();
  newLife($('#first').value.trim() || 'Johnny', $('#last').value.trim() || 'Nobody', e.target.gender.value || 'M');
});

// Boot. In the Claude app viewer, keep the life across live updates of the page.
function start(data) {
  P = (data && data.P) || load();
  if (P && P.str == null) P.str = 20; // saves from before strength existed
  render();
  if (P && P.alive) nextEvent();
}
window.claude?.hot?.snapshot?.(() => ({ P }));
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
