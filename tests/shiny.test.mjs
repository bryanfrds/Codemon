// Shiny CodeMon checks. Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const timers = [];
const fake = () => ({ textContent: '', title: '', classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
const ctx = { window: { addEventListener() {} }, setTimeout: () => 0,
              document: { getElementById: () => fake(), querySelectorAll: () => [] },
              localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } } };
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nObject.assign(this, { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame, rollShiny, evolutionFor, withFilter });', ctx);
const { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame, rollShiny, evolutionFor, withFilter } = ctx;

test('about 1 wild CodeMon in 64 is shiny', () => {
  assert.equal(rollShiny(0), true);
  assert.equal(rollShiny(1 / 64 - 1e-9), true);
  assert.equal(rollShiny(1 / 64), false);
  assert.equal(rollShiny(0.5), false);
});

test('a new CodeMon is not shiny, and evolving keeps it shiny', () => {
  const c = new Codemon(CODEMON_SPECIES[0], 16);
  assert.equal(c.shiny, false);
  c.shiny = true;
  c.evolveInto(evolutionFor(c.species, 16));
  assert.equal(c.shiny, true);
});

function gameCatching(shiny) {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.team.push(new Codemon(CODEMON_SPECIES[0], 10));
  const wild = new Codemon(CODEMON_SPECIES[5], 10);
  wild.shiny = shiny;
  game.battle = new BattleState(game.player.team[0], wild);
  for (const m of ['updateBattleUI', 'setStatus', 'updateTeamUI', 'updateStats', 'closeCatchModal', 'endBattle'])
    game[m] = () => {};
  game.battle.calculateCatchProbability = () => 100;   // a sure catch
  return game;
}

test('catching a shiny gives you a shiny', () => {
  const game = gameCatching(true);
  game.confirmCatch();
  assert.equal(game.player.team.length, 2);
  assert.equal(game.player.team[1].shiny, true);
  assert.match(game.battle.log.at(-1), /shiny/);
});

test('catching a normal one gives you a normal one', () => {
  const game = gameCatching(false);
  game.confirmCatch();
  assert.equal(game.player.team[1].shiny, false);
});

test('canvas filters combine, skipping empty ones', () => {
  assert.equal(withFilter('none', ''), 'none');
  assert.equal(withFilter('brightness(2)', ''), 'brightness(2)');
  assert.equal(withFilter('none', 'hue-rotate(1deg)'), 'hue-rotate(1deg)');
  assert.equal(withFilter('a(1)', 'b(2)'), 'a(1) b(2)');
});

test('shinies stay shiny through a save and load, and only true counts', () => {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  const a = new Codemon(CODEMON_SPECIES[0], 10); a.shiny = true;
  const b = new Codemon(CODEMON_SPECIES[1], 10);
  game.player.team.push(a, b);
  Object.assign(game, { currentArea: 0, guardiansBeaten: [], guardianRetryLevel: {} });
  game.saveGame();
  const saved = JSON.parse(ctx.localStorage.getItem('codemonSave'));
  saved.team.push({ ...saved.team[1], shiny: 'yes' });     // a hand-edited "shiny"
  ctx.localStorage.setItem('codemonSave', JSON.stringify(saved));
  const again = Object.create(CodemonGame.prototype);
  again.player = new Player();
  Object.assign(again, { currentArea: 0, guardiansBeaten: [], guardianRetryLevel: {} });
  for (const m of ['setStatus', 'updateTeamUI', 'updateStats', 'saveGame', 'updateAreaButtons']) again[m] = () => {};
  assert.ok(again.loadGame());
  assert.deepEqual([...again.player.team.map(c => c.shiny)], [true, false, false]);
});
