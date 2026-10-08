// Harden's defence boost belongs to the CodeMon that used it. Run with:
// node --test tests/*.test.mjs
// Each test hardens the lead twice, then brings in another CodeMon, which
// should start with no boost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const buttons = [];
const ctx = {
  window: { addEventListener() {} },
  setTimeout: () => 0,
  // Just enough page for showSwitchTeam to build its buttons.
  document: {
    getElementById: () => ({ innerHTML: '', appendChild(b) { buttons.push(b); } }),
    createElement: () => ({ addEventListener(_, fn) { this.click = fn; } }),
  },
};
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.Player = Player;' +
  '\nthis.BattleState = BattleState; this.CodemonGame = CodemonGame;', ctx);
const { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame } = ctx;

/** A game mid-fight whose lead has used Harden twice. */
function hardenedFight() {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.team.push(new Codemon(CODEMON_SPECIES[0], 10), new Codemon(CODEMON_SPECIES[1], 10));
  game.battle = new BattleState(game.player.team[0], new Codemon(CODEMON_SPECIES[5], 10));
  game.battle.defBoost.player = 1.25 * 1.25;
  game.battle.enemyTurn = () => {};
  game.moveSelectModal = { classList: { remove() {} } };
  for (const m of ['updateBattleUI', 'setStatus', 'updateTeamUI', 'updateStats',
                   'closeMoveModal', 'checkBattleStatus']) game[m] = () => {};
  return game;
}

test('the hardened lead keeps its boost while it stays in', () => {
  assert.equal(hardenedFight().battle.defBoost.player, 1.5625);
});

test('the CodeMon sent in after a faint starts without the boost', () => {
  const game = hardenedFight();
  delete game.checkBattleStatus;   // the real one handles the faint
  game.battle.playerCodemon.currentHp = 0;
  game.battle.battleOver = true;
  game.battle.winner = 'enemy';
  game.checkBattleStatus();
  assert.equal(game.battle.playerCodemon, game.player.team[1]);
  assert.equal(game.battle.defBoost.player, 1);
});

test('switching from the team menu drops the boost', () => {
  const game = hardenedFight();
  const bench = game.player.team[1];
  buttons.length = 0;
  game.showSwitchTeam();
  buttons[1].click();   // the switch also moves it to the front of the team
  assert.equal(game.battle.playerCodemon, bench);
  assert.equal(game.battle.defBoost.player, 1);
});

test('BattleState.playerSwitch drops the boost', () => {
  const game = hardenedFight();
  game.battle.playerSwitch(game.player.team[1]);
  assert.equal(game.battle.defBoost.player, 1);
});

test('the enemy\'s boost is untouched by the player switching', () => {
  const game = hardenedFight();
  game.battle.defBoost.enemy = 1.25;
  game.battle.playerSwitch(game.player.team[1]);
  assert.equal(game.battle.defBoost.enemy, 1.25);
});
