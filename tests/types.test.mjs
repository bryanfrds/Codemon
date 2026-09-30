// Type chart checks. Run with: node --test tests/*.test.mjs
// creatures.js is a plain browser script, so load it into a sandbox and read
// the functions off that, rather than turning the game into modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };   // creatures.js also hangs its classes off window
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../creatures.js', import.meta.url), 'utf8') +
  '\nthis.typeEffectiveness = typeEffectiveness; this.TYPE_CYCLE = TYPE_CYCLE;' +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.MOVE_POOL = MOVE_POOL;', ctx);
const { typeEffectiveness, TYPE_CYCLE, CODEMON_SPECIES, MOVE_POOL } = ctx;

test('each type beats the next one round the loop', () => {
  for (let i = 0; i < TYPE_CYCLE.length; i++) {
    const next = TYPE_CYCLE[(i + 1) % TYPE_CYCLE.length];
    assert.equal(typeEffectiveness(TYPE_CYCLE[i], next), 1.5, `${TYPE_CYCLE[i]} vs ${next}`);
    assert.equal(typeEffectiveness(next, TYPE_CYCLE[i]), 0.67, `${next} vs ${TYPE_CYCLE[i]}`);
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
