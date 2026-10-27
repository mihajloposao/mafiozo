# Mafiozo

BitLife-style crime life simulator for phones. Game UI in English; fictional modern city "Velmora City"; tone between gritty and darkly funny.
The owner does not write code and builds the game only by chatting (in Serbian). They watch their token budget, so keep sessions lean:
no exploratory reads beyond what a change needs, no subagents, and reply in short Serbian.

## Files
- `index.html` – PWA shell (manifest, service worker). Plain HTML/CSS/JS, no build step.
- `css/style.css` – all styling; color and font tokens on `:root` (single dark theme by design).
- `js/data.js` – content: names, crimes, activities, prison actions, jobs, random events. New content goes here.
- `js/game.js` – engine (state `P`, aging, crime odds, arrests, event queue, save) and UI rendering.
- `sw.js` – network-first cache. Bump `CACHE` on each release.
- `tools/smoke.js` – `node tools/smoke.js [shot.png]` plays 3 random lives headless; exits 1 on page errors.
- `tools/artifact.html` – shell for the claude.ai artifact build.

## Conventions
- Outcomes: `ok|bad|meh(text, fx, causeOfDeath)`. fx keys: money, health, str, smarts, respect, heat.
- Keep it simple: five stats, four nav buttons (Activities incl. job, Crime, Profile, Age +1), one tap per fight round.
- Events: `{ id, title, when(p), w?, once?, tag?, inside?|anywhere?, ctx?(p), text(p,c), choices: [{ label, run(p,c) }] }` or `auto(p,c)` instead of text/choices.
  A choice or activity may return `brawl(foe, name, win, lose, flee?)` (foes in `FOES`) to start the fight minigame; health lost in the fight is added to the outcome.
  `scene: true` events never roll at random; they run when started (Seek Out a Family uses FAMILY_INFO[name].scene).
  Families: no visible requirements, only street rumors; each test picks a random variant (venue, opponent, place).
  Sneaking minigame (turn-based grid, rooms in data.js): `startSneak({ room, entry, label, end })`; used by the Moretti test, test room in Profile.
  Safe minigame (memory keypad): `startSafe(job, title)`; used by the Delacroix test (DELACROIX_JOBS: method scope/closet/bribe), test room in Profile.
  Anyone noticing you = alarm: the guard chases 2 steps per turn and must tackle you, gives up if you stay hidden;
  the alarm wakes a knocked-out guard. Arrows (next move) always show; route dots only with smarts 65+.
  Endings: win (clean), loud (out with the target after an alarm), fled (out without it), caught.
  Context `c`: first, last, full, n (name with nickname), crew, rival, fam, cop. Write NPC lines without pronouns.
- Save lives in localStorage under `mafiozo.save.v1`; change the key if the save shape changes incompatibly.

## Releasing
1. `node tools/smoke.js` must print "no page errors".
2. Bump `CACHE` in `sw.js`.
3. Republish the artifact: Artifact publish with `url` https://claude.ai/artifact/Fczgbf79W4LJCkRvMvyemV,
   `file_path` tools/artifact.html, `files` {"css/style.css","js/data.js","js/game.js"} mapped to themselves.
4. Commit and push. GitHub Pages (when enabled) serves https://mihajloposao.github.io/mafiozo/

## Roadmap
1. Phase 1 (done): life loop, stats, crimes, heat, prison, jobs, ~20 events, death, save.
2. Phase 2: the climb. Nothing is automatic or mandatory; staying a solo criminal is a valid life. Build one segment at a time:
   a. Joining a family on purpose (in progress: Volkov ring, Moretti sneaking and Delacroix safe done;
      next Castellano collecting from three random debtors). "Seek Out a Family" in Crime, once a year;
      each family runs approach, minigame test, verdict. The owner plans every segment before it is built: never build unasked.
   Later segments, each planned separately: joining by chance (an offer after something memorable);
   life inside a family (ranks associate to don, trust with the boss, family jobs, promotions).
   b. Founding your own family: name a crew, recruit, take Velmora districts one by one (crew, gang, family); existing families see a threat.
   c. Conflicts and the road to Don for both paths: succession or coup, DA deal to testify, loyalty tests, family wars.
   Later: relationships (family members, partner, heirs, crew friends).
3. Phase 3: businesses, property, money laundering, courts and lawyers.
4. Phase 4: art, sound, balance, store release (Capacitor).
