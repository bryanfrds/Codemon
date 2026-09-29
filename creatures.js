// CodeMon Creature Database & Stat Generator

const CODEMON_TYPES = {
  BUG: 'bug',
  CODE: 'code',
  MEMORY: 'memory',
  LOGIC: 'logic',
  FLOW: 'flow'
};

const CODEMON_SPECIES = [
  {
    id: 1,
    name: 'Byteling',
    icon: '🐛',
    type: CODEMON_TYPES.BUG,
    baseHp: 25,
    baseAtk: 18,
    baseDef: 14,
    baseSp: 16,
    baseSpd: 12,
    exp: 0,
    expToLevel: 64,
    catchRate: 200,
    moves: ['Scratch', 'StringConcat', 'Bite']
  },
  {
    id: 2,
    name: 'BitRiot',
    icon: '💥',
    type: CODEMON_TYPES.CODE,
    baseHp: 39,
    baseAtk: 32,
    baseDef: 22,
    baseSp: 20,
    baseSpd: 10,
    exp: 0,
    expToLevel: 100,
    catchRate: 45,
    moves: ['Crash', 'StackOverflow', 'DebugAttack']
  },
  {
    id: 3,
    name: 'Memorex',
    icon: '🧠',
    type: CODEMON_TYPES.MEMORY,
    baseHp: 35,
    baseAtk: 14,
    baseDef: 16,
    baseSp: 32,
    baseSpd: 20,
    exp: 0,
    expToLevel: 80,
    catchRate: 120,
    moves: ['CacheStore', 'DataShift', 'LeakDetect']
  },
  {
    id: 4,
    name: 'Logix',
    icon: '🔀',
    type: CODEMON_TYPES.LOGIC,
    baseHp: 30,
    baseAtk: 20,
    baseDef: 28,
    baseSp: 18,
    baseSpd: 14,
    exp: 0,
    expToLevel: 75,
    catchRate: 150,
    moves: ['IfStatement', 'BooleanFlip', 'LogicalAnd']
  },
  {
    id: 5,
    name: 'Flowy',
    icon: '🌊',
    type: CODEMON_TYPES.FLOW,
    baseHp: 28,
    baseAtk: 22,
    baseDef: 18,
    baseSp: 25,
    baseSpd: 22,
    exp: 0,
    expToLevel: 85,
    catchRate: 160,
    moves: ['AsyncWave', 'CallbackStrike', 'PromiseChain']
  }
];

const MOVE_POOL = {
  'Scratch': { power: 12, accuracy: 100, type: 'normal', category: 'physical' },
  'StringConcat': { power: 15, accuracy: 90, type: 'code', category: 'special' },
  'Bite': { power: 18, accuracy: 85, type: 'bug', category: 'physical' },
  'Crash': { power: 28, accuracy: 75, type: 'code', category: 'special' },
  'StackOverflow': { power: 32, accuracy: 70, type: 'logic', category: 'special' },
  'DebugAttack': { power: 24, accuracy: 95, type: 'code', category: 'physical' },
  'CacheStore': { power: 20, accuracy: 100, type: 'memory', category: 'special' },
  'DataShift': { power: 18, accuracy: 95, type: 'memory', category: 'physical' },
  'LeakDetect': { power: 25, accuracy: 80, type: 'memory', category: 'special' },
  'IfStatement': { power: 16, accuracy: 100, type: 'logic', category: 'special' },
  'BooleanFlip': { power: 14, accuracy: 100, type: 'logic', category: 'special' },
  'LogicalAnd': { power: 22, accuracy: 90, type: 'logic', category: 'physical' },
  'AsyncWave': { power: 20, accuracy: 100, type: 'flow', category: 'special' },
  'CallbackStrike': { power: 26, accuracy: 85, type: 'flow', category: 'physical' },
  'PromiseChain': { power: 30, accuracy: 75, type: 'flow', category: 'special' },
  'Tackle': { power: 10, accuracy: 100, type: 'normal', category: 'physical' },
  'Recover': { power: 0, accuracy: 100, type: 'normal', category: 'status', isHealing: true },
  'Harden': { power: 0, accuracy: 100, type: 'normal', category: 'status', isDefensive: true }
};

class Codemon {
  constructor(species, level = 1) {
    this.species = species;
    this.level = level;
    this.exp = 0;
    this.expToLevel = species.expToLevel;
    this.hp = this.getMaxHp();
    this.currentHp = this.hp;
    this.moves = [...species.moves];
    this.stats = {
      atk: this.getAtk(),
      def: this.getDef(),
      sp: this.getSp(),
      spd: this.getSpd()
    };
    this.id = Math.random().toString(36).substr(2, 9);
  }

  getMaxHp() {
    return Math.floor((2 * this.species.baseHp * this.level) / 100 + this.level + 5);
  }

  getAtk() {
    return Math.floor((2 * this.species.baseAtk * this.level) / 100 + 5);
  }

  getDef() {
    return Math.floor((2 * this.species.baseDef * this.level) / 100 + 5);
  }

  getSp() {
    return Math.floor((2 * this.species.baseSp * this.level) / 100 + 5);
  }

  getSpd() {
    return Math.floor((2 * this.species.baseSpd * this.level) / 100 + 5);
  }

  learnMove(moveName) {
    if (this.moves.length < 4 && !this.moves.includes(moveName)) {
      this.moves.push(moveName);
    }
  }

  gainExp(amount) {
    this.exp += amount;
    while (this.exp >= this.expToLevel) {
      this.levelUp();
    }
  }

  levelUp() {
    this.exp -= this.expToLevel;
    this.level++;
    this.expToLevel = Math.floor(this.expToLevel * 1.1);
    this.hp = this.getMaxHp();
    this.currentHp = this.hp;
    this.stats.atk = this.getAtk();
    this.stats.def = this.getDef();
    this.stats.sp = this.getSp();
    this.stats.spd = this.getSpd();
  }

  takeDamage(damage) {
    this.currentHp = Math.max(0, this.currentHp - damage);
  }

  heal(amount) {
    this.currentHp = Math.min(this.hp, this.currentHp + amount);
  }

  getMove(moveName) {
    return MOVE_POOL[moveName];
  }
}

class Player {
  constructor() {
    this.level = 1;
    this.exp = 0;
    this.gold = 100;
    this.team = [];
    this.pokedex = new Set();
    this.items = {
      pokeball: 5,
      greatball: 2,
      potion: 3,
      antidote: 1
    };
  }

  addCodemon(codemon) {
    if (this.team.length < 6) {
      this.team.push(codemon);
      this.pokedex.add(codemon.species.id);
      return true;
    }
    return false;
  }

  getActiveCodemon() {
    return this.team.length > 0 ? this.team[0] : null;
  }

  switchCodemon(index) {
    if (index >= 0 && index < this.team.length && this.team[index].currentHp > 0) {
      [this.team[0], this.team[index]] = [this.team[index], this.team[0]];
      return true;
    }
    return false;
  }

  usePotion() {
    if (this.items.potion > 0) {
      const active = this.getActiveCodemon();
      if (active && active.currentHp < active.hp) {
        active.heal(20);
        this.items.potion--;
        return true;
      }
    }
    return false;
  }

  useItem(itemType) {
    if (this.items[itemType] > 0) {
      this.items[itemType]--;
      return true;
    }
    return false;
  }

  addGold(amount) {
    this.gold += amount;
  }

  addExp(amount) {
    this.exp += amount;
  }
}

window.Codemon = Codemon;
window.Player = Player;
window.CODEMON_SPECIES = CODEMON_SPECIES;
window.MOVE_POOL = MOVE_POOL;
