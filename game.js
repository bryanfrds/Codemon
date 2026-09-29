// CodeMon Game - Main Game Loop & UI Manager

const AREAS = [
  {
    name: 'Route 404: ERROR ZONE',
    desc: 'A zone where lost data roams freely.',
    possibleEncounters: [1, 2, 3]
  },
  {
    name: 'Stack Overflow Hills',
    desc: 'Infinitely recursive terrain. Tread carefully.',
    possibleEncounters: [2, 4, 5]
  },
  {
    name: 'Memory Leak Lake',
    desc: 'Haunted by creatures that never release resources.',
    possibleEncounters: [3, 4, 5]
  },
  {
    name: 'Debug Canyon',
    desc: 'Where broken logic comes to rest.',
    possibleEncounters: [2, 3, 4]
  }
];

class CodemonGame {
  constructor() {
    this.player = new Player();
    this.battle = null;
    this.currentView = 'exploration';
    this.currentArea = 0;
    this.playerPos = { x: 250, y: 200 };
    this.encounterChance = 0.05;

    // Canvas
    this.explorationCanvas = document.getElementById('explorationCanvas');
    this.battleCanvas = document.getElementById('battleCanvas');
    this.explorationCtx = this.explorationCanvas.getContext('2d');
    this.battleCtx = this.battleCanvas.getContext('2d');

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

    // Area buttons
    document.querySelectorAll('.area-btn').forEach((btn, idx) => {
      btn.addEventListener('click', () => this.changeArea(idx));
    });
  }

  startGame() {
    // Give player starter Codemon
    const starterSpecies = CODEMON_SPECIES[0];
    const starter = new Codemon(starterSpecies, 5);
    this.player.addCodemon(starter);

    this.updateTeamUI();
    this.updateStats();
    this.setStatus('Ready to explore! Press ENCOUNTER to find wild CodeMons.');
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
    this.setStatus(`Entered ${area.name}.`);
  }

  // Movement
  movePlayer(dx, dy) {
    this.playerPos.x = Math.max(20, Math.min(480, this.playerPos.x + dx));
    this.playerPos.y = Math.max(20, Math.min(380, this.playerPos.y + dy));

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
    const enemyLevel = Math.max(1, this.player.level + Math.floor(Math.random() * 3) - 1);
    const enemy = new Codemon(species, enemyLevel);

    this.battle = new BattleState(this.player.getActiveCodemon(), enemy);
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
    const hpPercent = (codemon.currentHp / codemon.hp) * 100;
    if (type === 'playerCodemon') {
      document.getElementById('allyHpBar').style.width = `${hpPercent}%`;
      document.getElementById('allyHpText').textContent = `HP: ${codemon.currentHp}/${codemon.hp}`;
    } else {
      document.getElementById('enemyHpBar').style.width = `${hpPercent}%`;
      document.getElementById('enemyHpText').textContent = `HP: ${codemon.currentHp}/${codemon.hp}`;
    }
  }

  showMoveSelect() {
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
      `;
      btn.addEventListener('click', () => {
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

  showSwitchTeam() {
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
    const moveList = document.getElementById('moveList');
    moveList.innerHTML = '';

    if (this.player.items.potion > 0) {
      const btn = document.createElement('button');
      btn.className = 'move-btn';
      btn.textContent = `Potion (${this.player.items.potion})`;
      btn.addEventListener('click', () => {
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
    const info = document.getElementById('catchCreatureInfo');
    const enemy = this.battle.enemyCodemon;
    const probability = this.battle.calculateCatchProbability('pokeball');

    info.innerHTML = `
      <div class="catch-creature-info">
        <div class="catch-icon">${enemy.species.icon}</div>
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
      }
    }
  }

  closeCatchModal() {
    this.catchModal.classList.add('hidden');
  }

  attemptFlee() {
    const success = this.battle.flee();
    this.updateBattleUI();

    if (success) {
      this.endBattle();
    }
  }

  checkBattleStatus() {
    if (this.battle.battleOver) {
      if (this.battle.playerWon) {
        const exp = Math.floor(this.battle.enemyCodemon.exp * 1.5);
        this.battle.playerCodemon.gainExp(exp);
        this.player.addGold(50);
        this.battle.addLog(`Gained ${exp} EXP and 50 Gold!`);
        this.updateBattleUI();
        this.setStatus(`Won battle! Gained ${exp} EXP.`);
        setTimeout(() => this.endBattle(), 2000);
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
          setTimeout(() => this.endBattle(), 2000);
        }
      }
    }
  }

  endBattle() {
    this.battle = null;
    this.updateTeamUI();
    this.updateStats();
    this.switchView('exploration');
    this.setStatus('Battle ended.');
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
        <div class="creature-avatar">${codemon.species.icon}</div>
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
        <div class="pokedex-icon">${species.icon}</div>
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

  // Rendering
  gameLoop() {
    this.renderExploration();
    this.renderBattle();
    requestAnimationFrame(() => this.gameLoop());
  }

  renderExploration() {
    this.explorationCtx.clearRect(0, 0, this.explorationCanvas.width, this.explorationCanvas.height);

    // Background
    this.explorationCtx.fillStyle = '#1a2030';
    this.explorationCtx.fillRect(0, 0, this.explorationCanvas.width, this.explorationCanvas.height);

    // Grid
    this.explorationCtx.strokeStyle = '#2a3a50';
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

    // Player
    this.explorationCtx.fillStyle = '#38bdf8';
    this.explorationCtx.beginPath();
    this.explorationCtx.arc(this.playerPos.x, this.playerPos.y, 8, 0, Math.PI * 2);
    this.explorationCtx.fill();

    // Border
    this.explorationCtx.strokeStyle = '#38bdf8';
    this.explorationCtx.lineWidth = 2;
    this.explorationCtx.beginPath();
    this.explorationCtx.arc(this.playerPos.x, this.playerPos.y, 8, 0, Math.PI * 2);
    this.explorationCtx.stroke();
  }

  renderBattle() {
    if (!this.battle) return;

    this.battleCtx.clearRect(0, 0, this.battleCanvas.width, this.battleCanvas.height);

    // Background
    this.battleCtx.fillStyle = '#0a0e14';
    this.battleCtx.fillRect(0, 0, this.battleCanvas.width, this.battleCanvas.height);

    // Enemy side
    this.battleCtx.fillStyle = '#ef4444';
    this.battleCtx.font = '24px "Press Start 2P"';
    this.battleCtx.fillText(this.battle.enemyCodemon.species.icon, 400, 50);

    // Player side
    this.battleCtx.fillStyle = '#10b981';
    this.battleCtx.fillText(this.battle.playerCodemon.species.icon, 50, 250);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new CodemonGame();
});
