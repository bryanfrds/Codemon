// CodeMon Game - Main Game Loop & UI Manager

const AREAS = [
  {
    name: 'Null Pointer Meadow',
    bg: 'forest.png',
    desc: 'Where lost data roams freely.',
    possibleEncounters: Array.from({ length: 280 }, (_, i) => i + 1)
  },
  {
    name: 'Stack Overflow Hills',
    bg: 'hills.png',
    desc: 'Infinitely recursive terrain. Tread carefully.',
    possibleEncounters: Array.from({ length: 300 }, (_, i) => i + 241)
  },
  {
    name: 'Memory Leak Lake',
    bg: 'lake.png',
    desc: 'Haunted by creatures that never release resources.',
    possibleEncounters: Array.from({ length: 280 }, (_, i) => i + 501)
  },
  {
    name: 'Debug Canyon',
    bg: 'canyon.png',
    desc: 'Where broken logic comes to rest.',
    possibleEncounters: Array.from({ length: 260 }, (_, i) => i + 741)
  }
];

const SAVE_KEY = 'codemonSave';
const SAVE_VERSION = 1;          // bump if the saved shape changes

class CodemonGame {
  constructor() {
    this.player = new Player();
    this.battle = null;
    this.currentView = 'exploration';
    this.currentArea = 0;
    this.playerPos = { x: 250, y: 200 };      // where the sprite is drawn
    this.playerTarget = { x: 250, y: 200 };   // where it's walking to
    this.facing = 1;                          // 1 = right, -1 = left
    this.heldKeys = new Set();                // movement keys currently down
    this.lastKeyStep = 0;
    this.encounterChance = 0.05;
    this.autoPlay = false;        // the 🤖 AUTOPLAY button drives this
    // Battle effects: the move being animated, loose particles and floating
    // numbers, and the HP each creature is *shown* at until its hit lands.
    this.fx = { active: null, particles: [], texts: [], rings: [] };
    this.autoPlayTimer = null;

    // Canvas
    this.explorationCanvas = document.getElementById('explorationCanvas');
    this.battleCanvas = document.getElementById('battleCanvas');
    this.explorationCtx = this.explorationCanvas.getContext('2d');
    this.battleCtx = this.battleCanvas.getContext('2d');

    // Backdrop for both canvases. Decoded once; until it's ready the draws below
    // fall back to the flat colour, so nothing flickers on first paint.
    // One image per area, loaded on first use and kept. An area whose file is
    // missing falls back to the forest rather than drawing nothing.
    this.backdrops = new Map();
    this.backdropFallback = this.loadBackdrop('forest.png');

    // UI Elements
    this.explorationView = document.getElementById('explorationView');
    this.battleView = document.getElementById('battleView');
    this.teamList = document.getElementById('teamList');
    this.pokedexList = document.getElementById('pokedexList');
    this.battleLog = document.getElementById('battleLog');
    this.statusText = document.getElementById('statusText');
    this.catchModal = document.getElementById('catchModal');
    this.moveSelectModal = document.getElementById('moveSelectModal');

    this.initUI();
    this.startGame();
    this.gameLoop();

    setInterval(() => this.saveGame(), 15000);
    window.addEventListener('pagehide', () => this.saveGame());
    // Another tab started a new game: stop this one writing its old team back.
    window.addEventListener('storage', (e) => {
      // e.key is null when the other tab cleared all of localStorage at once.
      if (e.key === null || (e.key === SAVE_KEY && e.newValue === null)) {
        this.wiped = true;
        // Stop autoplay too: its next status line, 700ms later, hid this one.
        if (this.autoPlay) this.toggleAutoPlay();
        this.setStatus('New game started in another tab. This tab will no longer save.');
      }
    });
  }

  initUI() {
    // Navigation buttons
    document.getElementById('navExplore').addEventListener('click', () => this.switchView('exploration'));
    document.getElementById('navPokedex').addEventListener('click', () => this.switchView('pokedex'));
    document.getElementById('navTeam').addEventListener('click', () => this.switchView('team'));

    // Exploration controls
    document.getElementById('moveUpBtn').addEventListener('click', () => this.movePlayer(0, -20));
    document.getElementById('moveDownBtn').addEventListener('click', () => this.movePlayer(0, 20));
    document.getElementById('moveLeftBtn').addEventListener('click', () => this.movePlayer(-20, 0));
    document.getElementById('moveRightBtn').addEventListener('click', () => this.movePlayer(20, 0));
    document.getElementById('interactBtn').addEventListener('click', () => this.forceEncounter());

    // New game wipes the save, so it takes two clicks within 3 seconds. A
    // browser confirm() dialog would block the whole page instead.
    const newGameBtn = document.getElementById('newGameBtn');
    newGameBtn.addEventListener('click', () => {
      if (newGameBtn.classList.contains('confirming')) {
        // Stop everything that could save before the page is replaced: the
        // reload isn't instant, and autoplay would otherwise pick a starter and
        // save it with the old gold and items.
        this.wiped = true;
        clearInterval(this.autoPlayTimer);
        this.autoPlay = false;
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
        location.reload();
        return;
      }
      newGameBtn.classList.add('confirming');
      newGameBtn.textContent = 'Click again to wipe your save';
      setTimeout(() => {
        newGameBtn.classList.remove('confirming');
        newGameBtn.textContent = '↺ New game';
      }, 3000);
    });

    // Arrow keys / WASD. Held keys are stepped in the game loop, not on keydown,
    // so holding one walks at a steady pace instead of the OS key-repeat rate.
    const MOVE_KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0],
                        ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    this.moveKeys = MOVE_KEYS;
    window.addEventListener('keydown', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!MOVE_KEYS[k] || !this.canWalk()) return;
      e.preventDefault();                     // arrows would scroll the page
      this.heldKeys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      this.heldKeys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    window.addEventListener('blur', () => this.heldKeys.clear());
    document.getElementById('autoPlayBtn').addEventListener('click', () => this.toggleAutoPlay());

