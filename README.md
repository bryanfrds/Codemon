# 🧬 CodeMon: Creature Battle & Collection RPG

A creature-collecting battle RPG in plain HTML, CSS and JavaScript. Pick a starter, explore four areas, battle wild CodeMon, and catch them all — or switch on autoplay and watch it play itself.

![Genre](https://img.shields.io/badge/Genre-Creature%20Collector%20RPG-purple)
![Tech](https://img.shields.io/badge/Tech-HTML5%20Canvas-blue)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(Pure%20Vanilla)-success)

---

## 🎮 Features

- **Three starters** — Byteling (bug), BitRiot (code) or Flowy (flow).
- **1,000 CodeMon** to catch, each with its own sprite, type, stats and moves.
- **Four areas**, each with its own backdrop and pool of wild CodeMon, tougher the further in you go:

  | Area | CodeMon |
  |---|---|
  | Null Pointer Meadow | #1–280 |
  | Stack Overflow Hills | #241–540 |
  | Memory Leak Lake | #501–780 |
  | Debug Canyon | #741–1000 |

- **Animated battles** — attacks lunge, hits flash and shake with sparks in the move's type colour, damage numbers float up, and HP bars drop when the hit lands.
- **Catching** with Pokéballs and Great Balls; weaken a CodeMon first for better odds.
- **Items** — potions to heal mid-fight.
- **Autoplay** — explores, fights, heals and catches on its own.
- **Pokédex** of everything you've caught.

Five types: **bug**, **code**, **memory**, **logic** and **flow**.

---

## 🚀 How to Run

No build step and no dependencies. Either open the file directly:

```bash
open index.html
```

or serve it locally (useful while editing, since it turns browser caching off):

```bash
python3 scripts/serve.py 8777
# then visit http://127.0.0.1:8777
```

There's no save — each reload is a fresh run.

---

## 🕹️ How to Play

1. Choose a starter.
2. Walk around with the arrow buttons, or press **ENCOUNTER** to find a wild CodeMon.
3. In battle: **MOVE** to attack, **ITEM** for a potion, **CATCH** to throw a ball, **SWITCH** to swap team members, **RUN** to flee.
4. Change area from the **AREAS** panel to meet different CodeMon.
5. Or press **🤖 AUTOPLAY** and let it play.

---

## 📁 Project Structure

```
index.html        page layout
style.css         styling
game.js           game loop, exploration, battle rendering, effects, autoplay
battle.js         battle rules: damage, status moves, catching
creatures.js      the 1,000-species roster, moves, and creature/player classes
sprites.js        loads and draws creature sprites
assets/pixmons/   creature sprites (000.png – 999.png)
assets/bg/        area backdrops
scripts/
  gen_roster.py   generates the roster in creatures.js (seeded, so it's reproducible)
  prep_pixmons.py turns the raw Pixmon pack into game-ready sprites
  tint_bg.py      derives the area backdrops from the forest one
  serve.py        local server with caching off
```

To regenerate the roster after editing names or stats in `scripts/gen_roster.py`:

```bash
python3 scripts/gen_roster.py > roster.js   # then paste over CODEMON_SPECIES in creatures.js
```

---

## 🎨 Credits

- **Creature sprites:** [Pixmons](https://www.novelgens.com/pixmons) by NovelGens — 1,000 pixel monsters released into the public domain.
