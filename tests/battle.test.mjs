// Battle rule checks. Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };   // creatures.js also hangs its classes off window
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.BattleState = BattleState;', ctx);
const { CODEMON_SPECIES, Codemon, BattleState } = ctx;

const finishedFight = () => {
  const battle = new BattleState(new Codemon(CODEMON_SPECIES[0], 10), new Codemon(CODEMON_SPECIES[1], 10));
  battle.battleOver = true;
  battle.winner = 'player';
  return battle;
};

test('once a fight is over, every action is refused and nothing changes', () => {
  const battle = finishedFight();
  const hp = [battle.playerCodemon.currentHp, battle.enemyCodemon.currentHp];
  const logLength = battle.log.length;
  const move = battle.playerCodemon.moves[0];

  assert.equal(battle.playerAttack(move), false);
  assert.equal(battle.attemptCatch('pokeball'), false);
  assert.equal(battle.flee(), false);
  battle.playerUsePotion(20);
  battle.playerSwitch(new Codemon(CODEMON_SPECIES[2], 10));

  assert.deepEqual([battle.playerCodemon.currentHp, battle.enemyCodemon.currentHp], hp);
  assert.equal(battle.playerCodemon.species.id, CODEMON_SPECIES[0].id, 'no switch');
  assert.equal(battle.log.length, logLength, 'nothing logged');
  assert.equal(battle.winner, 'player', 'result unchanged');
});

test('a fight in progress still takes actions', () => {
  const battle = new BattleState(new Codemon(CODEMON_SPECIES[0], 10), new Codemon(CODEMON_SPECIES[1], 10));
  assert.equal(battle.playerAttack(battle.playerCodemon.moves[0]), true);
  assert.ok(battle.log.length > 0);
});
