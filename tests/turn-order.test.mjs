// Who moves first in a round. Run with: node --test tests/*.test.mjs
// The faster CodeMon should strike first; until now the player always did,
// whatever the speeds, so speed only ever affected running away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };   // creatures.js also hangs its classes off window
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.BattleState = BattleState;' +
  '\nthis.MOVE_POOL = MOVE_POOL; Math.random = () => 0;', ctx);   // every move hits
const { CODEMON_SPECIES, Codemon, BattleState, MOVE_POOL } = ctx;

const attack = (c) => c.moves.find(m => MOVE_POOL[m] && MOVE_POOL[m].power > 0);

/** A fight between two CodeMon with the given speeds, each knowing only a damaging move. */
function fight(playerSpd, enemySpd) {
  const player = new Codemon(CODEMON_SPECIES[0], 10);
  const enemy = new Codemon(CODEMON_SPECIES[1], 10);
  player.moves = [attack(player)];
  enemy.moves = [attack(enemy)];
  player.stats.spd = playerSpd;
  enemy.stats.spd = enemySpd;
  return new BattleState(player, enemy);
}

// Array.from, so the result is an array of this realm and deepEqual can compare it.
const order = (battle) => Array.from(battle.events, e => e.side);

test('a faster foe strikes first', () => {
  const battle = fight(5, 50);
  battle.playerAttack(battle.playerCodemon.moves[0]);
  assert.deepEqual(order(battle), ['enemy', 'player']);
});

test('a faster player strikes first', () => {
  const battle = fight(50, 5);
  battle.playerAttack(battle.playerCodemon.moves[0]);
  assert.deepEqual(order(battle), ['player', 'enemy']);
});

test('on equal speed the player goes first', () => {
  const battle = fight(20, 20);
  battle.playerAttack(battle.playerCodemon.moves[0]);
  assert.deepEqual(order(battle), ['player', 'enemy']);
});

test('knocked out by a faster foe, your move never lands', () => {
  const battle = fight(5, 50);
  battle.playerCodemon.currentHp = 1;
  const enemyHp = battle.enemyCodemon.currentHp;
  assert.equal(battle.playerAttack(battle.playerCodemon.moves[0]), true);
  assert.deepEqual(order(battle), ['enemy']);
  assert.equal(battle.enemyCodemon.currentHp, enemyHp);
  assert.equal(battle.winner, 'enemy');
  assert.equal(battle.battleOver, true);
});

test('a faster foe knocked out by your hit does not strike again', () => {
  const battle = fight(5, 50);
  battle.enemyCodemon.currentHp = 1;
  battle.playerAttack(battle.playerCodemon.moves[0]);
  assert.deepEqual(order(battle), ['enemy', 'player']);
  assert.equal(battle.winner, 'player');
});
