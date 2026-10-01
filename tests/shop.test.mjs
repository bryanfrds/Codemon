// Shop checks. Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} };   // creatures.js also hangs its classes off window
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../creatures.js', import.meta.url), 'utf8') +
  '\nthis.Player = Player; this.SHOP_PRICES = SHOP_PRICES; this.nextRestock = nextRestock;', ctx);
const { Player, SHOP_PRICES, nextRestock } = ctx;

test('buying takes the gold and adds the items', () => {
  const p = new Player();
  p.gold = 200;
  const before = p.items.pokeball;
  assert.equal(p.buy('pokeball', 2), true);
  assert.equal(p.gold, 200 - 2 * SHOP_PRICES.pokeball);
  assert.equal(p.items.pokeball, before + 2);
});

test('you can spend exactly what you have, but not a coin more', () => {
  const p = new Player();
  p.gold = SHOP_PRICES.potion;
  assert.equal(p.buy('potion'), true);
  assert.equal(p.gold, 0);
  assert.equal(p.buy('potion'), false);
  assert.equal(p.gold, 0);
});

test('bad purchases change nothing', () => {
  const p = new Player();
  p.gold = 1000;
  const items = JSON.stringify(p.items);
  for (const [kind, qty] of [['antidote', 1], ['nonsense', 1], ['constructor', 1], ['toString', 1], ['potion', 0], ['potion', -3], ['potion', 1.5]]) {
    assert.equal(p.buy(kind, qty), false, `${kind} x${qty}`);
  }
  assert.equal(p.gold, 1000);
  assert.equal(JSON.stringify(p.items), items);
});

test('every item the shop sells is one the game already tracks', () => {
  const p = new Player();
  for (const kind of Object.keys(SHOP_PRICES)) assert.ok(kind in p.items, kind);
});

test('autoplay restocks potions first, then Pokéballs, up to two each', () => {
  const p = new Player();
  p.gold = 1000;
  p.items.potion = 0;
  p.items.pokeball = 0;
  const bought = [];
  for (let k; (k = nextRestock(p)); ) { assert.ok(p.buy(k)); bought.push(k); }
  assert.deepEqual(bought, ['potion', 'potion', 'pokeball', 'pokeball']);
  assert.equal(nextRestock(p), null);
});

test('autoplay buys nothing it cannot afford', () => {
  const p = new Player();
  p.items.potion = 0;
  p.items.pokeball = 0;
  p.gold = SHOP_PRICES.potion - 1;
  assert.equal(nextRestock(p), null);
  p.gold = SHOP_PRICES.potion;                 // a potion, but not a ball
  p.items.potion = 2;
  assert.equal(nextRestock(p), null);
});
