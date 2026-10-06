// Area trainer checks: the team rules in creatures.js and the fight in game.js.
// Run with: node --test tests/*.test.mjs
// game.js runs against stand-in page objects (see fakeElement), with drawing off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fakeElement() {
  const classes = new Set();
  return { textContent: '', title: '', style: {},
           classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
                        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
}
const elements = {};
const areaButtons = [0, 1, 2, 3].map(fakeElement);
const ctx = {
  window: { addEventListener() {} },
  setTimeout: () => 0,
  document: { getElementById: (id) => (elements[id] ||= fakeElement()), querySelectorAll: () => areaButtons },
  localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } },
};
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nObject.assign(this, { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame, AREAS,' +
  ' GUARDIAN_LEVELS, TRAINER_LEVELS, TRAINER_NAMES, TRAINER_GOLD, trainerTeam, guardianSpecies,' +
  ' levelForStrength });', ctx);
const { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame, AREAS, GUARDIAN_LEVELS, TRAINER_LEVELS,
        TRAINER_NAMES, TRAINER_GOLD, trainerTeam, guardianSpecies, levelForStrength } = ctx;

/** A game with a level-`level` starter, nothing drawn, and the status recorded. */
function makeGame(level = 50) {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.team.push(new Codemon(CODEMON_SPECIES[0], level));
  game.currentArea = 0;
  game.guardiansBeaten = [];
  game.guardianRetryLevel = {};
  game.trainersBeaten = [];
  game.trainerRetryLevel = {};
  game.justOpenedArea = false;
  game.status = '';
  game.setStatus = (m) => { game.status = m; };
  for (const m of ['updateBattleUI', 'updateTeamUI', 'updateStats', 'switchView', 'saveGame']) game[m] = () => {};
  game.endBattle = () => { game.battle = null; };
  game.fxBusy = () => false;
  game.playerPos = { x: 250, y: 200 };
  game.playerTarget = { x: 250, y: 200 };
  game.startEncounter = () => {};
  game.canWalk = () => true;
  return game;
}

/** Knock out whatever the trainer has out right now. */
function knockOut(game) {
  game.battle.enemyCodemon.currentHp = 0;
  game.battle.battleOver = true;
  game.battle.playerWon = true;
  game.checkBattleStatus();
  if (game.fx) game.fx.evolution = null;          // any evolution has finished playing
}

test("each area's trainer has three of that area's CodeMon, under its guardian, never the guardian", () => {
  AREAS.forEach((area, i) => {
    const ids = area.possibleEncounters;
    const team = trainerTeam(ids[0], ids.at(-1), TRAINER_LEVELS[i]);
    assert.equal(team.length, 3);
    const guardian = guardianSpecies(ids[0], ids.at(-1));
    for (const t of team) {
      assert.ok(ids.includes(t.species.id), `area ${i}`);
      assert.notEqual(t.species, guardian);
      assert.ok(t.level < GUARDIAN_LEVELS[i]);
    }
    assert.equal(new Set(team.map(t => t.species.id)).size, 3, 'three different CodeMon');
    // Scaled for strength like wild CodeMon, from TRAINER_LEVELS, one level apart.
    assert.deepEqual([...team.map(t => t.level)], [...team.map((t, n) =>
      Math.max(2, Math.round(levelForStrength(TRAINER_LEVELS[i] + n - 1, t.species))))]);
    // The same every time: the trainer you lost to is the one you face again.
    assert.deepEqual([...trainerTeam(ids[0], ids.at(-1), TRAINER_LEVELS[i]).map(t => t.species.id)],
                     [...team.map(t => t.species.id)]);
  });
  assert.equal(TRAINER_NAMES.length, AREAS.length);
  assert.equal(TRAINER_LEVELS.length, AREAS.length);
  TRAINER_LEVELS.forEach((lvl, i) => assert.ok(lvl <= GUARDIAN_LEVELS[i], `area ${i}: a warm-up, not harder`));
});

test('the game sends out exactly the team the rules describe', () => {
  const game = makeGame();
  AREAS.forEach((area, i) => {
    const ids = area.possibleEncounters;
    const t = game.makeTrainer(i);
    const want = trainerTeam(ids[0], ids.at(-1), TRAINER_LEVELS[i]);
    assert.deepEqual([t.first, ...t.rest].map(c => [c.species.id, c.level]),
                     [...want.map(w => [w.species.id, w.level])].map(x => [...x]));
    assert.equal(t.first.currentHp, t.first.hp, 'fresh, at full HP');
  });
});

test("a trainer never brings the area's guardian, even from a small pool", () => {
  // In a full area the picks rarely land on it; in small windows of species
  // they often would, without the rule.
  for (let lo = 1; lo <= 200; lo++) {
    const g = guardianSpecies(lo, lo + 4);
    for (const t of trainerTeam(lo, lo + 4, 20)) assert.notEqual(t.species, g, `ids ${lo}..${lo + 4}`);
  }
});

test("a trainer's CodeMon can't be caught or run from", () => {
  const game = makeGame();
  game.challengeTrainer();
  assert.ok(game.battle.trainer);
  assert.equal(game.battle.trainer.name, TRAINER_NAMES[0]);
  const balls = game.player.items.pokeball;
  game.confirmCatch();
  assert.equal(game.player.items.pokeball, balls, 'no ball thrown');
  game.showCatchOptions();
  assert.match(game.status, /can't catch a trainer/);
  game.attemptFlee();
  assert.ok(game.battle, 'still fighting');
  assert.match(game.status, /no running from a trainer battle/);
});

test("the battle screen names the trainer's CodeMon", () => {
  const game = makeGame();
  game.challengeTrainer();
  CodemonGame.prototype.updateBattleUI.call(Object.assign(game, {
    battleLog: { innerHTML: '', appendChild() {}, scrollTop: 0, scrollHeight: 0 },
    shownHpFor: (c) => c.currentHp,
  }));
  assert.equal(elements.enemyName.textContent,
               `🎓 ${TRAINER_NAMES[0]}'s ${game.battle.enemyCodemon.species.name}`);
});

test('after a knockout the next CodeMon waits for the screen, then comes out', () => {
  const game = makeGame();
  game.challengeTrainer();
  const first = game.battle.enemyCodemon;
  const gold = game.player.gold;
  knockOut(game);
  assert.equal(game.player.gold, gold + 50, 'paid for the knockout');
  assert.equal(game.battleActive(), false, 'no moves while it waits');
  game.checkBattleStatus();                       // e.g. a late click
  assert.equal(game.player.gold, gold + 50, 'paid once, not twice');

  game.fxBusy = () => true;                       // the knockout is still playing
  game.sendOutTrainerNext();
  assert.equal(game.battle.enemyCodemon, first);

  game.fxBusy = () => false;
  game.battle.defBoost.enemy = 2.5;               // the first one had used Harden
  game.sendOutTrainerNext();
  const second = game.battle.enemyCodemon;
  assert.notEqual(second, first);
  assert.equal(game.battleActive(), true);
  assert.equal(game.battle.enemySpeed, second.stats.spd);
  assert.equal(game.battle.defBoost.enemy, 1);
  assert.equal(game.battle.trainer.rest.length, 1);
});

test('beating the last CodeMon beats the trainer: saved as beaten, and gold paid', () => {
  const game = makeGame();
  game.challengeTrainer();
  const gold = game.player.gold;
  knockOut(game); game.sendOutTrainerNext();
  knockOut(game); game.sendOutTrainerNext();
  knockOut(game);
  assert.deepEqual([...game.trainersBeaten], [0]);
  assert.equal(game.player.gold, gold + 3 * 50 + TRAINER_GOLD);
  assert.equal(game.battle.resolved, true, 'the fight is over');
  assert.match(game.status, /You beat Intern Ivy/);
  assert.deepEqual([...game.guardiansBeaten], [], 'it opens nothing');
});

test('losing to a trainer is a normal blackout, and autoplay waits 2 levels to retry', () => {
  const game = makeGame(20);
  game.challengeTrainer();
  game.player.team[0].currentHp = 0;
  game.battle.battleOver = true;
  game.battle.playerWon = false;
  game.checkBattleStatus();
  assert.equal(game.battle.resolved, true);
  assert.match(game.status, /All CodeMons fainted/);
  assert.equal(game.trainerRetryLevel[0], 22);
  assert.equal(game.guardianRetryLevel[0], undefined, 'the guardian is unaffected');
});

test('the trainer button refuses when it should', () => {
  const none = makeGame();
  none.player.team = [];
  none.challengeTrainer();
  assert.match(none.status, /starter/);

  const fainted = makeGame();
  fainted.player.team[0].currentHp = 0;
  fainted.challengeTrainer();
  assert.match(fainted.status, /rest before facing a trainer/);

  const busy = makeGame();
  busy.battle = {};
  busy.challengeTrainer();
  assert.match(busy.status, /Finish the current fight/);

  const done = makeGame();
  done.trainersBeaten = [0];
  done.challengeTrainer();
  assert.equal(done.battle, undefined);
  assert.match(done.status, /already beaten Intern Ivy/);
});

const saveWith = (extra) => ctx.localStorage.setItem('codemonSave', JSON.stringify({
  v: 1, gold: 10, items: {}, pokedex: [1],
  team: [{ species: 1, level: 20, exp: 0, expToLevel: 60, hp: 30 }], ...extra }));

test('beaten trainers are saved and loaded, junk dropped, and an older save has none', () => {
  const game = makeGame();
  game.trainersBeaten = [1];
  CodemonGame.prototype.saveGame.call(game);
  assert.deepEqual(JSON.parse(ctx.localStorage.getItem('codemonSave')).trainersBeaten, [1]);

  const loaded = makeGame();
  loaded.changeArea = () => {};
  saveWith({ trainersBeaten: [0, 'x', 9, 0, -1, 2.5, 3] });
  assert.equal(loaded.loadGame(), true);
  assert.deepEqual([...loaded.trainersBeaten], [0, 3]);

  const old = makeGame();
  old.changeArea = () => {};
  saveWith({});
  assert.equal(old.loadGame(), true);
  assert.deepEqual([...old.trainersBeaten], []);
});

function autoGame(level) {
  const game = makeGame(level);
  Object.assign(game, { autoPlay: true, currentView: 'exploration' });
  game.trainerFights = 0;
  game.guardianFights = 0;
  game.challengeTrainer = () => { game.trainerFights++; };
  game.challengeGuardian = () => { game.guardianFights++; };
  game.player.items.potion = 5;
  game.player.items.pokeball = 5;
  return game;
}

test('autoplay takes on the trainer once its lead is 2 levels under the guardian', () => {
  const ready = GUARDIAN_LEVELS[0] - 2;
  const low = autoGame(ready - 1);
  low.autoPlayStep();
  assert.equal(low.trainerFights, 0);

  const game = autoGame(ready);
  game.autoPlayStep();
  assert.equal(game.trainerFights, 1);

  const hurt = autoGame(ready);
  hurt.player.team[0].currentHp = 1;
  hurt.autoPlayStep();
  assert.equal(hurt.trainerFights, 0, 'not with a hurt lead');

  const beaten = autoGame(ready);
  beaten.trainersBeaten = [0];
  beaten.autoPlayStep();
  assert.equal(beaten.trainerFights, 0, 'not once beaten');

  const retry = autoGame(ready);
  retry.trainerRetryLevel[0] = ready + 2;
  retry.autoPlayStep();
  assert.equal(retry.trainerFights, 0, 'not straight after a loss');
});

test('the trainer never gets in the way of the guardian', () => {
  const game = autoGame(GUARDIAN_LEVELS[0]);       // ready for both
  game.autoPlayStep();
  assert.equal(game.guardianFights, 1);
  assert.equal(game.trainerFights, 0);
});

test("autoplay keeps attacking a trainer's weak CodeMon instead of throwing a ball", () => {
  const game = makeGame();
  Object.assign(game, { autoPlay: true, currentView: 'battle' });
  game.challengeTrainer();
  const enemy = game.battle.enemyCodemon;
  enemy.currentHp = 1;
  const balls = game.player.items.pokeball;
  // The coin flip that would throw a ball, rigged to say yes.
  vm.runInContext('globalThis.realRandom = Math.random; Math.random = () => 0', ctx);
  try {
    game.autoPlayStep();
  } finally {
    vm.runInContext('Math.random = realRandom', ctx);
  }
  assert.equal(game.player.items.pokeball, balls);
  assert.ok(game.battle.events.length > 0, 'it attacked instead of wasting the turn');
});

test('sendOutEnemy swaps the foe and resets what belonged to the old one', () => {
  const me = new Codemon(CODEMON_SPECIES[0], 10);
  const b = new BattleState(me, new Codemon(CODEMON_SPECIES[1], 10));
  b.defBoost.enemy = 2.5;
  b.battleOver = true; b.playerWon = true; b.winner = 'player';
  const next = new Codemon(CODEMON_SPECIES[2], 12);
  b.sendOutEnemy(next);
  assert.equal(b.enemyCodemon, next);
  assert.equal(b.enemySpeed, next.stats.spd);
  assert.equal(b.defBoost.enemy, 1);
  assert.equal(b.battleOver, false);
  assert.equal(b.playerWon, false);
  assert.equal(b.winner, null);
  assert.equal(b.defBoost.player, 1, "the player's side is left alone");
});