    // Battle actions
    document.getElementById('moveSelectBtn').addEventListener('click', () => this.showMoveSelect());
    document.getElementById('switchBtn').addEventListener('click', () => this.showSwitchTeam());
    document.getElementById('itemBtn').addEventListener('click', () => this.showItemMenu());
    document.getElementById('catchBtn').addEventListener('click', () => this.showCatchOptions());
    document.getElementById('runBtn').addEventListener('click', () => this.attemptFlee());

    // Modals
    document.getElementById('confirmCatchBtn').addEventListener('click', () => this.confirmCatch());
    document.getElementById('cancelCatchBtn').addEventListener('click', () => this.closeCatchModal());
    document.getElementById('closeMoveModalBtn').addEventListener('click', () => this.closeMoveModal());
    document.getElementById('navShop').addEventListener('click', () => this.openShop());
    document.getElementById('closeShopBtn').addEventListener('click', () =>
      document.getElementById('shopModal').classList.add('hidden'));

    // Area buttons
    document.querySelectorAll('.area-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => this.changeArea(idx));
    });
  }

  startGame() {
    // A saved run picks up where it left off; only a new one gets the picker.
    if (this.loadGame()) {
      this.updateTeamUI();
      this.updateStats();
      this.setStatus(this.loadedFromBlackout
        ? 'Welcome back. Your team had fainted, so you blacked out: healed, half your gold lost.'
        : `Welcome back! ${this.player.team[0].species.name} is ready to go.`);
      return;
    }
    // Default trio; "Show three others" swaps it for a random set.
    this.showStarters([1, 2, 5]);             // Byteling (bug), BitRiot (code), Flowy (flow)
    document.getElementById('rerollStartersBtn').onclick = () => this.rerollStarters();
    document.getElementById('starterModal').classList.remove('hidden');

    this.updateTeamUI();
    this.updateStats();
    this.setStatus('Choose your starter CodeMon to begin.');
  }

  /**
   * Three new options from the hand-named first 100, each a different type, and
   * never the same three as on screen now.
   */
  rerollStarters() {
    const current = new Set(this.starterIds || []);
    const pool = CODEMON_SPECIES.filter(s => s.id <= 100 && !current.has(s.id));
    const picked = [];
    const types = new Set();
    for (const s of pool.sort(() => Math.random() - 0.5)) {
      if (types.has(s.type)) continue;
      picked.push(s.id); types.add(s.type);
      if (picked.length === 3) break;
    }
    this.showStarters(picked);
  }

  showStarters(ids) {
    this.starterIds = ids;
    const box = document.getElementById('starterChoices');
    box.innerHTML = '';
    ids.forEach(id => {
      const species = CODEMON_SPECIES.find(s => s.id === id);
      const card = document.createElement('button');
      card.className = 'starter-card';
      card.dataset.speciesId = id;
      card.innerHTML = `
        ${SPRITES.imgFor(species, 88)}
        <span class="starter-name">${species.name}</span>
        <span class="starter-type">${species.type}</span>
        <span class="starter-moves">${species.moves.join(' · ')}</span>`;
      card.addEventListener('click', () => this.chooseStarter(species));
      box.appendChild(card);
    });
  }

  chooseStarter(species) {
    if (this.player.team.length) return;       // one pick per run
    this.player.addCodemon(new Codemon(species, 5));
    document.getElementById('starterModal').classList.add('hidden');
    this.updateTeamUI();
    this.updateStats();
    this.setStatus(`You chose ${species.name}! Press ENCOUNTER to find wild CodeMons.`);
    this.saveGame();
  }

  // View Management
  switchView(view) {
    this.currentView = view;
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    if (view === 'exploration') {
      this.explorationView.classList.remove('hidden');
      document.getElementById('navExplore').classList.add('active');
    } else if (view === 'pokedex') {
      document.getElementById('pokedexView').classList.remove('hidden');
      document.getElementById('navPokedex').classList.add('active');
      this.updatePokedex();
    } else if (view === 'team') {
      this.battleView.classList.remove('hidden');
      document.getElementById('navTeam').classList.add('active');
    } else if (view === 'battle') {
      // startEncounter() asks for this view. Without a branch here, the line above
      // hides every section and nothing is shown again, so the screen goes blank
      // the moment a wild CodeMon appears.
      this.battleView.classList.remove('hidden');
    }
  }

  changeArea(areaIdx) {
    this.currentArea = areaIdx;
    const area = AREAS[areaIdx];
    document.getElementById('areaName').textContent = area.name;
    document.getElementById('areaDesc').textContent = area.desc;

    document.querySelectorAll('.area-btn').forEach((btn, idx) => {
      if (idx === areaIdx) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    this.playerPos = { x: 250, y: 200 };
    this.playerTarget = { x: 250, y: 200 };  // or it glides back to the old spot
    this.saveGame();
    this.setStatus(`Entered ${area.name}.`);
  }

  // Movement
  movePlayer(dx, dy) {
    // Moves the target; the sprite glides there in renderExploration. Setting the
    // drawn position directly made every step a 20px teleport.
    if (dx) this.facing = dx < 0 ? -1 : 1;   // up/down keep the last facing
    this.playerTarget.x = Math.max(20, Math.min(480, this.playerTarget.x + dx));
    this.playerTarget.y = Math.max(20, Math.min(380, this.playerTarget.y + dy));

    // Random encounter
    if (Math.random() < this.encounterChance) {
      this.startEncounter();
    }
  }

  forceEncounter() {
    this.startEncounter();
  }

  startEncounter() {
    if (this.player.team.length === 0) {
      this.setStatus('No CodeMons to battle!');
      return;
    }

    const area = AREAS[this.currentArea];
    const speciesId = area.possibleEncounters[Math.floor(Math.random() * area.possibleEncounters.length)];
    const species = CODEMON_SPECIES.find(s => s.id === speciesId);
    // Wild level follows your lead's level, adjusted for how strong the species
    // is: a species with better base stats than the starters comes in a few
    // levels lower, so the fight is close rather than even-on-paper. Plain
    // "same level" lost ~80% of fights, because most wild species out-stat the
    // starters. Tuned by simulating 900 fights per setting: roughly 65% wins
    // early on, falling to ~20% in Debug Canyon with only a starter.
    const lead = this.player.getActiveCodemon();
    const total = (sp) => sp.baseHp + sp.baseAtk + sp.baseDef + sp.baseSp + sp.baseSpd;
    const starterTotal = [1, 2, 5]
      .map(id => total(CODEMON_SPECIES.find(sp => sp.id === id)))
      .reduce((a, b) => a + b) / 3;
    const jitter = Math.floor(Math.random() * 3) - 1;
    const enemyLevel = Math.max(1, Math.round(
      (lead.level + jitter) * 0.95 * Math.sqrt(starterTotal / total(species))));
    const enemy = new Codemon(species, enemyLevel);

    this.battle = new BattleState(this.player.getActiveCodemon(), enemy);
    // The shop is closed during fights; shut it if autoplay walked into one.
    document.getElementById('shopModal').classList.add('hidden');
    this.fx = { active: null, particles: [], texts: [], rings: [] };
    this.switchView('battle');
    this.updateBattleUI();
    this.setStatus(`Wild ${enemy.species.name} appeared!`);
  }

  // Battle
  updateBattleUI() {
    const playerCodemon = this.battle.playerCodemon;
    const enemyCodemon = this.battle.enemyCodemon;

    document.getElementById('allyName').textContent = playerCodemon.species.name;
    document.getElementById('enemyName').textContent = `Wild ${enemyCodemon.species.name}`;

    this.updateHPBar('playerCodemon', playerCodemon);
    this.updateHPBar('enemyCodemon', enemyCodemon);

    // Clear and update battle log
    this.battleLog.innerHTML = '';
    this.battle.getLog().slice(-6).forEach(msg => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.textContent = msg;
      this.battleLog.appendChild(entry);
    });
    this.battleLog.scrollTop = this.battleLog.scrollHeight;
  }

  updateHPBar(type, codemon) {
    const hp = this.shownHpFor(codemon);
    const hpPercent = (hp / codemon.hp) * 100;
    if (type === 'playerCodemon') {
      document.getElementById('allyHpBar').style.width = `${hpPercent}%`;
      document.getElementById('allyHpText').textContent = `HP: ${hp}/${codemon.hp}`;
    } else {
      document.getElementById('enemyHpBar').style.width = `${hpPercent}%`;
      document.getElementById('enemyHpText').textContent = `HP: ${hp}/${codemon.hp}`;
    }
  }

  /** True while a fight is on and can still take an action. */
  battleActive() {
    return !!this.battle && !this.battle.battleOver;
  }

  showMoveSelect() {
    if (!this.battleActive()) return;   // buttons stay up during the 2s end-of-fight pause
    const moveList = document.getElementById('moveList');
    moveList.innerHTML = '';

    this.battle.playerCodemon.moves.forEach(move => {
      const moveData = MOVE_POOL[move];
      const btn = document.createElement('button');
      btn.className = 'move-btn';
      btn.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>${move}</span>
          <span class="move-power">Power: ${moveData.power || '—'}</span>
        </div>
        ${this.matchupNote(moveData)}
      `;
      btn.addEventListener('click', () => {
        // The picker can still be open when the fight ends underneath it.
        if (!this.battleActive()) { this.closeMoveModal(); return; }
        this.battle.playerAttack(move);
        this.closeMoveModal();
        this.updateBattleUI();
        this.checkBattleStatus();
      });
      moveList.appendChild(btn);
    });

    this.moveSelectModal.classList.remove('hidden');
  }

  closeMoveModal() {
    this.moveSelectModal.classList.add('hidden');
  }

  /** The shop. Closed during a fight, so you can't restock mid-battle. */
  openShop() {
    if (this.battle) {
      this.setStatus('Finish the fight before going shopping.');
      return;
    }
    this.renderShop();
    document.getElementById('shopModal').classList.remove('hidden');
  }

  renderShop() {
    const names = { pokeball: '🔴 Pokéball', greatball: '🟡 Great Ball', potion: '💊 Potion' };
    document.getElementById('shopGold').textContent = this.player.gold;
    const list = document.getElementById('shopList');
    list.innerHTML = '';
    for (const [kind, price] of Object.entries(SHOP_PRICES)) {
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML = `
        <span class="shop-item">${names[kind] || kind}</span>
        <span class="shop-owned">have ${this.player.items[kind] || 0}</span>
        <button class="btn btn-primary shop-buy"${this.player.gold < price ? ' disabled' : ''}>
          Buy · ${price}g
        </button>`;
      row.querySelector('button').addEventListener('click', () => {
        // Autoplay can start a fight while the shop is open; checking only on
        // open let you keep buying mid-battle.
        if (this.battle) {
          document.getElementById('shopModal').classList.add('hidden');
          this.setStatus('Finish the fight before going shopping.');
          return;
        }
        if (!this.player.buy(kind)) return;
        this.updateStats();
        this.saveGame();
        this.setStatus(`Bought a ${(names[kind] || kind).replace(/^\S+ /, '')} for ${price} gold.`);
        this.renderShop();
      });
      list.appendChild(row);
    }
  }

  showSwitchTeam() {
    if (!this.battleActive()) return;   // buttons stay up during the 2s end-of-fight pause
    const moveList = document.getElementById('moveList');
    moveList.innerHTML = '';

    this.player.team.forEach((codemon, idx) => {
      if (codemon.currentHp === 0) return;
      const btn = document.createElement('button');
      btn.className = 'move-btn';
      btn.textContent = `${codemon.species.name} (Lvl ${codemon.level})`;
      btn.addEventListener('click', () => {
        if (idx !== 0) {
          this.player.switchCodemon(idx);
          this.battle.playerCodemon = this.player.getActiveCodemon();
          this.battle.addLog(`Switched to ${this.battle.playerCodemon.species.name}!`);
          this.battle.enemyTurn();
        }
        this.closeMoveModal();
        this.updateBattleUI();
        this.checkBattleStatus();
      });
      moveList.appendChild(btn);
    });

    this.moveSelectModal.classList.remove('hidden');
  }

  showItemMenu() {
    if (!this.battleActive()) return;   // buttons stay up during the 2s end-of-fight pause
    const moveList = document.getElementById('moveList');
    moveList.innerHTML = '';

    if (this.player.items.potion > 0) {
      const btn = document.createElement('button');
      btn.className = 'move-btn';
      btn.textContent = `Potion (${this.player.items.potion})`;
      btn.addEventListener('click', () => {
        if (!this.battleActive()) { this.closeMoveModal(); return; }
        this.player.usePotion();
        this.battle.addLog('Used potion! Recovered 20 HP.');
        this.battle.enemyTurn();
        this.closeMoveModal();
        this.updateBattleUI();
        this.checkBattleStatus();
      });
      moveList.appendChild(btn);
    }

    this.moveSelectModal.classList.remove('hidden');
  }

  showCatchOptions() {
    if (!this.battleActive()) return;   // buttons stay up during the 2s end-of-fight pause
    const info = document.getElementById('catchCreatureInfo');
    const enemy = this.battle.enemyCodemon;
    const probability = this.battle.calculateCatchProbability('pokeball');

    info.innerHTML = `
      <div class="catch-creature-info">
        <div class="catch-icon">${SPRITES.imgFor(enemy.species, 56)}</div>
        <div class="catch-stats">
          <div class="catch-stat"><strong class="catch-stat-value">${enemy.species.name}</strong></div>
          <div class="catch-stat">Level: <strong class="catch-stat-value">${enemy.level}</strong></div>
          <div class="catch-stat">HP: <strong class="catch-stat-value">${enemy.currentHp}/${enemy.hp}</strong></div>
          <div class="catch-stat">Catch Rate: <strong class="catch-stat-value">${Math.min(100, Math.floor(probability))}%</strong></div>
        </div>
      </div>
    `;

    this.catchModal.classList.remove('hidden');
  }

  confirmCatch() {
    if (!this.battleActive()) return;   // buttons stay up during the 2s end-of-fight pause
    const ballType = this.player.items.pokeball > 0 ? 'pokeball' : 'greatball';
    if (this.player.useItem(ballType)) {
      const success = this.battle.attemptCatch(ballType);
      this.updateBattleUI();

      if (success) {
        const newCodemon = new Codemon(this.battle.enemyCodemon.species, this.battle.enemyCodemon.level);
        this.player.addCodemon(newCodemon);
        this.player.addGold(30);
        this.closeCatchModal();
        this.endBattle();
      } else {
        this.closeCatchModal();
        // A failed throw gives the foe a free hit, which can knock your CodeMon
        // out. Without this the fight never ended: no switch, no blackout.
        this.checkBattleStatus();
      }
    }
  }

  closeCatchModal() {
    this.catchModal.classList.add('hidden');
  }

  attemptFlee() {
    if (!this.battleActive()) return;   // buttons stay up during the 2s end-of-fight pause
    const success = this.battle.flee();
    this.updateBattleUI();

    if (success) {
      this.endBattle();
    } else {
      // Same as a failed catch: the foe's free hit may have ended the fight.
      this.checkBattleStatus();
    }
  }

  checkBattleStatus() {
    // Once a finished fight has its endBattle (and maybe blackOut) scheduled,
    // further calls do nothing. A click during the 2s pause used to schedule a
    // second round: double gold and EXP for a win, gold halved twice for a loss.
    if (this.battle.resolved) return;
    if (this.battle.battleOver) {
      if (this.battle.playerWon) {
        // enemyCodemon.exp is the enemy's *earned* exp, which is always 0 for a
        // freshly spawned wild CodeMon — so every win awarded 0 and nothing ever
        // levelled up. Award based on what the enemy was worth instead.
        const enemy = this.battle.enemyCodemon;
        const exp = Math.max(1, Math.floor(enemy.level * 8 + enemy.species.baseHp * 0.5));
        this.battle.playerCodemon.gainExp(exp);
        this.player.addGold(50);
        this.battle.addLog(`Gained ${exp} EXP and 50 Gold!`);
        this.updateBattleUI();
        this.setStatus(`Won battle! Gained ${exp} EXP.`);
        this.battle.resolved = true;
        const won = this.battle;
        // Only end the fight this timer was set for, never a newer one.
        setTimeout(() => { if (this.battle === won) this.endBattle(); }, 2000);
      } else {
        this.setStatus('Your CodeMon fainted!');
        const availableCodemon = this.player.team.find(c => c.currentHp > 0);
        if (availableCodemon) {
          this.battle.playerCodemon = availableCodemon;
          this.battle.battleOver = false;
          this.battle.log = [];
          this.updateBattleUI();
        } else {
          this.setStatus('All CodeMons fainted!');
          this.battle.resolved = true;
          const lost = this.battle;
          setTimeout(() => {
            if (this.battle !== lost) return;
            this.endBattle();
            this.blackOut();
          }, 2000);
        }
      }
    }
  }

  /**
   * Saved in localStorage under SAVE_KEY. Only what can't be rebuilt is stored:
   * each creature's species, level, exp and HP (stats and moves come back from
   * the species), plus gold, items, Pokedex and the current area.
   */
  saveGame() {
    if (!this.player.team.length) return;       // nothing chosen yet
    // Never mid-fight. A save in the 2 s between the last faint and the blackout
    // stored an all-fainted team and dodged the gold penalty. Every checkpoint
    // save runs after endBattle clears this.battle, so none are lost. (Reloading
    // mid-fight still rewinds to the last save; the README says so.)
    if (this.battle) return;
    if (this.wiped) return;                     // New game is in progress
    const data = {
      v: SAVE_VERSION,
      gold: this.player.gold,
      items: this.player.items,
      pokedex: [...this.player.pokedex],
      area: this.currentArea,
      team: this.player.team.map(c => ({
        species: c.species.id, level: c.level, exp: c.exp,
        expToLevel: c.expToLevel, hp: c.currentHp,
      })),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
  }

  /**
   * Restore a save. Returns false if there's none, or it's unreadable, from an old
   * version, or malformed - in which case the game starts fresh.
   *
   * Everything is validated because this runs inside the constructor: a throw
   * here stopped the game loop and timers from ever starting, and the bad save
   * then broke every later reload the same way.
   */
  loadGame() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!data || data.v !== SAVE_VERSION || !Array.isArray(data.team)) return false;

      const speciesById = (id) => CODEMON_SPECIES.find(sp => sp.id === id);
      const team = data.team.map(t => {
        const species = t && speciesById(t.species);
        if (!species || !Number.isInteger(t.level) || t.level < 1 || t.level > 100) return null;
        const c = new Codemon(species, t.level);
        // Never below the species' starting threshold, which only grows with
        // levels, and exp below it. A tiny expToLevel either looped gainExp's
        // `while (exp >= expToLevel)` forever or shot one win up hundreds of
        // levels, past the level check above, so the next load dropped the team.
        if (Number.isInteger(t.expToLevel) && t.expToLevel >= c.expToLevel) c.expToLevel = t.expToLevel;
        if (Number.isFinite(t.exp) && t.exp >= 0) c.exp = Math.min(Math.floor(t.exp), c.expToLevel - 1);
        c.currentHp = Number.isFinite(t.hp) ? Math.max(0, Math.min(c.hp, Math.round(t.hp))) : c.hp;
        return c;
      }).filter(Boolean);
      if (!team.length) return false;           // e.g. every species was removed

      let gold = Number.isFinite(data.gold) && data.gold >= 0 ? Math.floor(data.gold) : this.player.gold;
      // Saved with everyone fainted (older saves could be): treat it as the
      // blackout it would have been, heal and dock the gold.
      this.loadedFromBlackout = false;
      if (team.every(c => c.currentHp <= 0)) {
        team.forEach(c => { c.currentHp = c.hp; });
        gold = Math.floor(gold / 2);
        this.loadedFromBlackout = true;
      }

      // Battles send out team[0], so lead with someone who can fight.
      const firstReady = team.findIndex(c => c.currentHp > 0);
      if (firstReady > 0) team.unshift(...team.splice(firstReady, 1));

      this.player.team = team;
      this.player.gold = gold;
      // Only item kinds the game knows, and only whole non-negative counts.
      for (const k of Object.keys(this.player.items)) {
        const n = data.items && data.items[k];
        if (Number.isInteger(n) && n >= 0) this.player.items[k] = n;
      }
      // Drop Pokedex ids for species that no longer exist; they crashed the
      // Pokedex screen and inflated the caught count.
      const dex = Array.isArray(data.pokedex) ? data.pokedex : [];
      this.player.pokedex = new Set(
        [...dex, ...team.map(c => c.species.id)].filter(id => speciesById(id)));

      if (Number.isInteger(data.area) && data.area >= 0 && data.area < AREAS.length) {
        this.changeArea(data.area);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Whole team fainted: heal everyone and dock half the gold, like the games this
   * is modelled on. Without it a wiped team had no way back - nothing outside a
   * potion restores HP, so every later fight was an instant loss.
   */
  blackOut() {
    this.player.team.forEach(c => { c.currentHp = c.hp; });
    const lost = Math.floor(this.player.gold / 2);
    this.player.gold -= lost;
    this.updateTeamUI();
    this.updateStats();
    this.setStatus(`You blacked out and lost ${lost} gold. Your team has been healed.`);
    this.saveGame();
  }

  endBattle() {
    this.battle = null;
    this.updateTeamUI();
    this.updateStats();
    this.switchView('exploration');
    this.setStatus('Battle ended.');
    this.saveGame();
  }

  // UI Updates
  updateTeamUI() {
    this.teamList.innerHTML = '';

    if (this.player.team.length === 0) {
      this.teamList.innerHTML = '<div class="empty-state">No CodeMons in your team.</div>';
      return;
    }

    this.player.team.forEach((codemon, idx) => {
      const slot = document.createElement('div');
      slot.className = `team-slot ${idx === 0 ? 'active' : ''}`;
      slot.innerHTML = `
        <div class="creature-avatar">${SPRITES.imgFor(codemon.species, 32)}</div>
        <div class="creature-info">
          <div class="creature-name">${codemon.species.name}</div>
          <div class="creature-level">Lvl ${codemon.level} | HP: ${codemon.currentHp}/${codemon.hp}</div>
        </div>
      `;
      this.teamList.appendChild(slot);
    });
  }

  updatePokedex() {
    this.pokedexList.innerHTML = '';

    if (this.player.pokedex.size === 0) {
      this.pokedexList.innerHTML = '<div class="empty-state">No CodeMons caught yet!</div>';
      return;
    }

    this.player.pokedex.forEach(speciesId => {
      const species = CODEMON_SPECIES.find(s => s.id === speciesId);
      const entry = document.createElement('div');
      entry.className = 'pokedex-entry';
      entry.innerHTML = `
        <div class="pokedex-icon">${SPRITES.imgFor(species, 48)}</div>
        <div class="pokedex-name">#${species.id} ${species.name}</div>
        <div class="pokedex-type">${species.type}</div>
      `;
      this.pokedexList.appendChild(entry);
    });
  }

  updateStats() {
    document.getElementById('playerLevel').textContent = this.player.level;
    document.getElementById('caughtCount').textContent = `${this.player.pokedex.size}/${CODEMON_SPECIES.length}`;
    document.getElementById('goldCount').textContent = this.player.gold;
    document.getElementById('pokeballCount').textContent = this.player.items.pokeball;
    document.getElementById('greatballCount').textContent = this.player.items.greatball;
    document.getElementById('potionCount').textContent = this.player.items.potion;
  }

  setStatus(message) {
    this.statusText.textContent = message;
  }

  loadBackdrop(file) {
    if (this.backdrops.has(file)) return this.backdrops.get(file);
    const img = new Image();
    img.src = 'assets/bg/' + file;
    img.addEventListener('error', () => { img.failed = true; });
    this.backdrops.set(file, img);
    return img;
  }

  /** The backdrop for the area you're standing in. */
  currentBackdrop() {
    const area = AREAS[this.currentArea];
    const img = this.loadBackdrop((area && area.bg) || 'forest.png');
    if (img.failed || (!img.complete && !img.naturalWidth)) {
      return this.backdropFallback.complete ? this.backdropFallback : null;
    }
    return img;
  }

  /** Draw the area's backdrop to fill `ctx`, cropping rather than squashing. */
  drawBackdrop(ctx, canvas, fallback) {
    const img = this.currentBackdrop();
    if (!img || !img.complete || !img.naturalWidth) {
      ctx.fillStyle = fallback;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // Cover-fit: scale to the larger ratio and centre, so the art keeps its
    // proportions and the canvas never shows a gap.
    const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.imageSmoothingEnabled = false;          // it's pixel art, keep it sharp
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  // Rendering
  /** A line under a move button saying how it fares against the current foe. */
  matchupNote(moveData) {
    if (!moveData || !moveData.power) return '';
    const e = typeEffectiveness(moveData.type, this.battle.enemyCodemon.species.type);
    if (e > 1) return '<div class="move-matchup good">Super effective</div>';
    if (e < 1) return '<div class="move-matchup bad">Not very effective</div>';
    return '';
  }

  toggleAutoPlay() {
    this.autoPlay = !this.autoPlay;
    const btn = document.getElementById('autoPlayBtn');
    btn.textContent = `🤖 AUTOPLAY: ${this.autoPlay ? 'ON' : 'OFF'}`;
    btn.classList.toggle('btn-primary', this.autoPlay);
    if (this.autoPlay) {
      // Steps on a timer rather than per animation frame: at 60fps it would
      // blur through a whole battle before you could read the log.
      this.autoPlayTimer = setInterval(() => this.autoPlayStep(), 700);
      this.setStatus('Autoplay on. It explores, fights and catches by itself.');
    } else {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
      this.setStatus('Autoplay off.');
    }
  }

  /** One decision. Deliberately simple: heal if hurt, fight, sometimes catch. */
  autoPlayStep() {
    if (!this.autoPlay) return;
    // Let the last exchange finish animating; otherwise moves queue up faster
    // than they can be shown and the picture falls further and further behind.
    if (this.fxBusy()) return;
    if (!this.player.team.length) {
      const cards = document.querySelectorAll('#starterChoices .starter-card');
      if (cards.length) cards[Math.floor(Math.random() * cards.length)].click();
      return;
    }

    if (this.battle && !this.battle.battleOver) {
      const me = this.battle.playerCodemon;
      // Max HP is `hp` on a Codemon, not `maxHp` - reading the wrong one gives
      // NaN, every comparison is false, and it fights on at 0 HP with a full bag.
      if (me.currentHp / me.hp < 0.45 && this.player.items.potion > 0) {
        this.player.usePotion();
        this.battle.addLog('Used potion! Recovered 20 HP.');
        this.battle.enemyTurn();
        this.updateBattleUI();
        this.checkBattleStatus();
        return;
      }
      // Worth a ball when it's weakened and the team has room.
      const enemy = this.battle.enemyCodemon;
      const weak = enemy.currentHp / enemy.hp < 0.4;
      if (weak && this.player.items.pokeball > 0 && this.player.team.length < 6
          && Math.random() < 0.5) {
        this.confirmCatch();
        return;
      }
      // Mostly the move expected to hit hardest against this foe's type, with
      // the odd random pick so it doesn't spam one move every fight.
      const moves = me.moves;
      const expected = (m) => {
        const d = MOVE_POOL[m];
        return d ? d.power * d.accuracy * typeEffectiveness(d.type, enemy.species.type) : 0;
      };
      const best = moves.reduce((a, b) => (expected(b) > expected(a) ? b : a));
      this.battle.playerAttack(Math.random() < 0.75 ? best
                               : moves[Math.floor(Math.random() * moves.length)]);
      this.updateBattleUI();
      this.checkBattleStatus();
      return;
    }

    // A finished fight stays in this.battle for the 2s before endBattle/blackOut
    // run. Acting in that gap bought potions just before blackOut healed the team
    // for free, and could start a new fight under the old one. Wait it out.
    if (this.battle) return;

    // Out of battle: put the team back on its feet before picking another fight.
    // startEncounter only checks the team isn't empty, not that anyone can stand.
    if (this.currentView !== 'exploration') this.switchView('exploration');
    const fit = this.player.team.find(c => c.currentHp > 0);
    if (!fit) {
      if (this.player.items.potion > 0) {
        this.player.usePotion();
        this.updateTeamUI();
        this.setStatus('Autoplay: used a potion to get back up.');
      } else {
        this.setStatus('Autoplay stopped: the whole team has fainted.');
        this.toggleAutoPlay();
      }
      return;
    }
    if (this.player.getActiveCodemon().currentHp <= 0) {
      this.player.team = [fit, ...this.player.team.filter(c => c !== fit)];
      this.updateTeamUI();
      return;
    }
    // Restock between fights, one item per step (see nextRestock).
    const restock = nextRestock(this.player);
    if (restock && this.player.buy(restock)) {
      this.updateStats();
      this.saveGame();
      this.setStatus(`Autoplay: bought a ${restock === 'potion' ? 'Potion' : 'Pokéball'} from the shop.`);
      return;
    }
    if (Math.random() < 0.3) {
      this.startEncounter();
      return;
    }
    // Wander in straight runs of a few steps, turning at walls, rather than
    // picking a fresh direction every step - that just jittered on the spot.
    const step = 20;
    const dirs = [[0, -step], [0, step], [-step, 0], [step, 0]];
    const t = this.playerTarget;
    const blocked = (d) => (t.x + d[0] < 20 || t.x + d[0] > 480 ||
                            t.y + d[1] < 20 || t.y + d[1] > 380);
    if (!this.wanderDir || !this.wanderLeft || blocked(this.wanderDir)) {
      const open = dirs.filter(d => !blocked(d));
      this.wanderDir = open[Math.floor(Math.random() * open.length)];
      this.wanderLeft = 3 + Math.floor(Math.random() * 5);
    }
    this.wanderLeft--;
    this.movePlayer(this.wanderDir[0], this.wanderDir[1]);
  }

  /** Walking only makes sense on the map, with no fight or dialog open. */
  canWalk() {
    return this.currentView === 'exploration' && !this.battle &&
           !document.querySelector('.modal:not(.hidden)') && this.player.team.length > 0;
  }

  gameLoop() {
    // One step per 110 ms while a movement key is held.
    const now = performance.now();
    if (this.heldKeys.size && this.canWalk() && now - this.lastKeyStep > 110) {
      this.lastKeyStep = now;
      let dx = 0, dy = 0;
      this.heldKeys.forEach(k => { dx += this.moveKeys[k][0]; dy += this.moveKeys[k][1]; });
      if (dx || dy) this.movePlayer(Math.sign(dx) * 20, Math.sign(dy) * 20);
    }
    if (!this.canWalk()) this.heldKeys.clear();   // a fight started mid-walk
    this.renderExploration();
    this.renderBattle();
    requestAnimationFrame(() => this.gameLoop());
  }

  renderExploration() {
    this.explorationCtx.clearRect(0, 0, this.explorationCanvas.width, this.explorationCanvas.height);

    // Background
    this.drawBackdrop(this.explorationCtx, this.explorationCanvas, '#1a2030');

    // Grid
    // Barely-there grid: it's a movement aid, and at full strength it fought
    // the artwork underneath.
    this.explorationCtx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    this.explorationCtx.lineWidth = 0.5;
    for (let x = 0; x < this.explorationCanvas.width; x += 20) {
      this.explorationCtx.beginPath();
      this.explorationCtx.moveTo(x, 0);
      this.explorationCtx.lineTo(x, this.explorationCanvas.height);
      this.explorationCtx.stroke();
    }
    for (let y = 0; y < this.explorationCanvas.height; y += 20) {
      this.explorationCtx.beginPath();
      this.explorationCtx.moveTo(0, y);
      this.explorationCtx.lineTo(this.explorationCanvas.width, y);
      this.explorationCtx.stroke();
    }

    // Glide toward the target: a fixed fraction of the remaining distance per
    // frame, so it eases in and settles instead of snapping.
    this.playerPos.x += (this.playerTarget.x - this.playerPos.x) * 0.22;
    this.playerPos.y += (this.playerTarget.y - this.playerPos.y) * 0.22;

    // Player: the lead CodeMon's sprite, so you can see who you're walking around
    // with instead of an anonymous dot.
    const lead = this.player.getActiveCodemon();
    const ctx = this.explorationCtx;
    // Mirror the sprite around its own centre when walking left.
    ctx.save();
    ctx.translate(this.playerPos.x, this.playerPos.y);
    ctx.scale(this.facing, 1);
    const drawn = lead && SPRITES.draw(ctx, lead.species, 0, 0, 34);
    ctx.restore();
    if (!drawn) {
      this.explorationCtx.fillStyle = '#38bdf8';
      this.explorationCtx.beginPath();
      this.explorationCtx.arc(this.playerPos.x, this.playerPos.y, 8, 0, Math.PI * 2);
      this.explorationCtx.fill();
    }
  }

  /**
   * HP to display: the value from before the first move involving this creature
   * that hasn't landed yet. The rules resolve instantly, so without this the
   * bars would drop before the attack is even shown.
   */
  shownHpFor(codemon) {
    const pending = [];
    if (this.fx.active && !this.fx.active.landed) pending.push(this.fx.active.ev);
    if (this.battle) pending.push(...this.battle.events);
    for (const ev of pending) {
      if (ev.target === codemon) return ev.targetHpBefore;
      if (ev.user === codemon) return ev.userHpBefore;
    }
    return codemon.currentHp;
  }

  /** True while a move is animating or waiting to. */
  fxBusy() {
    return !!(this.fx.active || (this.battle && this.battle.events.length));
  }

  typeColor(move) {
    const t = (MOVE_POOL[move] || {}).type;
    return { bug: '#7ed957', code: '#ff8c38', memory: '#ff8fd0', logic: '#a59bff',
             flow: '#38bdf8' }[t] || '#f1f5f9';
  }

  /**
   * Advance the effect timeline and return per-side draw offsets and filters.
   * Each move plays for FX_MS: the user lunges, then at IMPACT the target reacts
   * and its HP bar drops.
   */
  stepFx(now, pos) {
    const FX_MS = 620, IMPACT = 0.34;
    const out = { player: { dx: 0, dy: 0, filter: 'none' },
                  enemy:  { dx: 0, dy: 0, filter: 'none' } };

    if (!this.fx.active && this.battle.events.length) {
      const ev = this.battle.events.shift();
      this.fx.active = { ev, t0: now, landed: false };
    }

    const a = this.fx.active;
    if (a) {
      const { ev } = a;
      const p = Math.min(1, (now - a.t0) / FX_MS);
      const me = ev.side, them = me === 'player' ? 'enemy' : 'player';
      const from = pos[me], to = pos[them];
      const color = this.typeColor(ev.move);

      if (ev.kind === 'heal' || ev.kind === 'buff') {
        // Self-targeted: a glow and rising sparks, no lunge.
        out[me].filter = `brightness(${1 + 0.6 * Math.sin(p * Math.PI)})`;
        if (!a.landed && p >= IMPACT) {
          a.landed = true;
          this.burst(from.x, from.y, ev.kind === 'heal' ? '#4ade80' : '#60a5fa', 12, -1);
          this.floatText(from.x, from.y - from.r,
                         ev.kind === 'heal' ? `+${ev.userHp - ev.userHpBefore}` : 'DEF UP',
                         ev.kind === 'heal' ? '#4ade80' : '#60a5fa');
          this.updateBattleUI();
        }
      } else {
        // Lunge toward the target and back, peaking just before impact.
        if (p < IMPACT * 1.6) {
          const k = Math.sin((p / (IMPACT * 1.6)) * Math.PI);
          out[me].dx = (to.x - from.x) * 0.18 * k;
          out[me].dy = (to.y - from.y) * 0.18 * k;
        }
        if (!a.landed && p >= IMPACT) {
          a.landed = true;
          if (ev.kind === 'hit') {
            this.burst(to.x, to.y, color, 18, 0);
            this.fx.rings.push({ x: to.x, y: to.y, color, t0: now });
            this.floatText(to.x, to.y - to.r, `-${ev.damage}`, '#ff5a5a');
            // Above the number, so both read at once.
            if (ev.effectiveness > 1) this.floatText(to.x, to.y - to.r - 22, 'SUPER EFFECTIVE', '#facc15', 12);
            else if (ev.effectiveness < 1) this.floatText(to.x, to.y - to.r - 22, 'NOT VERY EFFECTIVE', '#94a3b8', 12);
          } else {
            this.floatText(to.x, to.y - to.r, 'MISS', '#cbd5e1');
          }
          this.updateBattleUI();
        }
        if (p >= IMPACT) {
          const q = (p - IMPACT) / (1 - IMPACT);          // 0..1 after impact
          if (ev.kind === 'hit') {
            out[them].dx = Math.sin(q * 38) * 7 * (1 - q);   // shake, dying out
            // Blink white for the first part of the reaction.
            if (q < 0.45 && Math.floor(q * 12) % 2 === 0) out[them].filter = 'brightness(3.2)';
          } else {
            out[them].dx = Math.sin(q * Math.PI) * 22;        // sidestep a miss
          }
        }
      }

      if (p >= 1) {
        this.fx.active = null;
        this.updateBattleUI();
      }
    }
    return out;
  }

  burst(x, y, color, n, lift) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      this.fx.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + lift * 2,
                               life: 1, size: 2 + Math.random() * 3, color });
    }
  }

  floatText(x, y, text, color, size = 20) {
    this.fx.texts.push({ x, y, text, color, size, life: 1 });
  }

  /** Particles, impact rings and damage numbers, drawn over the creatures. */
  drawFxOverlay(ctx, now) {
    this.fx.rings = this.fx.rings.filter(r => {
      const t = (now - r.t0) / 320;
      if (t >= 1) return false;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 12 + t * 48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return true;
    });

    this.fx.particles = this.fx.particles.filter(pt => {
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.12; pt.life -= 0.03;
      if (pt.life <= 0) return false;
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
      ctx.globalAlpha = 1;
      return true;
    });

    ctx.save();
    ctx.textAlign = 'center';
    const w = ctx.canvas.width;
    this.fx.texts = this.fx.texts.filter(t => {
      t.life -= 0.018;
      if (t.life <= 0) return false;
      ctx.font = `bold ${t.size}px "Press Start 2P", monospace`;
      // Keep long labels inside the canvas; the foe stands near the right edge
      // and top, and the label above its damage number would drift off both.
      const half = ctx.measureText(t.text).width / 2 + 4;
      const x = Math.max(half, Math.min(w - half, t.x));
      const rise = Math.min((1 - t.life) * 46, t.y - t.size - 2);
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0b0f17';
      ctx.strokeText(t.text, x, t.y - rise);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, t.y - rise);
      return true;
    });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  renderBattle() {
    if (!this.battle) return;

    this.battleCtx.clearRect(0, 0, this.battleCanvas.width, this.battleCanvas.height);

    // Background
    this.drawBackdrop(this.battleCtx, this.battleCanvas, '#0a0e14');
    // The forest is bright and the sprites are small; a dark wash keeps them
    // readable without hiding the art.
    this.battleCtx.fillStyle = 'rgba(6, 10, 18, 0.32)';
    this.battleCtx.fillRect(0, 0, this.battleCanvas.width, this.battleCanvas.height);

    // Classic battle staging: the enemy stands back and up, yours is nearer the
    // camera and larger, each on an oval of shadow so they sit on the ground.
    const ctx = this.battleCtx;
    const W = this.battleCanvas.width;
    const H = this.battleCanvas.height;

    const platform = (cx, cy, rx) => {
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#08130a';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // Sized off the canvas height so a taller battle scene gets bigger creatures.
    const enemySize = Math.round(H * 0.30);
    const allySize = Math.round(H * 0.40);      // bigger because it's closer
    const ex = W * 0.70, ey = H * 0.32;
    const ax = W * 0.27, ay = H * 0.70;

    const now = performance.now();
    const fx = this.stepFx(now, {
      enemy:  { x: ex, y: ey, r: enemySize / 2 },
      player: { x: ax, y: ay, r: allySize / 2 },
    });

    platform(ex, ey + enemySize * 0.40, enemySize * 0.40);
    ctx.filter = fx.enemy.filter;
    SPRITES.draw(ctx, this.battle.enemyCodemon.species,
                 ex + fx.enemy.dx, ey + fx.enemy.dy, enemySize);
    ctx.filter = 'none';

    platform(ax, ay + allySize * 0.38, allySize * 0.40);
    ctx.filter = fx.player.filter;
    SPRITES.draw(ctx, this.battle.playerCodemon.species,
                 ax + fx.player.dx, ay + fx.player.dy, allySize);
    ctx.filter = 'none';

    this.drawFxOverlay(ctx, now);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new CodemonGame();
});
