// Using a potion from the battle bag. Run with: node --test tests/*.test.mjs
// At full HP the potion does nothing, so it shouldn't cost the turn: the foe
// used to get a free hit while the log claimed 20 HP were recovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const buttons = [];
const ctx = {
  window: { addEventListener() {} },
  setTimeout: () => 0,
  // Just enough page for showItemMenu to build its buttons.
  document: {
    getElementById: () => ({ innerHTML: '', appendChild(b) { buttons.push(b); } }),
    createElement: () => ({ addEventListener(_, fn) { this.click = fn; } }),
  },
};
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nthis.CODEMON_SPECIES = CODEMON_SPECIES; this.Codemon = Codemon; this.Player = Player;' +
  '\nthis.BattleState = BattleState; this.CodemonGame = CodemonGame;', ctx);
const { CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame } = ctx;

/** Mid-fight with one potion; counts the foe's turns and the status lines shown. */
function inFight() {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.items.potion = 1;
  const lead = new Codemon(CODEMON_SPECIES[0], 10);
  game.player.team.push(lead);
  game.battle = new BattleState(lead, new Codemon(CODEMON_SPECIES[5], 10));
  const seen = { foeTurns: 0, status: [] };
  game.battle.enemyTurn = () => { seen.foeTurns++; };
  game.moveSelectModal = { classList: { remove() {} } };
  game.setStatus = (s) => seen.status.push(s);
  for (const m of ['updateBattleUI', 'closeMoveModal', 'checkBattleStatus']) game[m] = () => {};
  return { game, lead, seen };
}

function usePotion(game) {
  buttons.length = 0;
  game.showItemMenu();
  buttons[0].click();
}

test('a potion at full HP keeps the potion and the turn', () => {
  const { game, lead, seen } = inFight();
  usePotion(game);
  assert.equal(lead.currentHp, lead.hp);
  assert.equal(game.player.items.potion, 1);
  assert.equal(seen.foeTurns, 0);
  assert.ok(!game.battle.log.some(l => l.startsWith('Used potion')));
  assert.match(seen.status.at(-1), /full HP/);
});

test('a potion on a hurt CodeMon heals it and the foe moves', () => {
  const { game, lead, seen } = inFight();
  lead.currentHp = lead.hp - 30;
  usePotion(game);
  assert.equal(lead.currentHp, lead.hp - 10);
  assert.equal(game.player.items.potion, 0);
  assert.equal(seen.foeTurns, 1);
  assert.equal(game.battle.log.at(-1), 'Used potion! Recovered 20 HP.');
});

test('the log says how much a potion really healed', () => {
  const { game, lead } = inFight();
  lead.currentHp = lead.hp - 5;
  usePotion(game);
  assert.equal(lead.currentHp, lead.hp);
  assert.equal(game.battle.log.at(-1), 'Used potion! Recovered 5 HP.');
});

test('autoplay logs how much its potion really healed', () => {
  // Autoplay drinks below 45% HP; with a small max HP that can be under 20 missing.
  const { game, lead } = inFight();
  game.autoPlay = true;
  game.fxBusy = () => false;   // no animation running
  lead.hp = 30;
  lead.currentHp = 13;
  game.autoPlayStep();
  assert.equal(lead.currentHp, 30);
  assert.equal(game.player.items.potion, 0);
  assert.equal(game.battle.log.at(-1), 'Used potion! Recovered 17 HP.');
});
