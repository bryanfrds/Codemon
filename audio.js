// CodeMon's sound effects, synthesised with the Web Audio API, so there are no
// audio files. Each sound is a short list of notes; a note is a tone that can
// slide from one pitch to another.
//
// Browsers only let a page make sound after the player has clicked or pressed
// something, so the audio context is created lazily on the first sound.

/** Note: f = start pitch (Hz), to = end pitch, at = start (s), d = length (s). */
const SOUNDS = {
  hit:      [{ f: 220, to: 70, d: 0.09, type: 'square', vol: 0.18 }],
  miss:     [{ f: 300, to: 260, d: 0.07, type: 'sine', vol: 0.12 }],
  super:    [{ f: 440, d: 0.06, type: 'square', vol: 0.14 }, { f: 660, at: 0.06, d: 0.06, type: 'square', vol: 0.14 },
             { f: 880, at: 0.12, d: 0.1, type: 'square', vol: 0.14 }],
  weak:     [{ f: 180, to: 120, d: 0.12, type: 'triangle', vol: 0.14 }],
  heal:     [{ f: 520, to: 780, d: 0.18, type: 'sine', vol: 0.14 }],
  faint:    [{ f: 400, to: 90, d: 0.45, type: 'triangle', vol: 0.18 }],
  throw:    [{ f: 300, to: 900, d: 0.15, type: 'sine', vol: 0.12 }],
  caught:   [{ f: 523, d: 0.1, type: 'square', vol: 0.12 }, { f: 659, at: 0.1, d: 0.1, type: 'square', vol: 0.12 },
             { f: 784, at: 0.2, d: 0.1, type: 'square', vol: 0.12 }, { f: 1047, at: 0.3, d: 0.25, type: 'square', vol: 0.12 }],
  escaped:  [{ f: 400, d: 0.08, type: 'square', vol: 0.1 }, { f: 300, at: 0.09, d: 0.12, type: 'square', vol: 0.1 }],
  levelUp:  [{ f: 392, d: 0.08, type: 'triangle', vol: 0.16 }, { f: 523, at: 0.08, d: 0.08, type: 'triangle', vol: 0.16 },
             { f: 659, at: 0.16, d: 0.08, type: 'triangle', vol: 0.16 }, { f: 784, at: 0.24, d: 0.2, type: 'triangle', vol: 0.16 }],
  evolve:   [{ f: 200, to: 1200, d: 1.2, type: 'sine', vol: 0.12 }, { f: 1047, at: 1.2, d: 0.3, type: 'triangle', vol: 0.16 },
             { f: 1319, at: 1.35, d: 0.4, type: 'triangle', vol: 0.16 }],
  guardian: [{ f: 523, d: 0.12, type: 'square', vol: 0.13 }, { f: 523, at: 0.14, d: 0.12, type: 'square', vol: 0.13 },
             { f: 523, at: 0.28, d: 0.12, type: 'square', vol: 0.13 }, { f: 698, at: 0.42, d: 0.5, type: 'square', vol: 0.13 }],
  shiny:    [{ f: 1568, d: 0.06, type: 'sine', vol: 0.1 }, { f: 2093, at: 0.07, d: 0.06, type: 'sine', vol: 0.1 },
             { f: 2637, at: 0.14, d: 0.12, type: 'sine', vol: 0.1 }],
  coin:     [{ f: 988, d: 0.06, type: 'square', vol: 0.1 }, { f: 1319, at: 0.06, d: 0.14, type: 'square', vol: 0.1 }],
};

const MUTE_KEY = 'codemonMuted';

class CodemonSound {
  constructor(storage, makeContext) {
    this.storage = storage;              // where the mute choice is remembered
    this.makeContext = makeContext;      // returns an AudioContext, or null
    this.ctx = null;
    let saved = null;
    try { saved = storage && storage.getItem(MUTE_KEY); } catch (e) { /* blocked */ }
    this.muted = saved === '1';
  }

  /** Mute or unmute; remembered in this browser. Returns whether it's now muted. */
  toggleMute() {
    this.muted = !this.muted;
    try { this.storage && this.storage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch (e) { /* blocked */ }
    return this.muted;
  }

  /**
   * Create and wake the audio context. Browsers keep it paused until the player
   * clicks or presses something, so this runs on the first such input; sounds
   * triggered by autoplay before then would otherwise stay silent.
   */
  unlock() {
    if (!this.ctx) this.ctx = this.makeContext();
    if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
  }

  /** Play a named sound. Returns false (silently) if muted, unknown, or no audio. */
  play(name) {
    const notes = SOUNDS[name];
    if (this.muted || !notes) return false;
    if (!this.ctx) this.ctx = this.makeContext();
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    const now = ctx.currentTime;
    for (const n of notes) {
      const start = now + (n.at || 0), end = start + n.d;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type || 'square';
      osc.frequency.setValueAtTime(n.f, start);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, end);
      gain.gain.setValueAtTime(n.vol || 0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, end);   // fade, so notes don't click
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end);
    }
    return true;
  }
}

/** The game's shared sound player, with the browser's audio and storage. */
const SOUND = new CodemonSound(
  (() => { try { return window.localStorage; } catch (e) { return null; } })(),
  () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    return AC ? new AC() : null;
  });

for (const type of ['pointerdown', 'keydown']) {
  window.addEventListener(type, () => SOUND.unlock(), { once: true });
}
