// How a finished fight is settled (game.js checkBattleStatus). Run with:
// node --test tests/*.test.mjs
// game.js is page code, so it runs here against a stub window and a fake
// setTimeout that collects timers, on a game object whose screen-drawing
// methods are switched off. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const timers = [];
const ctx = {
  window: { addEventListener() {} },
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
};
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.Player = Player;' +
  '\nthis.BattleState = BattleState; this.CodemonGame = CodemonGame;', ctx);
const { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame } = ctx;

/** A game with a fight on, nothing drawn, and endings counted. */
function gameInFight(teamSize = 1) {
  timers.length = 0;
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  for (let i = 0; i < teamSize; i++) game.player.team.push(new Codemon(CODEMON_SPECIES[i], 10));
  game.battle = new BattleState(game.player.team[0], new Codemon(CODEMON_SPECIES[5], 10));
  game.ended = 0;
  game.blackedOut = 0;
  for (const m of ['updateBattleUI', 'setStatus', 'updateTeamUI', 'updateStats']) game[m] = () => {};
  game.endBattle = () => { game.ended++; game.battle = null; };
  game.blackOut = () => { game.blackedOut++; };
  return game;
}

test('a win pays out once however many times it is checked', () => {
  const game = gameInFight();
  game.battle.battleOver = true;
  game.battle.playerWon = true;
  const gold = game.player.gold;
  game.checkBattleStatus();
  game.checkBattleStatus();
  game.checkBattleStatus();
  assert.equal(game.player.gold, gold + 50);
  assert.equal(timers.length, 1, 'one ending scheduled');
  timers[0]();
  assert.equal(game.ended, 1);
});

test('a loss blacks out once however many times it is checked', () => {
  const game = gameInFight();
  game.player.team[0].currentHp = 0;
  game.battle.battleOver = true;
  game.battle.playerWon = false;
  game.checkBattleStatus();
  game.checkBattleStatus();
  assert.equal(timers.length, 1);
  timers[0]();
  assert.deepEqual([game.ended, game.blackedOut], [1, 1]);
});

test('a faint with a backup left switches in the backup and keeps the fight going', () => {
  const game = gameInFight(2);
  const backup = game.player.team[1];
  game.player.team[0].currentHp = 0;
  game.battle.battleOver = true;
  game.battle.playerWon = false;
  game.checkBattleStatus();
  assert.equal(timers.length, 0, 'no ending scheduled');
  assert.equal(game.battleActive(), true);
  assert.equal(game.battle.playerCodemon, backup);
});

test("an ending timer leaves alone a fight that isn't the one it was set for", () => {
  const game = gameInFight();
  game.player.team[0].currentHp = 0;
  game.battle.battleOver = true;
  game.checkBattleStatus();
  game.battle = new BattleState(game.player.team[0], new Codemon(CODEMON_SPECIES[6], 10));
  timers[0]();
  assert.deepEqual([game.ended, game.blackedOut], [0, 0]);
});

test('no new fight can start during the pause, so the blackout still happens', () => {
  const game = gameInFight();
  game.player.team[0].currentHp = 0;
  game.battle.battleOver = true;
  game.checkBattleStatus();
  const lost = game.battle;
  game.startEncounter();
  assert.equal(game.battle, lost, 'still the lost fight');
  timers[0]();
  assert.equal(game.blackedOut, 1);
});
