// Area guardian checks: the rules in creatures.js and how game.js uses them.
// Run with: node --test tests/*.test.mjs
// game.js runs against stand-in page objects (see fakeElement), with drawing off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fakeElement() {
  const classes = new Set();
  return { textContent: '', title: '',
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
  ' GUARDIAN_LEVELS, GUARDIAN_GOLD, guardianSpecies, isAreaOpen, EVOLUTION_STAGE });', ctx);
const { CODEMON_SPECIES, Codemon, Player, CodemonGame, AREAS, GUARDIAN_LEVELS, GUARDIAN_GOLD,
        guardianSpecies, isAreaOpen, EVOLUTION_STAGE } = ctx;

/** A game with a level-`level` starter, nothing drawn, and the status recorded. */
function makeGame(level = 50) {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.team.push(new Codemon(CODEMON_SPECIES[0], level));
  game.currentArea = 0;
  game.guardiansBeaten = [];
  game.status = '';
  game.setStatus = (m) => { game.status = m; };
  for (const m of ['updateBattleUI', 'updateTeamUI', 'updateStats', 'switchView', 'saveGame']) game[m] = () => {};
  game.endBattle = () => { game.battle = null; };
  // For autoplay's wandering, which these tests don't look at.
  game.playerPos = { x: 250, y: 200 };
  game.playerTarget = { x: 250, y: 200 };
  game.startEncounter = () => {};
  game.canWalk = () => true;
  return game;
}

test("every area's guardian comes from that area's wild CodeMon, and they get tougher", () => {
  let lastLevel = 0;
  AREAS.forEach((area, i) => {
    const ids = area.possibleEncounters;
    const sp = guardianSpecies(ids[0], ids[ids.length - 1]);
    assert.ok(sp && ids.includes(sp.id), `area ${i}`);
    assert.ok(GUARDIAN_LEVELS[i] > lastLevel);
    lastLevel = GUARDIAN_LEVELS[i];
  });
  // The first area has no final stages, so its guardian is a middle one.
  const first = AREAS[0].possibleEncounters;
  assert.equal(EVOLUTION_STAGE.get(guardianSpecies(first[0], first.at(-1)).id), 1);
});

test('only the first area is open until its guardian is beaten', () => {
  assert.equal(isAreaOpen([], 0), true);
  assert.equal(isAreaOpen([], 1), false);
  assert.equal(isAreaOpen([0], 1), true);
  assert.equal(isAreaOpen([0], 2), false);
});

test("you can't walk into a locked area", () => {
  const game = makeGame();
  game.changeArea(1);
  assert.equal(game.currentArea, 0);
  assert.match(game.status, /Locked/);
});

test('a guardian is tougher than a wild CodeMon, and cannot be caught or fled from', () => {
  const game = makeGame();
  game.challengeGuardian();
  const g = game.battle.enemyCodemon;
  assert.equal(game.battle.guardian, true);
  assert.equal(g.level, GUARDIAN_LEVELS[0]);
  assert.ok(g.hp > new Codemon(g.species, g.level).hp);
  const balls = game.player.items.pokeball;
  game.confirmCatch();
  game.attemptFlee();
  assert.ok(game.battle, 'still fighting');
  assert.equal(game.player.items.pokeball, balls, 'no ball thrown');
});

test('beating the guardian opens the next area and pays out', () => {
  const game = makeGame();
  game.challengeGuardian();
  const gold = game.player.gold;
  game.battle.enemyCodemon.currentHp = 0;
  game.battle.battleOver = true;
  game.battle.playerWon = true;
  game.checkBattleStatus();
  assert.deepEqual([...game.guardiansBeaten], [0]);
  assert.equal(game.player.gold, gold + 50 + GUARDIAN_GOLD);
  assert.match(game.status, /Stack Overflow Hills is open/);
  assert.equal(areaButtons[1].classList.contains('locked'), false);
  game.battle = null;
  game.changeArea(1);
  assert.equal(game.currentArea, 1);
});

test('the guardian button does nothing once that guardian is beaten', () => {
  const game = makeGame();
  game.guardiansBeaten = [0];
  game.challengeGuardian();
  assert.equal(game.battle, undefined);
});

test('autoplay takes on the guardian at its level, then moves to the opened area', () => {
  const low = makeGame(GUARDIAN_LEVELS[0] - 1);
  low.autoPlay = true;
  low.fxBusy = () => false;
  low.currentView = 'exploration';
  low.challengeGuardian = () => { low.challenged = true; };
  low.player.items.potion = 5; low.player.items.pokeball = 5;
  low.autoPlayStep();
  assert.equal(low.challenged, undefined, 'too low a level');

  const ready = makeGame(GUARDIAN_LEVELS[0]);
  Object.assign(ready, { autoPlay: true, fxBusy: () => false, currentView: 'exploration' });
  ready.challengeGuardian = () => { ready.challenged = true; };
  ready.autoPlayStep();
  assert.equal(ready.challenged, true);

  ready.guardiansBeaten = [0];
  ready.changeArea = (a) => { ready.movedTo = a; };
  ready.autoPlayStep();
  assert.equal(ready.movedTo, 1);
});

const saveWith = (extra) => ctx.localStorage.setItem('codemonSave', JSON.stringify({
  v: 1, gold: 10, items: {}, pokedex: [1],
  team: [{ species: 1, level: 20, exp: 0, expToLevel: 60, hp: 30 }], ...extra }));

test('beaten guardians are saved and loaded, and junk in the list is dropped', () => {
  const game = makeGame();
  saveWith({ area: 1, guardiansBeaten: [0, 'x', 9, 0, -1, 1.5] });
  assert.ok(game.loadGame());
  assert.deepEqual([...game.guardiansBeaten], [0]);
  assert.equal(game.currentArea, 1);
});

test("a save from before guardians keeps the areas it already reached", () => {
  const game = makeGame();
  saveWith({ area: 2 });                           // no guardiansBeaten at all
  assert.ok(game.loadGame());
  assert.deepEqual([...game.guardiansBeaten], [0, 1]);
  assert.equal(game.currentArea, 2);
});

test('a save sitting in a locked area starts back in the first one', () => {
  const game = makeGame();
  saveWith({ area: 3, guardiansBeaten: [] });
  assert.ok(game.loadGame());
  assert.equal(game.currentArea, 0);
});

test('saving writes the beaten guardians', () => {
  const game = makeGame();
  game.guardiansBeaten = [0, 1];
  game.currentArea = 2;
  CodemonGame.prototype.saveGame.call(game);
  assert.deepEqual(JSON.parse(ctx.localStorage.getItem('codemonSave')).guardiansBeaten, [0, 1]);
});

test("autoplay keeps attacking a weak guardian instead of trying to catch it", () => {
  const game = makeGame();
  Object.assign(game, { autoPlay: true, fxBusy: () => false, wiped: false });
  game.challengeGuardian();
  const g = game.battle.enemyCodemon;
  g.currentHp = Math.ceil(g.hp * 0.3);           // weak enough that a wild one would get a ball
  // Rolls that would always choose to throw a ball at a wild CodeMon.
  const realRandom = vm.runInContext('Math.random', ctx);
  vm.runInContext('Math.random = () => 0.1', ctx);
  try {
    for (let i = 0; i < 20 && game.battle && !game.battle.battleOver; i++) game.autoPlayStep();
  } finally { ctx.r = realRandom; vm.runInContext('Math.random = r', ctx); }
  assert.ok(!game.battle || game.battle.battleOver || g.currentHp < Math.ceil(g.hp * 0.3),
            'it should have hit the guardian');
});
