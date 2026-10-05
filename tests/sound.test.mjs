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
  const ramps = [];                              // every ramp target, which must stay above 0
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime(v) { ramps.push(v); } });
  return {
    tones, ramps, currentTime: 10, state: 'running', destination: {},
    createOscillator() {
      const o = { frequency: param(), connect() {}, start(t) { o.at = t; }, stop(t) { o.end = t; tones.push(o); } };
      o.connect = () => {};
      return o;
    },
    createGain() { return { gain: param(), connect() {} }; },
  };
}
const memoryStorage = () => ({ store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); } });

const listeners = {};
const ctx = { window: { localStorage: memoryStorage(),
                        addEventListener(t, fn) { (listeners[t] ||= new Set()).add(fn); },
                        removeEventListener(t, fn) { listeners[t]?.delete(fn); } },
              setTimeout: () => 0 };
vm.createContext(ctx);
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
vm.runInContext(src('audio.js') + '\n' + src('creatures.js') + '\n' + src('battle.js') + '\n' + src('game.js') +
  '\nObject.assign(this, { SOUNDS, CodemonSound, SOUND, CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame, hitSound });', ctx);
const { SOUNDS, CodemonSound, CODEMON_SPECIES, Codemon, Player, BattleState, CodemonGame, hitSound } = ctx;

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
  const delays = {};
  ctx.SOUND.play = (name, delay = 0) => { heard.push(name); delays[name] = delay; return true; };
  const game = Object.create(CodemonGame.prototype);
  game.player = new Player();
  game.player.team.push(new Codemon(CODEMON_SPECIES[0], 10));
  game.battle = new BattleState(game.player.team[0], new Codemon(CODEMON_SPECIES[5], 10));
  for (const m of ['updateBattleUI', 'setStatus', 'updateTeamUI', 'updateStats', 'closeCatchModal', 'endBattle'])
    game[m] = () => {};
  return { game, heard, delays };
}

test('a catch throws, then chimes or fails', () => {
  const { game, heard, delays } = gameHearing();
  game.battle.calculateCatchProbability = () => 100;
  game.confirmCatch();
  assert.deepEqual([...heard], ['throw', 'caught']);
  assert.ok(delays.caught >= 0.15, 'the result waits for the throw to finish');
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
  assert.ok(!heard.includes('levelUp'), 'not before the knockout has shown');
  game.fxBusy = () => false;
  game.flushQueuedSound();
  assert.ok(heard.includes('levelUp'));
});

test('the first click or key press wakes the audio up', () => {
  let resumed = 0;
  const audio = { ...fakeAudio(), state: 'suspended', resume() { resumed++; } };
  const sound = new CodemonSound(memoryStorage(), () => audio);
  sound.unlock();
  assert.equal(sound.ctx, audio);
  assert.equal(resumed, 1);
});

test('notes fade towards a tiny volume, never 0, and start after any delay', () => {
  const audio = fakeAudio();
  const sound = new CodemonSound(memoryStorage(), () => audio);
  for (const name of Object.keys(SOUNDS)) sound.play(name);
  assert.ok(audio.ramps.length > 0 && audio.ramps.every(v => v > 0));
  const later = fakeAudio();
  new CodemonSound(memoryStorage(), () => later).play('hit', 0.5);
  assert.equal(later.tones[0].at, 10.5);
  assert.ok(later.tones[0].end > later.tones[0].at);
});

test('while the audio is paused, sounds are skipped rather than piled up', () => {
  let resumed = 0;
  const audio = { ...fakeAudio(), state: 'suspended', resume() { resumed++; } };
  const sound = new CodemonSound(memoryStorage(), () => audio);
  assert.equal(sound.play('hit'), false);
  assert.equal(audio.tones.length, 0);
  assert.equal(resumed, 1);
});

test('inputs keep trying to wake the audio until it is running, then stop listening', () => {
  const states = ['suspended', 'running'];
  const audio = { ...fakeAudio(), resume() {} };
  Object.defineProperty(audio, 'state', { get: () => states[0] });
  ctx.SOUND.ctx = audio;
  const [handler] = listeners.keydown;
  handler();                                     // e.g. Escape: still paused
  assert.equal(listeners.keydown.size, 1);
  states.shift();                                // a real click wakes it
  handler();
  assert.equal(listeners.keydown.size, 0);
  assert.equal(listeners.pointerdown.size, 0);
});

test('a landed move sounds like how well it matched up', () => {
  assert.equal(hitSound({ kind: 'hit', effectiveness: 1.5 }), 'super');
  assert.equal(hitSound({ kind: 'hit', effectiveness: 0.67 }), 'weak');
  assert.equal(hitSound({ kind: 'hit', effectiveness: 1 }), 'hit');
  assert.equal(hitSound({ kind: 'miss' }), 'miss');
});

test("a guardian win plays the fanfare, not the level-up chime", () => {
  const { game, heard } = gameHearing();
  Object.assign(game, { currentArea: 0, guardiansBeaten: [], guardianRetryLevel: {},
                        evolveIfReady: () => null, updateAreaButtons: () => {}, fxBusy: () => false });
  game.battle.guardian = true;
  game.battle.battleOver = true;
  game.battle.playerWon = true;
  game.battle.playerCodemon.exp = game.battle.playerCodemon.expToLevel - 1;   // it levels up too
  game.checkBattleStatus();
  game.flushQueuedSound();
  assert.deepEqual([...heard], ['guardian']);
});

test('the evolution sound plays once, however many frames it takes', () => {
  const { game, heard } = gameHearing();
  game.fx = { active: null, particles: [], texts: [], rings: [], evolution: { t0: null } };
  let busy = true;
  game.fxBusy = () => busy;
  game.startEvolutionIfReady(1);                 // the last hit is still playing
  assert.equal(heard.length, 0);
  busy = false;
  for (let f = 2; f < 10; f++) game.startEvolutionIfReady(f);
  assert.deepEqual([...heard], ['evolve']);
});

test('a win sound waits for an evolution to finish instead of playing over it', () => {
  const { game, heard } = gameHearing();
  game.fxBusy = () => false;
  game.queueSound('levelUp');
  game.fx.evolution = { t0: null };
  game.startEvolutionIfReady(1);
  game.flushQueuedSound();
  assert.deepEqual([...heard], ['evolve']);
  game.fx.evolution = null;                      // the sweep has finished
  game.flushQueuedSound();
  assert.deepEqual([...heard], ['evolve', 'levelUp']);
});

test('a win sound still waiting when the battle closes plays then, once', () => {
  const { game, heard } = gameHearing();
  Object.assign(game, { updateTeamUI() {}, updateStats() {}, switchView() {}, saveGame() {} });
  game.fxBusy = () => true;                      // the frames fell behind
  game.queueSound('guardian');
  CodemonGame.prototype.endBattle.call(game);
  assert.deepEqual([...heard], ['guardian']);
  game.fxBusy = () => false;
  game.flushQueuedSound();
  assert.deepEqual([...heard], ['guardian']);
});
