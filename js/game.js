// Mafiozo – engine and UI. Game content (crimes, events, names) lives in data.js.

const SAVE_KEY = 'mafiozo.save.v1';
const STATS = [['health', 'Health'], ['happy', 'Happiness'], ['smarts', 'Smarts'], ['looks', 'Looks'], ['respect', 'Respect'], ['heat', 'Heat']];
const LABEL = { ...Object.fromEntries(STATS), str: 'Strength' };
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

const rank = p => RANKS.filter(([min]) => p.respect >= min).pop()[1];
const heatLabel = h => (h >= 75 ? 'Wanted' : h >= 50 ? 'Hot' : h >= 25 ? 'Warm' : 'Cold');
const riskLabel = p => (p >= 0.7 ? 'Low risk' : p >= 0.45 ? 'Medium risk' : p >= 0.25 ? 'High risk' : 'Suicide mission');

// ---------- the life ----------

function newLife(first, last, gender) {
  P = {
    first, last, gender, age: 0, born: new Date().getFullYear(), district: pick(DISTRICTS),
    money: 0, str: rnd(5, 20), health: rnd(75, 100), happy: rnd(60, 100), smarts: rnd(15, 90), looks: rnd(15, 90), respect: 0, heat: 0,
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

// ---------- work ----------

function applyJob(j) {
  if (j.clean && (P.tally.arrests || P.heat > 30)) return bad('Your background check came back dirty.', { happy: -2 });
  const qualified = Object.entries(j.req || {}).every(([k, v]) => P[k] >= v);
  if (!qualified || !chance(0.85)) return bad(`${j.place} hired someone else.`, { happy: -2 });
  P.job = { title: j.title, place: j.place, salary: j.salary };
  return ok(`You're the new ${j.title} at ${j.place}.`, { happy: 4 });
}

function askRaise() {
  if (!chance(0.35 + P.smarts / 300)) return bad('Your boss laughed you out of the office.', { happy: -3 });
  const raise = Math.round((P.job.salary * rnd(5, 12)) / 100 / 100) * 100;
  P.job.salary += raise;
  return ok(`Your boss gave you a ${cash(raise)} raise.`, { happy: 4 });
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
    applyFx({ respect: 1, happy: -rnd(2, 5) });
    if (P.prison) note(`Another year inside. ${plural(P.prison, 'year')} to go.`);
    else note('You walked out of the gates a free person.', 'good');
  } else {
    if (a === 5) note('You started school at P.S. 41.');
    if (a >= 6 && a <= 18) applyFx({ smarts: rnd(0, 3) });
    if (a >= 10 && a <= 20) applyFx({ str: rnd(0, 2) });
    if (a === 18) note(P.smarts >= 35 ? 'You graduated from Velmora High.' : 'You dropped out of Velmora High.');
    if (P.job) {
      applyFx({ money: P.job.salary, happy: -rnd(0, 2), heat: -3 });
      note(`You earned ${cash(P.job.salary)} as a ${P.job.title}.`);
    }
  }
  // Health tracks injuries, not illness: wounds heal a little every year.
  if (a > 45) applyFx({ looks: -rnd(0, 2) });
  applyFx({ health: rnd(2, 5), happy: rnd(-3, 3), heat: -rnd(4, 9) });
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
  const pool = EVENTS.filter(e => (!tag || e.tag === tag) && !(e.once && P.seen[e.id]) && !P.pending.some(x => x.id === e.id) && eligible(e));
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
    return resolve(meh(`You quit your job as a ${title}.`, { happy: 2 }), 'Quit');
  }
}

// ---------- fights ----------
// Each round: pick Punch, Block or Grapple (punch beats grapple, grapple beats block, block beats punch),
// then stop the swinging needle in the bright zone. Timing scales damage dealt and taken.
// Strength sets your hit power, health sets your fight points and zone size, smarts can reveal the next move.
const MOVES = { punch: 'Punch', block: 'Block', grapple: 'Grapple' };
const BEATS = { punch: 'grapple', grapple: 'block', block: 'punch' };
const TELLS = { punch: 'pulls a fist back', block: 'raises both arms', grapple: 'crouches low, arms wide' };
const WIN_TEXT = { punch: 'You caught them coming in.', grapple: 'You got past the guard and slammed them down.', block: 'You blocked and countered.' };
const LOSE_TEXT = { punch: 'They caught you coming in.', grapple: 'They got past your guard and slammed you down.', block: 'They blocked and countered.' };
const cap = s => s[0].toUpperCase() + s.slice(1);
let F = null; // the fight in progress (not saved)

