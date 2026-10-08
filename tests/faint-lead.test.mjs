// When the lead faints, the CodeMon sent in should become the lead, so
// everything that asks for "the active CodeMon" sees the one actually fighting.
// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: { addEventListener() {} }, setTimeout: () => 0, document: {} };
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.Player = Player;' +
  '\nthis.BattleState = BattleState; this.CodemonGame = CodemonGame;', ctx);
const { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame } = ctx;

/** A fight where the lead has just fainted, with a fainted and a healthy backup. */
function leadJustFainted() {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  const [lead, down, fresh] = [0, 1, 2].map(i => new Codemon(CODEMON_SPECIES[i], 10));
  down.currentHp = 0;
  game.player.team.push(lead, down, fresh);
  game.battle = new BattleState(lead, new Codemon(CODEMON_SPECIES[5], 10));
  for (const m of ['updateBattleUI', 'setStatus', 'updateTeamUI', 'updateStats']) game[m] = () => {};
  lead.currentHp = 0;
  game.battle.battleOver = true;
  game.battle.winner = 'enemy';
  return { game, lead, fresh };
}

test('the CodeMon sent in after a faint becomes the lead', () => {
  const { game, fresh } = leadJustFainted();
  game.checkBattleStatus();
  assert.equal(game.battle.playerCodemon, fresh);
  assert.equal(game.player.getActiveCodemon(), fresh);
});

test('the fainted lead stays on the team', () => {
  const { game, lead } = leadJustFainted();
  game.checkBattleStatus();
  assert.equal(game.player.team.length, 3);
  assert.ok(game.player.team.includes(lead));
});
