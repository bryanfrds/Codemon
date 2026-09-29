// Turn-Based Battle Engine

class BattleState {
  constructor(playerCodemon, enemyCodemon) {
    this.playerCodemon = playerCodemon;
    this.enemyCodemon = enemyCodemon;
    this.turn = 0;
    this.playerSpeed = playerCodemon.stats.spd;
    this.enemySpeed = enemyCodemon.stats.spd;
    this.log = [];
    this.battleOver = false;
    this.winner = null;
    this.playerWon = false;
  }

  determineOrder() {
    // Faster creature goes first
    return this.playerSpeed >= this.enemySpeed ? 'player' : 'enemy';
  }

  calculateDamage(attacker, defender, move) {
    const moveData = MOVE_POOL[move];
    if (!moveData) return 0;

    const baseDamage = moveData.power;
    const effectiveness = 1.0; // Simplified type effectiveness
    const random = 0.85 + Math.random() * 0.15;

    let damage = Math.floor((2 * attacker.level / 5 + 2) * baseDamage * (attacker.stats.atk / defender.stats.def) / 50 + 2);
    damage = Math.floor(damage * effectiveness * random);

    // Accuracy check
    if (Math.random() * 100 > moveData.accuracy) {
      return 0;
    }

    return Math.max(1, damage);
  }

  playerAttack(moveName) {
    if (!this.playerCodemon.moves.includes(moveName)) return false;

    const damage = this.calculateDamage(this.playerCodemon, this.enemyCodemon, moveName);
    this.enemyCodemon.takeDamage(damage);

    this.log.push(`${this.playerCodemon.species.name} used ${moveName}! Dealt ${damage} damage.`);

    if (damage === 0) {
      this.log[this.log.length - 1] = `${this.playerCodemon.species.name}'s ${moveName} missed!`;
    }

    if (this.enemyCodemon.currentHp <= 0) {
      this.battleOver = true;
      this.winner = 'player';
      this.playerWon = true;
      this.log.push(`${this.enemyCodemon.species.name} fainted!`);
      return true;
    }

    this.enemyTurn();
    return true;
  }

  enemyTurn() {
    if (this.battleOver) return;

    const moveIdx = Math.floor(Math.random() * this.enemyCodemon.moves.length);
    const move = this.enemyCodemon.moves[moveIdx];

    const damage = this.calculateDamage(this.enemyCodemon, this.playerCodemon, move);
    this.playerCodemon.takeDamage(damage);

    this.log.push(`${this.enemyCodemon.species.name} used ${move}! Dealt ${damage} damage.`);

    if (damage === 0) {
      this.log[this.log.length - 1] = `${this.enemyCodemon.species.name}'s ${move} missed!`;
    }

    if (this.playerCodemon.currentHp <= 0) {
      this.battleOver = true;
      this.winner = 'enemy';
      this.playerWon = false;
      this.log.push(`${this.playerCodemon.species.name} fainted!`);
    }
  }

  playerUsePotion(amount = 20) {
    this.playerCodemon.heal(amount);
    this.log.push(`Used potion! ${this.playerCodemon.species.name} recovered ${amount} HP.`);
    this.enemyTurn();
  }

  playerSwitch(newCodemon) {
    this.playerCodemon = newCodemon;
    this.log.push(`Switched to ${newCodemon.species.name}!`);
    this.enemyTurn();
  }

  calculateCatchProbability(ballType = 'pokeball') {
    // Simplified catch probability based on HP ratio
    const hpRatio = this.enemyCodemon.currentHp / this.enemyCodemon.hp;
    let catchRate = this.enemyCodemon.species.catchRate;

    if (ballType === 'greatball') {
      catchRate *= 1.5;
    }

    const probability = catchRate * (3 * this.enemyCodemon.hp - 2 * this.enemyCodemon.currentHp) / (3 * this.enemyCodemon.hp);
    return Math.min(100, probability);
  }

  attemptCatch(ballType = 'pokeball') {
    const probability = this.calculateCatchProbability(ballType);
    const success = Math.random() * 100 < probability;

    if (success) {
      this.log.push(`Caught ${this.enemyCodemon.species.name}!`);
      this.battleOver = true;
      this.winner = 'caught';
    } else {
      this.log.push(`${ballType} failed!`);
      this.enemyTurn();
    }

    return success;
  }

  flee() {
    // Escape attempt based on speed
    const escapeChance = (this.playerSpeed / this.enemySpeed) * 100;
    const success = Math.random() * 100 < escapeChance;

    if (success) {
      this.log.push('Fled successfully!');
      this.battleOver = true;
      this.winner = 'fled';
    } else {
      this.log.push('Could not escape!');
      this.enemyTurn();
    }

    return success;
  }

  getLog() {
    return this.log;
  }

  addLog(message) {
    this.log.push(message);
  }
}

window.BattleState = BattleState;
