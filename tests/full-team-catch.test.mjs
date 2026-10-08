// Throwing a ball with a full team. Run with: node --test tests/*.test.mjs
// A team holds 6 and there is nowhere else to keep a catch, so a 7th used to be
// "caught", paid 30 gold for, and silently thrown away along with the ball.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {
  window: { addEventListener() {} }, setTimeout: () => 0, playSound() {},
  // Just enough page for showCatchOptions to fill in the catch window.
  document: { getElementById: () => ({ innerHTML: '' }) }, SPRITES: { imgFor: () => '' },
};
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.Player = Player;' +
  '\nthis.BattleState = BattleState; this.CodemonGame = CodemonGame; Math.random = () => 0;', ctx);
const { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame } = ctx;

/** A wild fight with `size` CodeMon on the team and one ball, where every throw lands. */
function wildFight(size) {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.items.pokeball = 1;
  for (let i = 0; i < size; i++) game.player.team.push(new Codemon(CODEMON_SPECIES[i], 10));
  game.battle = new BattleState(game.player.team[0], new Codemon(CODEMON_SPECIES[9], 5));
  const seen = { status: [], modal: false, ended: false };
  game.setStatus = (s) => seen.status.push(s);
  game.catchModal = { classList: { add() {}, remove() { seen.modal = true; } } };
  game.endBattle = () => { seen.ended = true; };
  for (const m of ['updateBattleUI', 'checkBattleStatus']) game[m] = () => {};
  return { game, seen };
}

test('a full team keeps its ball and the fight goes on', () => {
  const { game, seen } = wildFight(6);
  const gold = game.player.gold;
  game.confirmCatch();
  assert.equal(game.player.items.pokeball, 1);
  assert.equal(game.player.team.length, 6);
  assert.equal(game.player.gold, gold);
  assert.equal(game.battle.battleOver, false);
  assert.equal(seen.ended, false);
  assert.match(seen.status.at(-1), /team is full/);
});

test('a full team is told before the catch window opens', () => {
  const { game, seen } = wildFight(6);
  game.showCatchOptions();
  assert.equal(seen.modal, false);
  assert.match(seen.status.at(-1), /team is full/);
});

test('with room on the team the catch joins it', () => {
  const { game, seen } = wildFight(5);
  game.confirmCatch();
  assert.equal(game.player.team.length, 6);
  assert.equal(game.player.items.pokeball, 0);
  assert.equal(seen.ended, true);
});