const brawl = (foe, name, win, lose, flee) => ({ fight: { ...FOES[foe], name }, win, lose, flee });

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
  const mix = F.foe.mix;
  let roll = Math.random() * Object.values(mix).reduce((a, b) => a + b, 0);
  F.next = Object.keys(mix).find(k => (roll -= mix[k]) < 0) || 'punch';
  const tell = chance(P.smarts / 130) ? `${cap(F.foe.name)} ${TELLS[F.next]}.` : `You can't read ${F.foe.name}.`;
  showModal(fightCard(`<p class="tell">${esc(tell)}</p>
    <div class="moves">${Object.entries(MOVES).map(([k, v]) => `<button class="opt" data-move="${k}">${v}</button>`).join('')}</div>
    <button class="ghost flee" data-do="flee">Run for it</button>`));
}

const needlePos = () => { const ph = (((performance.now() - F.t0) / 1000) * F.foe.spd) % 2; return (ph < 1 ? ph : 2 - ph) * 100; };

function pickMove(m) {
  const w = 14 + Math.round(P.health / 10);
  F.move = m;
  F.zone = { x: rnd(5, 95 - w), w };
  F.t0 = performance.now();
  F.timing = true;
  showModal(fightCard(`<p class="tell">Stop the needle in the bright zone.</p>
    <div class="meter"><i style="left:${F.zone.x}%;width:${w}%"></i><b id="needle"></b></div>
    <button class="primary strike" data-do="strike">${MOVES[m]}!</button>`));
  const sweep = () => {
    if (!F || !F.timing) return;
    $('#needle').style.left = `${needlePos()}%`;
    requestAnimationFrame(sweep);
  };
  requestAnimationFrame(sweep);
}

