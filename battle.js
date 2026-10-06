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
    // Set by the game once a finished fight's ending is scheduled (checkBattleStatus).
    this.resolved = false;
    this.winner = null;
    this.playerWon = false;
    // One entry per move used, for the renderer to animate in order. The rules
    // resolve instantly; the screen replays them one at a time.
    this.events = [];
    // Harden stacks for the rest of this battle only, not on the creature.
    this.defBoost = { player: 1, enemy: 1 };
  }

  /** A trainer's next CodeMon takes the fainted one's place, and the fight goes on. */
  sendOutEnemy(codemon) {
    this.enemyCodemon = codemon;
    this.enemySpeed = codemon.stats.spd;
    this.defBoost.enemy = 1;   // Harden belonged to the one that fainted
    this.battleOver = false;
    this.winner = null;
    this.playerWon = false;
  }

  determineOrder() {
    // Faster creature goes first
    return this.playerSpeed >= this.enemySpeed ? 'player' : 'enemy';
  }

  calculateDamage(attacker, defender, move, defMultiplier = 1, effectiveness = 1) {
    const moveData = MOVE_POOL[move];
    if (!moveData) return 0;

    const baseDamage = moveData.power;
    const random = 0.85 + Math.random() * 0.15;

    const def = defender.stats.def * defMultiplier;
    let damage = Math.floor((2 * attacker.level / 5 + 2) * baseDamage * (attacker.stats.atk / def) / 50 + 2);
    damage = Math.floor(damage * effectiveness * random);

    // Accuracy check
    if (Math.random() * 100 > moveData.accuracy) {
      return 0;
    }

    return Math.max(1, damage);
  }

  /**
   * Resolve one move for `side` ('player' or 'enemy') and record what happened.
   * Status moves (power 0) used to fall through the damage formula, whose
   * Math.max(1, ...) floor made Harden and Recover deal 1 damage.
   */
  performMove(side, move) {
    const user = side === 'player' ? this.playerCodemon : this.enemyCodemon;
    const target = side === 'player' ? this.enemyCodemon : this.playerCodemon;
    const other = side === 'player' ? 'enemy' : 'player';
    const data = MOVE_POOL[move];
    const name = user.species.name;
    // HP before the move, so the screen can hold the bars here until it lands.
    const userHpBefore = user.currentHp;
    const targetHpBefore = target.currentHp;

    if (data && data.power === 0) {
      let what = 'did nothing';
      let kind = 'buff';
      if (data.isHealing) {
        const amount = Math.max(1, Math.floor(user.hp * 0.25));
        user.heal(amount);
        what = `recovered ${amount} HP`;
        kind = 'heal';
      } else if (data.isDefensive) {
        this.defBoost[side] *= 1.25;
        what = 'raised its defence';
      }
      this.log.push(`${name} used ${move}! It ${what}.`);
      this.events.push({ side, move, kind, user, target, userHpBefore, targetHpBefore,
                         userHp: user.currentHp, targetHp: target.currentHp });
      return 0;
    }

    // Worked out once here, so the damage and the log line can't disagree.
    const effectiveness = data ? typeEffectiveness(data.type, target.species.type) : 1;
    const damage = this.calculateDamage(user, target, move, this.defBoost[other], effectiveness);
    target.takeDamage(damage);
    const verdict = effectiveness > 1 ? " It's super effective!"
                  : effectiveness < 1 ? " It's not very effective." : '';
    this.log.push(damage === 0 ? `${name}'s ${move} missed!`
                               : `${name} used ${move}! Dealt ${damage} damage.${verdict}`);
    this.events.push({ side, move, kind: damage === 0 ? 'miss' : 'hit', damage, effectiveness,
                       user, target, userHpBefore, targetHpBefore,
                       userHp: user.currentHp, targetHp: target.currentHp });
    return damage;
  }

  playerAttack(moveName) {
    // Nothing happens in a finished fight; see checkBattleStatus in game.js.
    if (this.battleOver) return false;
    if (!this.playerCodemon.moves.includes(moveName)) return false;

    this.performMove('player', moveName);

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
    this.performMove('enemy', this.enemyCodemon.moves[moveIdx]);

    if (this.playerCodemon.currentHp <= 0) {
      this.battleOver = true;
      this.winner = 'enemy';
      this.playerWon = false;
      this.log.push(`${this.playerCodemon.species.name} fainted!`);
    }
  }

  playerUsePotion(amount = 20) {
    if (this.battleOver) return;
    this.playerCodemon.heal(amount);
    this.log.push(`Used potion! ${this.playerCodemon.species.name} recovered ${amount} HP.`);
    this.enemyTurn();
  }

  playerSwitch(newCodemon) {
    if (this.battleOver) return;
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
    if (this.battleOver) return false;
    const probability = this.calculateCatchProbability(ballType);
    const success = Math.random() * 100 < probability;

    if (success) {
      this.log.push(`Caught ${this.enemyCodemon.shiny ? 'a shiny ' : ''}${this.enemyCodemon.species.name}!`);
      this.battleOver = true;
      this.winner = 'caught';
    } else {
      this.log.push(`${ballType} failed!`);
      this.enemyTurn();
    }

    return success;
  }

  flee() {
    if (this.battleOver) return false;
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
