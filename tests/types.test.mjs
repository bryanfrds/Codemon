// Type chart checks. Run with: node --test tests/*.test.mjs
// creatures.js is a plain browser script, so load it into a sandbox and read
// the functions off that, rather than turning the game into modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };   // creatures.js also hangs its classes off window
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') +
  '\nthis.typeEffectiveness = typeEffectiveness; this.TYPE_CYCLE = TYPE_CYCLE;' +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.MOVE_POOL = MOVE_POOL;' +
  '\nthis.Codemon = Codemon; this.BattleState = BattleState;', ctx);
const { typeEffectiveness, TYPE_CYCLE, CODEMON_SPECIES, MOVE_POOL, Codemon, BattleState } = ctx;

// Written out here rather than read from TYPE_CYCLE, so reordering the chart
// in the game (which would flip every matchup the README describes) fails.
const BEATS = [['bug', 'code'], ['code', 'logic'], ['logic', 'memory'], ['memory', 'flow'], ['flow', 'bug']];

test('each type beats the next one round the loop, and only five types exist', () => {
  assert.equal(TYPE_CYCLE.length, 5);
  for (const [strong, weak] of BEATS) {
    assert.equal(typeEffectiveness(strong, weak), 1.5, `${strong} vs ${weak}`);
    assert.equal(typeEffectiveness(weak, strong), 0.67, `${weak} vs ${strong}`);
  }
});

test('types two apart, the same type, and normal moves are neutral', () => {
  assert.equal(typeEffectiveness('bug', 'logic'), 1);
  assert.equal(typeEffectiveness('code', 'code'), 1);
  for (const t of TYPE_CYCLE) assert.equal(typeEffectiveness('normal', t), 1);
});

test('every type used by a species or a move is known to the chart', () => {
  const known = new Set([...TYPE_CYCLE, 'normal']);
  for (const sp of CODEMON_SPECIES) assert.ok(known.has(sp.type), `species ${sp.id}: ${sp.type}`);
  for (const [name, m] of Object.entries(MOVE_POOL)) assert.ok(known.has(m.type), `${name}: ${m.type}`);
});

test('a super-effective move really does more damage, and the log says so', () => {
  // 0.5 never misses a 90%-accuracy move (a miss is `random * 100 > accuracy`)
  // and fixes the damage roll. The defender is the same creature both times with
  // only its type changed, so the matchup is the one thing that differs.
  vm.runInContext('Math.random = () => 0.5', ctx);
  const attackerSpecies = CODEMON_SPECIES.find(sp => sp.type === 'code');
  const defenderSpecies = CODEMON_SPECIES.find(sp => sp.type === 'logic');
  const hit = (defenderType) => {
    const defender = new Codemon({ ...defenderSpecies, type: defenderType }, 20);
    const battle = new BattleState(new Codemon(attackerSpecies, 20), defender);
    const damage = battle.performMove('player', 'StringConcat');   // a code move
    return { damage, log: battle.log.at(-1) };
  };
  const neutral = hit('memory');   // code vs memory: 1x
  const strong = hit('logic');     // code vs logic: 1.5x
  const weak = hit('bug');         // code vs bug: 0.67x
  assert.ok(neutral.damage > 0, 'the neutral hit should land');
  assert.ok(strong.damage > neutral.damage, `${strong.damage} should beat ${neutral.damage}`);
  assert.ok(weak.damage < neutral.damage, `${weak.damage} should be under ${neutral.damage}`);
  assert.match(strong.log, /super effective/);
  assert.match(weak.log, /not very effective/);
  assert.doesNotMatch(neutral.log, /effective/);
});
