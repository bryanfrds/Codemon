# CodeMon

A small Pokémon-style game in plain JavaScript. You pick a starter, walk around, fight wild CodeMon and try to catch them. There are 1,000 of them.

There's also an autoplay button if you just want to watch it go.

## Running it

No install. Open `index.html` in a browser.

If you're editing the code, `python3 scripts/serve.py 8777` serves it at http://127.0.0.1:8777 with caching off, so changes show up on reload.

The game doesn't save. Every reload starts over.

## Playing

You start by choosing Byteling, BitRiot or Flowy. After that:

- the arrow buttons move you around
- ENCOUNTER starts a fight
- in a fight you can attack, use a potion, throw a ball, switch or run
- the areas list on the right takes you somewhere else

Catching works better once the wild one is low on HP.

There are four areas and each one has different CodeMon, getting harder as you go:

- Null Pointer Meadow: #1–280
- Stack Overflow Hills: #241–540
- Memory Leak Lake: #501–780
- Debug Canyon: #741–1000

The types are bug, code, memory, logic and flow.

## Code

- `game.js` has most of it: the loop, map, battle drawing, effects and autoplay
- `battle.js` is the fight rules (damage, catching, moves like Harden)
- `creatures.js` holds all 1,000 species
- `sprites.js` loads the pictures
- `scripts/gen_roster.py` generates the species list. It's seeded, so it comes out the same every time. Run it and paste the output over `CODEMON_SPECIES` in `creatures.js`.
- `scripts/prep_pixmons.py` turns the original sprite pack into the 96×96 transparent images in `assets/pixmons`

## Credits

The creature sprites are [Pixmons](https://www.novelgens.com/pixmons) by NovelGens, released into the public domain.
