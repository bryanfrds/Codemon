// Evolution checks. Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };   // creatures.js also hangs its classes off window
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../creatures.js', import.meta.url), 'utf8') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.EVOLUTIONS = EVOLUTIONS;' +
  '\nthis.EVOLUTION_STAGE = EVOLUTION_STAGE; this.evolutionFor = evolutionFor; this.baseTotal = baseTotal;', ctx);
const { CODEMON_SPECIES, Codemon, EVOLUTIONS, EVOLUTION_STAGE, evolutionFor, baseTotal } = ctx;
const byId = (id) => CODEMON_SPECIES.find(sp => sp.id === id);

test('every evolution keeps the type and is at least as strong', () => {
  for (const [id, { into }] of EVOLUTIONS) {
    const from = byId(id);
    assert.equal(into.type, from.type, `${from.name} -> ${into.name}`);
    assert.ok(baseTotal(into) >= baseTotal(from), `${from.name} -> ${into.name}`);
  }
});

test('chains are at most three long and never loop back', () => {
  for (const sp of CODEMON_SPECIES) {
    const seen = new Set([sp.id]);
    let cur = sp;
    for (let steps = 0; EVOLUTIONS.has(cur.id); steps++) {
      assert.ok(steps < 2, `${sp.name} evolves more than twice`);
      cur = EVOLUTIONS.get(cur.id).into;
      assert.ok(!seen.has(cur.id), `${sp.name} loops`);
      seen.add(cur.id);
    }
  }
});

test('no species is evolved into by two different ones', () => {
  const targets = [...EVOLUTIONS.values()].map(e => e.into.id);
  assert.equal(new Set(targets).size, targets.length);
});

test('all three starters evolve, at 16', () => {
  for (const id of [1, 2, 5]) {
    assert.equal(EVOLUTION_STAGE.get(id), 0, byId(id).name);
    assert.equal(evolutionFor(byId(id), 15), null);
    assert.ok(evolutionFor(byId(id), 16));
  }
});

test('evolving keeps level and progress, raises stats, and keeps the HP fraction', () => {
  const c = new Codemon(byId(1), 16);
  c.exp = 40;
  c.expToLevel = 200;
  c.currentHp = Math.floor(c.hp / 2);
  const before = { hp: c.hp, atk: c.stats.atk };
  const into = evolutionFor(c.species, c.level);
  c.evolveInto(into);
  assert.equal(c.species, into);
  assert.deepEqual([c.level, c.exp, c.expToLevel], [16, 40, 200]);
  assert.ok(c.hp >= before.hp);
  assert.ok(Math.abs(c.currentHp / c.hp - 0.5) < 0.06, `${c.currentHp}/${c.hp}`);
  assert.deepEqual([...c.moves], [...into.moves]);
});

test('a fainted CodeMon stays fainted when it evolves', () => {
  const c = new Codemon(byId(1), 16);
  c.currentHp = 0;
  c.evolveInto(evolutionFor(c.species, 16));
  assert.equal(c.currentHp, 0);
});
