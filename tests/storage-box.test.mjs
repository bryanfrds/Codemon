// The storage box: where catches go once the team holds 6. Run with: node --test tests/*.test.mjs
// Before it, a full team couldn't catch at all (and before #22 a 7th catch was
// paid for and silently thrown away).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const store = new Map();
const ctx = {
  window: { addEventListener() {} }, setTimeout: () => 0, playSound() {},
  document: { getElementById: () => ({ innerHTML: '' }) }, SPRITES: { imgFor: () => '' },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.Player = Player;' +
  '\nthis.BattleState = BattleState; this.CodemonGame = CodemonGame; this.BOX_SIZE = BOX_SIZE;' +
  '\nthis.SAVE_KEY = SAVE_KEY; Math.random = () => 0;', ctx);
const { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame, BOX_SIZE, SAVE_KEY } = ctx;

const mon = (i, level = 10) => new Codemon(CODEMON_SPECIES[i % CODEMON_SPECIES.length], level);
const fainted = (c) => { c.currentHp = 0; return c; };

/** A player with `team` CodeMon on the team and `box` in the box. */
function player(team, box = 0) {
  const p = new Player();
  for (let i = 0; i < team; i++) p.team.push(mon(i));
  for (let i = 0; i < box; i++) p.box.push(mon(i + 6));
  return p;
}

// --- Player: where a catch goes ----------------------------------------------

test('a catch joins the team while it has room', () => {
  const p = player(5);
  assert.equal(p.addCodemon(mon(20)), 'team');
  assert.equal(p.team.length, 6);
  assert.equal(p.box.length, 0);
});

test('with a full team, a catch goes to the box and still counts in the Pokedex', () => {
  const p = player(6);
  const caught = mon(20);
  assert.equal(p.addCodemon(caught), 'box');
  assert.equal(p.team.length, 6);
  assert.equal(p.box.length, 1);
  assert.equal(p.box[0], caught);
  assert.ok(p.pokedex.has(caught.species.id));
});

test('with the team and the box both full, a catch is refused', () => {
  const p = player(6, BOX_SIZE);
  assert.equal(p.hasRoom(), false);
  assert.equal(p.addCodemon(mon(20)), false);
  assert.equal(p.box.length, BOX_SIZE);
});

// --- Player: moving CodeMon between team and box -----------------------------

test('taking one out of the box fills a free team slot', () => {
  const p = player(3, 2);
  const taken = p.box[1];
  assert.equal(p.withdrawFromBox(1), true);
  assert.equal(p.team.length, 4);
  assert.equal(p.team[3], taken);
  assert.equal(p.box.length, 1);
});

test('nothing comes out of the box onto a full team', () => {
  const p = player(6, 1);
  assert.equal(p.withdrawFromBox(0), false);
  assert.equal(p.team.length, 6);
  assert.equal(p.box.length, 1);
});

test('a team member can be stored, but never the last one', () => {
  const p = player(2);
  const stored = p.team[1];
  assert.equal(p.depositToBox(1), true);
  assert.deepEqual([p.team.length, p.box.length], [1, 1]);
  assert.equal(p.box[0], stored);
  assert.equal(p.depositToBox(0), false);   // the team can't be left empty
  assert.equal(p.team.length, 1);
});

test('storing is refused when the box is full', () => {
  const p = player(3, BOX_SIZE);
  assert.equal(p.depositToBox(1), false);
  assert.equal(p.team.length, 3);
});

test('the team always keeps one CodeMon that can fight', () => {
  const p = player(2);
  fainted(p.team[1]);
  assert.equal(p.depositToBox(0), false);   // would leave only a fainted one
  assert.equal(p.depositToBox(1), true);    // storing the fainted one is fine
  const q = player(1, 1);
  fainted(q.box[0]);
  assert.equal(q.swapWithBox(0, 0), false); // swapping in a fainted one for the only fighter
  assert.equal(q.team[0].currentHp > 0, true);
});

test('a swap puts the stored CodeMon in the team member\'s place', () => {
  const p = player(6, 2);
  const out = p.team[3], into = p.box[1];
  assert.equal(p.swapWithBox(3, 1), true);
  assert.equal(p.team[3], into);
  assert.equal(p.box[1], out);
  assert.deepEqual([p.team.length, p.box.length], [6, 2]);
});

test('the leader is always one that can fight, since battles send out the first', () => {
  const p = player(3, 1);
  fainted(p.team[1]);
  fainted(p.box[0]);
  const second = p.team[2];
  assert.equal(p.swapWithBox(0, 0), true);  // the healthy leader goes in, a fainted one comes out
  assert.equal(p.team[0], second);
  assert.ok(p.team[0].currentHp > 0);
});

test('a fighter taken out of the box leads a team that has none', () => {
  const p = player(1, 1);
  fainted(p.team[0]);
  const fighter = p.box[0];
  assert.equal(p.withdrawFromBox(0), true);
  assert.equal(p.team[0], fighter);
});

