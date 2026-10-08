// Turn order after the player's CodeMon changes mid-fight. Run with:
// node --test tests/*.test.mjs
// Each test starts with a slow lead against a middling enemy, then brings in
// a fast CodeMon. The fast one should move first.
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

const withSpeed = (i, spd) => { const c = new Codemon(CODEMON_SPECIES[i], 10); c.stats.spd = spd; return c; };

/** A game mid-fight: slow lead (speed 5), fast bench (speed 50), enemy speed 20. */
function gameInFight() {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.team.push(withSpeed(0, 5), withSpeed(1, 50));
  game.battle = new BattleState(game.player.team[0], withSpeed(5, 20));
  game.battle.enemyTurn = () => {};   // keep the fast one alive and the fight on
  game.moveSelectModal = { classList: { remove() {} } };
  for (const m of ['updateBattleUI', 'setStatus', 'updateTeamUI', 'updateStats',
                   'closeMoveModal', 'checkBattleStatus']) game[m] = () => {};
  return game;
}

test('the slow lead moves second', () => {
  assert.equal(gameInFight().battle.determineOrder(), 'enemy');
});

test('after the lead faints, the CodeMon sent in moves at its own speed', () => {
  const game = gameInFight();
  const fast = game.player.team[1];
  delete game.checkBattleStatus;   // the real one handles the faint
  game.battle.playerCodemon.currentHp = 0;
  game.battle.battleOver = true;
  game.battle.winner = 'enemy';
  game.checkBattleStatus();
  assert.equal(game.battle.playerCodemon, fast);
  assert.equal(game.battle.determineOrder(), 'player');
});

test('switching from the team menu uses the new CodeMon\'s speed', () => {
  const game = gameInFight();
  buttons.length = 0;
  game.showSwitchTeam();
  buttons[1].click();
  assert.equal(game.battle.playerCodemon.stats.spd, 50);
  assert.equal(game.battle.determineOrder(), 'player');
});

test('BattleState.playerSwitch uses the new CodeMon\'s speed', () => {
  const game = gameInFight();
  game.battle.playerSwitch(game.player.team[1]);
  assert.equal(game.battle.determineOrder(), 'player');
});
