// How often a lone starter beats each area's trainer, by playing the real game
// code (creatures.js, battle.js, game.js) with drawing off.
//
//   node scripts/sim-trainers.mjs            win rates at the current TRAINER_LEVELS
//   node scripts/sim-trainers.mjs --sweep    win rates for a range of levels per area
//   node scripts/sim-trainers.mjs --levels 7,16,24,44   win rates at other levels
//
// Setup, the same for every fight:
// - Your team is one starter (Byteling #1, BitRiot #2 or Flowy #5) at the level
//   where autoplay first takes the trainer on: the area's guardian level - 2.
//   It's evolved as far as that level allows, at full HP.
// - No potions and no balls, and no backup CodeMon.
// - Autoplay makes every move (challengeTrainer, then autoPlayStep), so the moves
//   are its usual mix: mostly the best one for the matchup, sometimes random.
// - The next trainer CodeMon comes out as soon as the last one faints; the
//   animations it would wait for don't run here.
// - Math.random is seeded, so the same command prints the same numbers.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const FIGHTS = 400;              // per starter, per area, per level
const STARTERS = [1, 2, 5];

function fakeElement() {
  const classes = new Set();
  return { textContent: '', title: '', style: {},
           classList: { add: c => classes.add(c), remove: c => classes.delete(c),
                        contains: c => classes.has(c), toggle() {} } };
}
const elements = {};
const ctx = {
  window: { addEventListener() {} },
  setTimeout: () => 0,
  document: { getElementById: (id) => (elements[id] ||= fakeElement()),
              querySelectorAll: () => [0, 1, 2, 3].map(fakeElement) },
  localStorage: { getItem: () => null, setItem() {} },
};
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nObject.assign(this, { CODEMON_SPECIES, Codemon, Player, CodemonGame, AREAS,' +
  ' GUARDIAN_LEVELS, TRAINER_LEVELS, evolveFully });', ctx);
const { CODEMON_SPECIES, Codemon, Player, CodemonGame, AREAS, GUARDIAN_LEVELS, TRAINER_LEVELS,
        evolveFully } = ctx;

/** Seed the sandbox's Math.random (mulberry32), so runs repeat exactly. */
function seed(n) {
  vm.runInContext(`(() => { let a = ${n} >>> 0; Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()`, ctx);
}

/** One trainer fight; true if the starter won. */
function fight(area, starterId) {
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  const lead = new Codemon(CODEMON_SPECIES.find(s => s.id === starterId), GUARDIAN_LEVELS[area] - 2);
  evolveFully(lead);
  lead.currentHp = lead.hp;
  game.player.team.push(lead);
  game.player.items.potion = 0;
  game.player.items.pokeball = 0;
  Object.assign(game, { currentArea: area, guardiansBeaten: [], guardianRetryLevel: {},
                        trainersBeaten: [], trainerRetryLevel: {}, justOpenedArea: false,
                        autoPlay: true, currentView: 'battle' });
  game.setStatus = () => {};
  for (const m of ['updateBattleUI', 'updateTeamUI', 'updateStats', 'switchView', 'saveGame',
                   'updateAreaButtons']) game[m] = () => {};
  game.fxBusy = () => false;
  game.endBattle = () => { game.battle = null; };
  game.challengeTrainer();
  for (let step = 0; game.battle && !game.battle.resolved && step < 2000; step++) {
    game.battle.events.length = 0;               // no animations to wait for
    if (game.fx) game.fx.evolution = null;
    game.sendOutTrainerNext();
    game.autoPlayStep();
  }
  return game.trainersBeaten.includes(area);
}

/** Percent of FIGHTS won, per starter, at TRAINER_LEVELS[area] = level. */
function rates(area, level) {
  TRAINER_LEVELS[area] = level;
  return STARTERS.map((id, i) => {
    seed(1000 * area + 100 * i + level);
    let wins = 0;
    for (let n = 0; n < FIGHTS; n++) wins += fight(area, id);
    return Math.round(100 * wins / FIGHTS);
  });
}

const fmt = (r) => `${r.join('/')}% (mean ${Math.round(r.reduce((a, b) => a + b) / r.length)}%)`;
const at = process.argv.indexOf('--levels');
const current = at > 0 ? process.argv[at + 1].split(',').map(Number) : [...TRAINER_LEVELS];
console.log(`Win % for Byteling/BitRiot/Flowy, ${FIGHTS} fights each, lead at guardian level - 2:`);
AREAS.forEach((area, a) => {
  if (process.argv.includes('--sweep')) {
    const row = [];
    for (let lvl = Math.max(2, current[a] - 6); lvl <= GUARDIAN_LEVELS[a] + 16; lvl += 2) row.push(`${lvl}: ${fmt(rates(a, lvl))}`);
    console.log(`${area.name} (lead ${GUARDIAN_LEVELS[a] - 2})\n  ` + row.join('\n  '));
  } else {
    console.log(`${area.name}: trainer level ${current[a]}, lead ${GUARDIAN_LEVELS[a] - 2}: ${fmt(rates(a, current[a]))}`);
  }
});
