// Evolution checks. Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };   // creatures.js also hangs its classes off window
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../creatures.js', import.meta.url), 'utf8') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.EVOLUTIONS = EVOLUTIONS;' +
  '\nthis.EVOLUTION_STAGE = EVOLUTION_STAGE; this.evolutionFor = evolutionFor; this.baseTotal = baseTotal;' +
  '\nthis.evolveFully = evolveFully;', ctx);
const { CODEMON_SPECIES, Codemon, EVOLUTIONS, EVOLUTION_STAGE, evolutionFor, baseTotal, evolveFully } = ctx;
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

test('a high-level catch evolves straight through both stages', () => {
  const weak = CODEMON_SPECIES.find(sp => EVOLUTION_STAGE.get(sp.id) === 0);
  const strong = EVOLUTIONS.get(EVOLUTIONS.get(weak.id).into.id).into;
  const c = new Codemon(weak, 40);
  assert.equal(evolveFully(c), weak, 'returns where it started');
  assert.equal(c.species, strong);
  assert.equal(evolveFully(c), null, 'nothing further');
});

test('below the level, evolveFully changes nothing', () => {
  const c = new Codemon(CODEMON_SPECIES[0], 15);
  assert.equal(evolveFully(c), null);
  assert.equal(c.species, CODEMON_SPECIES[0]);
});

test("an evolved CodeMon's EXP threshold survives a reload unchanged", () => {
  // loadGame rebuilds each CodeMon from its saved species and only keeps the
  // saved expToLevel if it is at least that species' starting value.
  for (const id of [1, 2, 5]) {
    const c = new Codemon(CODEMON_SPECIES.find(sp => sp.id === id), 5);
    while (c.level < 16) c.gainExp(c.expToLevel);
    evolveFully(c);
    const rebuilt = new Codemon(c.species, c.level);
    const kept = c.expToLevel >= rebuilt.expToLevel ? c.expToLevel : rebuilt.expToLevel;
    assert.equal(kept, c.expToLevel, c.species.name);
  }
});
