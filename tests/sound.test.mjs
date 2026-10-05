// Sound checks: the engine in audio.js against a fake audio device, and that
// game.js asks for the right sound at the right moments.
// Run with: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** A stand-in AudioContext that records every tone it's asked to play. */
function fakeAudio() {
  const tones = [];
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  return {
    tones, currentTime: 10, state: 'running', destination: {},
    createOscillator() {
      const o = { frequency: param(), connect() {}, start(t) { o.at = t; }, stop(t) { o.end = t; tones.push(o); } };
      return o;
    },
    createGain() { return { gain: param(), connect() {} }; },
  };
}
const memoryStorage = () => ({ store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); } });

const ctx = { window: { addEventListener() {}, localStorage: memoryStorage() }, setTimeout: () => 0 };
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('audio.js') + '\n' + src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nObject.assign(this, { SOUNDS, CodemonSound, SOUND, CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame });', ctx);
const { SOUNDS, CodemonSound, CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame } = ctx;

test('every sound is a list of sensible notes', () => {
  for (const [name, notes] of Object.entries(SOUNDS)) {
    assert.ok(notes.length > 0, name);
    for (const n of notes) {
      assert.ok(n.f > 20 && n.f < 5000 && n.d > 0 && n.d < 2, name);
      assert.ok(!n.vol || n.vol <= 0.2, `${name} is too loud`);
    }
  }
});

test('playing a sound schedules each of its notes, in order', () => {
  const audio = fakeAudio();
  const sound = new CodemonSound(memoryStorage(), () => audio);
  assert.equal(sound.play('caught'), true);
  assert.equal(audio.tones.length, SOUNDS.caught.length);
  assert.deepEqual([...audio.tones.map(t => t.at)], [...SOUNDS.caught.map(n => 10 + (n.at || 0))]);
});

test('muted, unknown, or no audio device: nothing plays and nothing breaks', () => {
  const audio = fakeAudio();
  const storage = memoryStorage();
  const sound = new CodemonSound(storage, () => audio);
  assert.equal(sound.toggleMute(), true);
  assert.equal(sound.play('hit'), false);
  assert.equal(audio.tones.length, 0);
  assert.equal(sound.toggleMute(), false);
  assert.equal(sound.play('no-such-sound'), false);
  assert.equal(new CodemonSound(storage, () => null).play('hit'), false);
});

test('the mute choice is remembered for next time', () => {
  const storage = memoryStorage();
  new CodemonSound(storage, () => null).toggleMute();
  assert.equal(new CodemonSound(storage, () => null).muted, true);
});

test('blocked storage does not stop the sounds', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const sound = new CodemonSound(blocked, () => fakeAudio());
  assert.equal(sound.muted, false);
  assert.equal(sound.toggleMute(), true);       // still toggles for this visit
});

/** The game with sound requests recorded instead of played. */
function gameHearing() {
  const heard = [];
  ctx.SOUND.play = (name) => { heard.push(name); return true; };
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.team.push(new Codemon(CODEMON_SPECIES[0], 10));
  game.battle = new BattleState(game.player.team[0], new Codemon(CODEMON_SPECIES[5], 10));
  for (const m of ['updateBattleUI', 'setStatus', 'updateTeamUI', 'updateStats', 'closeCatchModal', 'endBattle'])
    game[m] = () => {};
  return { game, heard };
}

test('a catch throws, then chimes or fails', () => {
  const { game, heard } = gameHearing();
  game.battle.calculateCatchProbability = () => 100;
  game.confirmCatch();
  assert.deepEqual([...heard], ['throw', 'caught']);
  const miss = gameHearing();
  miss.game.battle.calculateCatchProbability = () => 0;
  miss.game.confirmCatch();
  assert.deepEqual([...miss.heard].slice(0, 2), ['throw', 'escaped']);
});

test('a win that levels the lead up plays the level-up chime', () => {
  const { game, heard } = gameHearing();
  game.evolveIfReady = () => null;
  game.battle.battleOver = true;
  game.battle.playerWon = true;
  game.battle.playerCodemon.exp = game.battle.playerCodemon.expToLevel - 1;
  game.checkBattleStatus();
  assert.ok(heard.includes('levelUp'));
});
