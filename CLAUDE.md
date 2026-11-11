# Mafiozo

BitLife-style crime life simulator for phones. Game UI in English; fictional modern city "Velmora City"; tone between gritty and darkly funny.
The owner does not write code and builds the game only by chatting (in Serbian). They watch their token budget, so keep sessions lean:
no exploratory reads beyond what a change needs, no subagents, and reply in short Serbian.

## Files
- `index.html` – PWA shell (manifest, service worker). Plain HTML/CSS/JS, no build step.
- `css/style.css` – all styling; color and font tokens on `:root` (single dark theme by design).
- `js/data.js` – content: names, families and their tests, the yearly challenge, fight opponents. New content goes here.
- `js/game.js` – engine (state `P`, aging, event queue, minigames, save) and UI rendering.
- `sw.js` – network-first cache. Bump `CACHE` on each release.
- `tools/smoke.js` – `node tools/smoke.js [shot.png]` plays 3 random lives headless; exits 1 on page errors.
- `tools/artifact.html` – shell for the claude.ai artifact build.

## Conventions
- Outcomes: `ok|bad|meh(text, fx, causeOfDeath)`. fx keys: money, health, str, smarts, respect, heat, soul (soul -100..100).
- Health is shown as HP and is your fight points: a life starts with 1-35, bell-shaped around 26 (childHp), capped at 35 up to age 12 and 100 later
  (agreed: HP grows by itself +0-5 a year, up to the cap; healing is not designed yet).
- Keep it simple: six stats, four nav buttons (Activities (empty for now), Crime (Seek Out a Family), Profile, Age +1), one move per fight round.
- Only explicitly agreed concepts exist (owner). Removed prototype concepts: crimes, arrests and prison, jobs, activities,
  school and graduation, street ranks, old-age death, heat cooling, crew and lockpicking, random yearly events.