function strike() {
  const pos = needlePos(), { x, w } = F.zone;
  F.timing = false;
  const [q, label] = pos >= x && pos <= x + w ? [1.5, 'Perfect!'] : pos >= x - 10 && pos <= x + w + 10 ? [1, 'Solid.'] : [0.5, 'Sloppy.'];
  const mine = Math.round((8 + P.str / 5) * q), theirs = Math.round(rnd(F.foe.pow - 3, F.foe.pow + 3) * (2 - q));
  const me = F.move, them = F.next;
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
  const r = F[kind] ? F[kind]() : meh('You ran. Your pride did not make it.', { respect: -2 });
  r.fx = { ...r.fx, health: (r.fx.health || 0) - Math.round(F.taken * 0.35) };
  const title = F.title;
  F = null;
  resolve(r, title);
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

const SHEETS = {
  activities() {
    if (P.prison) return ['Activities', msg('You are behind bars. Use the Prison tab.')];
    return ['Activities', list(ACTIVITIES.map(a =>
      item(`act:${a.id}`, a.name, a.desc, 'Once a year', P.age < a.minAge ? `Age ${a.minAge}+` : P.done[a.id] && 'Done this year')))];
  },
  crime() {
    if (P.prison) return ['Prison', list(PRISON_ACTIONS.map(a => item(`prison:${a.id}`, a.name, a.desc, 'Once a year', P.done[a.id] && 'Done this year')))];
    if (P.age < 10) return ['Crime', msg('Too young for a life of crime. For now.')];
    return ['Crime', `<p class="hint">Heat: ${heatLabel(P.heat)}. More heat means worse odds and longer sentences.</p>` + list(CRIMES.map(c => {
      const lock = P.age < c.minAge ? `Age ${c.minAge}+` : P.respect < (c.minRespect || 0) ? `Respect ${c.minRespect}+` : '';
      return item(`crime:${c.id}`, c.name, c.desc, `${riskLabel(odds(c))} · ${cash(c.reward[0])}–${cash(c.reward[1])}`, lock);
    }))];
  },
  work() {
    if (P.prison) return ['Work', msg('The only job inside is stamping license plates for 40 cents an hour.')];
    if (P.age < 16) return ['Work', msg('You are too young to work. School is your job for now.')];
    if (P.job) {
      return ['Work', `<div class="job"><p class="mt">Current job</p><h3>${esc(P.job.title)}</h3><p>${esc(P.job.place)} · ${cash(P.job.salary)} a year</p></div>` + list([
        item('job:raise', 'Ask for a Raise', 'Smarts help. Once a year.', '', P.done.raise && 'Done this year'),
        item('job:quit', 'Quit', 'Walk out and never look back.', ''),
      ])];
    }
    return ['Work', list(JOBS.map(j => item(`hire:${j.id}`, j.title, `${j.place} · ${cash(j.salary)} a year`, needs(j), P.age < j.minAge && `Age ${j.minAge}+`)))];
  },
  life() {
    const rows = [
      ['Born', `${P.born} in ${P.district}`], ['Rank', rank(P)], ['Strength', P.str], ['Crew', P.flags.crew || 'None'],
      ...(P.flags.family ? [['Contacts', `The ${P.flags.family} family`]] : []),
      ['Crimes committed', P.tally.crimes], ['Arrests', P.tally.arrests], ['Years inside', P.tally.served],
    ];
    return ['Life', facts(rows) +
      `<div class="list" id="restart"><button class="item danger" data-do="askRestart"><span class="nm">Start a New Life</span><span class="ds">This life and its save end for good.</span></button></div>` +
      `<p class="ver">Mafiozo 0.2 · Phase 1 prototype</p>`];
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
  const status = [
    P.prison ? [`Inmate #${P.inmate} · ${plural(P.prison, 'year')} left`, 'hot'] : [P.job ? P.job.title : P.age < 5 ? 'Child' : P.age < 18 ? 'Student' : 'Unemployed', ''],
    [`Heat: ${heatLabel(P.heat)}`, P.heat >= 50 ? 'hot' : P.heat >= 25 ? 'warm' : ''],
    P.flags.crew && [`Crew: ${P.flags.crew}`, 'warm'],
    P.flags.fugitive && ['Fugitive', 'hot'],
  ].filter(Boolean).map(([t, cls]) => `<span class="pill ${cls}">${esc(t)}</span>`).join('');
  const log = P.log.map(y => `<section class="yr"><h3>Age ${y.age} · ${P.born + y.age}</h3>${y.items
    .map(it => `<p class="${it.tone}">${esc(it.text)}${it.fx ? `<small>${esc(it.fx)}</small>` : ''}</p>`).join('')}</section>`).join('');
  const bars = STATS.map(([k, label]) => {
    const v = P[k], warn = k === 'heat' ? v >= 50 : (k === 'health' || k === 'happy') && v < 25;
    return `<div class="stat ${k}${warn ? ' warn' : ''}"><span>${label}</span><b>${v}%</b><i style="--v:${v}%"></i></div>`;
  }).join('');
  app.innerHTML = `
    <header class="top">
      <div class="mug" aria-hidden="true">${esc(P.first[0] + P.last[0])}</div>
      <div class="who"><h1>${esc(P.first)} ${esc(P.last)}</h1><p>${rank(P)} · Age ${P.age}</p></div>
      <div class="cash"><small>Cash</small><b>${cash(P.money)}</b></div>
    </header>
    <div class="status">${status}</div>
    <main class="log" id="log">${log}</main>
    <section class="stats" aria-label="Stats">${bars}</section>
    <nav class="nav">
      <button data-sheet="activities">Activities</button>
      <button data-sheet="crime">${P.prison ? 'Prison' : 'Crime'}</button>
      <button class="age" data-do="age">Age <b>+1</b></button>
      <button data-sheet="work">Work</button>
      <button data-sheet="life">Life</button>
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
  strike,
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
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.sheet) openSheet(d.sheet);
  else if (d.act) perform(...d.act.split(':'));
  else if (d.move) pickMove(d.move);
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
