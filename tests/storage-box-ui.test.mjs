// The storage box screen, against a stand-in page. Run with: node --test tests/*.test.mjs
// Autoplay can start a fight, and reorder the team, while the box is open; the
// buttons then pointed at the wrong slots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let els = {};
const el = (id) => ({
  id, children: [], textContent: '', className: '', listeners: {}, hidden: true,
  set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; },
  classList: {
    add(c) { if (c === 'hidden') this.owner.hidden = true; },
    remove(c) { if (c === 'hidden') this.owner.hidden = false; },
  },
  appendChild(c) { this.children.push(c); },
  addEventListener(t, f) { this.listeners[t] = f; },
});
const byId = (id) => {
  if (!els[id]) { els[id] = el(id); els[id].classList.owner = els[id]; }
  return els[id];
};
const ctx = {
  window: { addEventListener() {} }, setTimeout: () => 0, playSound() {},
  document: {
    getElementById: byId,
    createElement: () => { const e = el(); e.classList.owner = e; return e; },
    // Any open modal, as canWalk asks.
    querySelector: (sel) => (sel === '.modal:not(.hidden)'
      ? Object.values(els).find(e => e.isModal && !e.hidden) || null : null),
    querySelectorAll: () => [],
  },
  SPRITES: { imgFor: () => '' }, localStorage: { getItem: () => null, setItem() {} },
};
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.CodemonGame = CodemonGame;' +
  '\nthis.Player = Player;', ctx);
const { CODEMON_SPECIES: S, Codemon, CodemonGame, Player } = ctx;

/** A game outside a fight with a team of 6 and `boxed` stored. */
function setup(boxed = 1) {
  els = {};
  for (const id of ['boxModal', 'shopModal', 'starterModal', 'catchModal', 'moveSelectModal']) byId(id).isModal = true;
  const g = Object.create(CodemonGame.prototype);
  g.player = new Player();
  g.battle = null;
  const status = [];
  g.setStatus = (s) => status.push(s);
  for (const m of ['updateTeamUI', 'saveGame', 'updateBattleUI', 'switchView']) g[m] = () => {};
  for (let i = 0; i < 6; i++) g.player.team.push(new Codemon(S[i], 10));
  for (let i = 0; i < boxed; i++) g.player.box.push(new Codemon(S[10 + i], 10));
  return { g, status };
}
const teamButton = (i) => els.boxTeamList.children[i].children[0].listeners.click;
const boxButton = (i) => els.boxStoredList.children[i].children[0].listeners.click;
// Array.from, so the result is an array of this realm and deepEqual can compare it.
const names = (list) => Array.from(list, c => c.species.name);

test('a fight starting while the box is open closes it', () => {
  const { g } = setup();
  g.openBox();
  assert.equal(els.boxModal.hidden, false);
  g.beginBattle(new Codemon(S[20], 5), 'A wild one appeared!');
  assert.equal(els.boxModal.hidden, true);
});

test('Store moves the CodeMon the row showed, even after the team was reordered', () => {
  const { g } = setup(0);
  g.player.team.pop();                  // room for nothing to block a store
  g.openBox();
  const shown = g.player.team[0];
  g.player.switchCodemon(3);            // autoplay reorders the team behind the open box
  teamButton(0)();                      // the row that showed `shown`
  assert.deepEqual(names(g.player.box), [shown.species.name]);
  assert.ok(!g.player.team.includes(shown));
});

test('a button for a CodeMon that has moved on does nothing', () => {
  const { g, status } = setup(1);
  g.player.team.length = 5;             // room, so the row offers Take
  g.openBox();
  const stored = g.player.box[0];
  g.player.box.length = 0;              // gone by the time of the click
  const before = names(g.player.team);
  boxButton(0)();                       // its Swap / Take button
  assert.deepEqual(names(g.player.team), before);
  assert.ok(!g.player.team.includes(stored));
  assert.ok(!/joined the team/.test(status.at(-1) || ''));
});

test('a swap that succeeds says so, even when the leader is reordered', () => {
  const { g, status } = setup(1);
  const [a, b] = g.player.team;
  b.currentHp = 0;                      // team: A ok, B fainted, C ok, ...
  const x = g.player.box[0];
  x.currentHp = 0;                      // box: X fainted
  g.openBox();
  boxButton(0)();                       // pick X
  teamButton(0)();                      // swap it for A
  assert.ok(g.player.team.includes(x));
  assert.ok(g.player.box.includes(a));
  assert.match(status.at(-1), new RegExp(`${x.species.name} joined the team`));
});

test('B opens and closes the box, but not over another dialog or in a fight', () => {
  const { g, status } = setup();
  g.onBoxKey();
  assert.equal(els.boxModal.hidden, false);
  g.onBoxKey();
  assert.equal(els.boxModal.hidden, true);

  els.shopModal.hidden = false;         // the shop is open
  g.onBoxKey();
  assert.equal(els.boxModal.hidden, true);
  els.shopModal.hidden = true;

  g.battle = {};                        // mid-fight: nothing, and the battle's status line stays
  const said = status.length;
  g.onBoxKey();
  assert.equal(els.boxModal.hidden, true);
  assert.equal(status.length, said);
});

test('B does nothing before a starter is chosen', () => {
  const { g } = setup();
  g.player.team.length = 0;
  g.onBoxKey();
  assert.equal(els.boxModal.hidden, true);
});