- Events: `{ id, title, scene: true, when(p), ctx?(p), text(p,c), choices: [{ label, run(p,c) }] }` or `auto(p,c)` instead of text/choices.
  A choice or activity may return `brawl(foe, name, win, lose, flee?)` (foes in `FOES`) to start the fight minigame; health lost in the fight is added to the outcome.
  Fights: the needle crosses once (too slow = the hit lands unopposed); Perfect/Solid zones widen with strength and shrink
  with lost stamina (to 60%), the needle gets up to 40% faster with lost stamina; stamina: punch -25, grapple -30,
  block +15 (not when Sloppy or broken by a grapple), no other recovery. Moves: punch full damage, stopped by a block;
  grapple 60% damage, breaks a block; a landed punch drains 5 stamina, a grapple 20; punch vs grapple both land;
  the same move on both sides lands at half.
  A block never deals damage, and timing grades every move (an incoming hit: Perfect x0.5, Solid x1, Sloppy x1.5): block vs punch: Perfect = blocked and the puncher is open
  (next move 50% harder), Solid = blocked, Sloppy = half gets through; punch vs block: Perfect = half damage through the
  guard, Solid = blocked, Sloppy = blocked and you are open. Fleeing depends on fight points and stamina left.
  The opponent has stamina too (70 + 2 x pow, same costs; the yard kid is built from str 5-20 / childHp() by your own formulas): tired it hits softer (to 60%) and backs off into blocks under 30.
  After every round a reveal shows both moves and the damage; the next round starts on 'Next round'.
  Feints and learning foes exist only in the Fight Test Room (F.v2) until the owner approves them.
  Events run only when started (Seek Out a Family runs a random FAMILY_TESTS event with c.fam set).
  Families: no visible requirements, only street rumors. Any family gives any test (ring, sneak, safe, collect) at random;
  each test also picks a random variant (venue, opponent, place). Use clan(fam) for the plural (the Morettis, the Delacroix).
  Sneaking minigame (turn-based grid, rooms in data.js): `startSneak({ room, entry, label, end })`; used by the sneak test, test room in Profile.
  Safe minigame (memory keypad): `startSafe(job, title)`; used by the safe test (DELACROIX_JOBS: method scope/closet/bribe), test room in Profile.
  Slingshot minigame (5 stones, 5 targets; drag down anywhere, longer pull = farther, only the start of the path shows,
  the hand shakes more the longer you hold; scenes in SLING_SCENES, tunables in SLING): `startSling({ scene, end? }, title)`;
  only a test room in Profile so far (step 1 of the agreed plan: feel, then strength/smarts, then the uncle story, then the rest).
  Memory minigame (pairs, DEBTORS): `startMemory(job, title)`; cards start hidden, matched pairs are taken; used by the collect test, test room in Profile.
  Collect night: P.collect holds the notebook (3 DEBTORS); events debtor/sweep/handover; skimming or lying for a debtor can be found out.
  Anyone noticing you = alarm: the guard chases 2 steps per turn and must tackle you, gives up if you stay hidden;
  the alarm wakes a knocked-out guard. Arrows (next move) always show; route dots only with smarts 65+.
  Endings: win (clean), loud (out with the target after an alarm), fled (out without it), caught.
  Context `c`: first, last, full, fam (plus what an event's ctx adds). Write NPC lines without pronouns.
- Save lives in localStorage under `mafiozo.save.v1`; change the key if the save shape changes incompatibly.

## Releasing
1. `node tools/smoke.js` must print "no page errors".
2. Bump `CACHE` in `sw.js`.
3. Republish the artifact: Artifact publish with `url` https://claude.ai/artifact/Fczgbf79W4LJCkRvMvyemV,
   `file_path` tools/artifact.html, `files` {"css/style.css","js/data.js","js/game.js"} mapped to themselves.
4. Commit and push. GitHub Pages (when enabled) serves https://mihajloposao.github.io/mafiozo/

## Roadmap
1. Phase 1 (prototype): life loop, stats, death at 0 HP, save (its other concepts were removed, see Conventions).
2. Phase 2: the climb. Nothing is automatic or mandatory; staying a solo criminal is a valid life. Build one segment at a time:
   a. Joining a family on purpose (done: Volkov ring, Moretti sneaking, Delacroix safe, Castellano collecting). "Seek Out a Family" in Crime, once a year;
      each family runs approach, minigame test, verdict. The owner plans every segment before it is built: never build unasked.
   Agreed order of the next segments (each planned with the owner first):
   1. Life inside a family (most important: joining only gives a title today): yearly family jobs that reuse the
      minigames, trust with the boss, ranks associate/soldier/capo/underboss with a promotion event each,
      rank perks (yearly income, family lawyer), the boss takes a cut.
   2. Joining by chance: a family notices you after something memorable (big score, won fight). Small step.
   3. Founding your own family (b below). 4. Conflicts and the road to Don (c below).
   Small cleanups on the way: remove the three test rooms from Profile once the owner no longer needs them.
   b. Founding your own family: name a crew, recruit, take Velmora districts one by one (crew, gang, family); existing families see a threat.
   c. Conflicts and the road to Don for both paths: succession or coup, DA deal to testify, loyalty tests, family wars.
   Later: relationships (family members, partner, heirs, crew friends).
   Yearly challenge (planning, owner's decisions): every year from early childhood one short minigame with a short
   backstory, chosen at random from scenarios that fit the age and situation (no repeat two years in a row). The result
   (great/ok/bad) raises or lowers stats; the trained stat is NOT shown beforehand. Mandatory, no skip. It replaces the
   automatic stat growth (a school concept comes later). New minigame mechanics will be built for it.
   Scenario = mechanic + story + difficulty + stat. Planning starts with the earliest age, then later ages.
   Decided: a new life starts at age 5 (birth year counted back) with a short early-childhood summary in the log
   (birthplace, parents, one or two small memories reusing the age 2-6 'kid' events); TODO later: refine that summary.
   The first challenge runs right at the start, at age 5. Childhood scenarios (ages 5-12) are detailed one by one.
   Chosen first childhood stories (each still to be detailed): chess with grandpa; schoolyard fight (with a choice to
   fight or not); slingshot and cans; school quiz (with a chance to cheat); school cross-country run (with variations).
   Built: CHALLENGES (data.js) + queueChallenge() run one scene per year;
   a life starts at 5 with a 'Born' log block. Done stories: 'yard' (schoolyard fight: hit first soul-3 respect+2 then fight;
   back off soul+3 respect-4; teacher respect-8; joke succeeds (smarts) respect+4 or fails respect-3 then fight;
   fight great/ok/bad/fled set str/respect/health exactly). No stat grows automatically (owner: not until it is explicitly agreed): the yearly
   smarts/strength growth, the prison respect and the graduation at 18 were removed; agreed: HP +0-5 a year.
   All random yearly events from the first prototype were removed (owner: only agreed content), and with them the
   yearly random roll (queueEvent); KID_MEMORIES feeds the 'Born' block.
   Moral stories are separate from the yearly challenge: choice events (no minigame) that move Soul, to be built later.
   Childhood ideas: defend the new kid being teased; carry the old neighbor's bags; find a lost dog's owner;
   broke a window with a ball (own up or run); late home (lie or tell the truth).
   Stats redesign (open, owner decides later): stat 'Soul' is in the game (-100 evil to +100 good, starts at 0, shown,
   but nothing changes it and it affects nothing yet; later it may
   affect luck or how people react). For it AND for the existing five (health, strength, smarts, respect, heat), what
   they affect and how they change is NOT decided yet and will be defined together; the current code stays until then.
3. Phase 3: businesses, property, money laundering, courts and lawyers.
4. Phase 4: art, sound, balance, store release (Capacitor).
