// Creature sprites for CodeMon.
//
// Art is the Pixmons pack from novelgens.com/pixmons - 1000 AI-generated monster
// sprites released into the public domain ("free to use or modify in any project,
// paid or free, without permission or attribution"). Prepared for the game by
// scripts/prep_pixmons.py: white background flooded away from the edges, trimmed
// to the creature, and centred on a 96x96 transparent square.
//
// A species always maps to the same file, so the Pokedex is stable across reloads.

const PIXMON_DIR = 'assets/pixmons';
const PIXMON_COUNT = 60;          // how many were prepared; see prep_pixmons.py
const PIXMON_SIZE = 96;

class CodemonSprites {
  constructor() {
    this.cache = new Map();       // species id -> HTMLImageElement
  }

  fileFor(species) {
    const id = (species && species.id) || 1;
    const n = ((id - 1) % PIXMON_COUNT + PIXMON_COUNT) % PIXMON_COUNT;
    return `${PIXMON_DIR}/${String(n).padStart(3, '0')}.png`;
  }

  /**
   * The <img> for a species. Returned immediately and possibly still loading -
   * callers check `.complete` before drawing, so a cold cache never throws.
   */
  forSpecies(species) {
    const id = (species && species.id) || 1;
    if (this.cache.has(id)) return this.cache.get(id);
    const img = new Image();
    img.src = this.fileFor(species);
    this.cache.set(id, img);
    return img;
  }

  /** Markup for the places that build HTML strings (team list, Pokedex, catch). */
  imgFor(species, size = 48) {
    return `<img src="${this.fileFor(species)}" width="${size}" height="${size}" ` +
           `alt="" style="image-rendering: pixelated; display: block;">`;
  }

  /** Draw centred on (cx, cy) at `size` px, preserving the square aspect. */
  draw(ctx, species, cx, cy, size) {
    const img = this.forSpecies(species);
    if (!img.complete || !img.naturalWidth) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
    return true;
  }
}

const SPRITES = new CodemonSprites();