test('bad indexes change nothing', () => {
  const p = player(3, 1);
  for (const [a, b] of [[-1, 0], [3, 0], [0, 1], [0, -1], [1.5, 0]]) {
    assert.equal(p.swapWithBox(a, b), false);
  }
  assert.equal(p.withdrawFromBox(5), false);
  assert.equal(p.depositToBox(7), false);
  assert.deepEqual([p.team.length, p.box.length], [3, 1]);
});

// --- Catching in a fight -----------------------------------------------------

/** A wild fight with a team of `size`, `boxed` in the box, and one ball; every throw lands. */
function wildFight(size, boxed = 0) {
  const game = Object.create(CodemonGame.prototype);
  game.player = player(size, boxed);
  game.player.items.pokeball = 1;
  game.battle = new BattleState(game.player.team[0], mon(9, 5));
  const seen = { status: [], modal: false, ended: false };
  game.setStatus = (s) => seen.status.push(s);
  game.catchModal = { classList: { add() {}, remove() { seen.modal = true; } } };
  game.endBattle = () => { seen.ended = true; game.battle = null; };
  for (const m of ['updateBattleUI', 'checkBattleStatus']) game[m] = () => {};
  return { game, seen };
}

test('a full team can catch again: the catch goes to the box and says so', () => {
  const { game, seen } = wildFight(6);
  const gold = game.player.gold;
  game.showCatchOptions();
  assert.equal(seen.modal, true);
  game.confirmCatch();
  assert.equal(game.player.items.pokeball, 0);
  assert.equal(game.player.team.length, 6);
  assert.equal(game.player.box.length, 1);
  assert.equal(game.player.gold, gold + 30);
  assert.equal(seen.ended, true);
  assert.match(seen.status.at(-1), /sent to the box \(1\/30\)/);
});

test('with the team and the box full, the ball is kept and the fight goes on', () => {
  const { game, seen } = wildFight(6, BOX_SIZE);
  game.showCatchOptions();
  assert.equal(seen.modal, false);
  game.confirmCatch();
  assert.equal(game.player.items.pokeball, 1);
  assert.equal(game.player.box.length, BOX_SIZE);
  assert.equal(seen.ended, false);
  assert.match(seen.status.at(-1), /team and your box are full/);
});

// --- Opening the box ---------------------------------------------------------

test('the box stays shut during a fight', () => {
  const { game, seen } = wildFight(6, 1);
  let opened = false;
  game.renderBox = () => { opened = true; };
  game.openBox();
  assert.equal(opened, false);
  assert.match(seen.status.at(-1), /Finish the fight/);
});

// --- Saving and loading ------------------------------------------------------

/** A game ready to save and load, with no page around it. */
function savable(team, box) {
  const game = Object.create(CodemonGame.prototype);
  game.player = player(team, box);
  game.battle = null;
  game.currentArea = 0;
  game.guardiansBeaten = [];
  game.trainersBeaten = [];
  game.updateAreaButtons = () => {};
  game.changeArea = () => {};
  return game;
}

test('the box is saved and comes back on load', () => {
  store.clear();
  const game = savable(6, 3);
  game.player.box[1].level = 12;
  game.saveGame();
  const again = savable(1, 0);
  assert.equal(again.loadGame(), true);
  assert.deepEqual(Array.from(again.player.box, c => c.species.id), Array.from(game.player.box, c => c.species.id));
  assert.equal(again.player.box[1].level, 12);
  for (const c of again.player.box) assert.ok(again.player.pokedex.has(c.species.id));
});

test('a save from before the box loads with an empty box', () => {
  store.clear();
  const game = savable(2, 0);
  game.saveGame();
  const data = JSON.parse(store.get(SAVE_KEY));
  delete data.box;
  store.set(SAVE_KEY, JSON.stringify(data));
  const again = savable(1, 4);
  assert.equal(again.loadGame(), true);
  assert.equal(again.player.box.length, 0);
  assert.equal(again.player.team.length, 2);
});

test('a broken box in a save drops the bad entries and never overfills', () => {
  store.clear();
  const game = savable(2, 0);
  game.saveGame();
  const data = JSON.parse(store.get(SAVE_KEY));
  const good = { species: CODEMON_SPECIES[3].id, level: 7, exp: 0, expToLevel: 1, hp: 5 };
  data.box = [good, null, { species: 'nope', level: 3 }, { ...good, level: 0 },
    ...Array.from({ length: BOX_SIZE + 5 }, () => good)];
  store.set(SAVE_KEY, JSON.stringify(data));
  const again = savable(1, 0);
  assert.equal(again.loadGame(), true);
  assert.equal(again.player.box.length, BOX_SIZE);
  assert.equal(again.player.box[0].level, 7);
  // Not an array at all is the same as no box.
  data.box = 'lots';
  store.set(SAVE_KEY, JSON.stringify(data));
  const third = savable(1, 2);
  assert.equal(third.loadGame(), true);
  assert.equal(third.player.box.length, 0);
});
