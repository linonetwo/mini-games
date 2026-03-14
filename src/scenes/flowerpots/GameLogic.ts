// Keep it decoupled from Phaser
import { POT_CAP, POT_SLOTS, QUEUE_SIZE } from './config.js';
import { ALL_FLOWER_TYPES } from '../../types/index.js';
import type { FlowerType } from '../../types/index.js';

export interface BasePot {
  type: FlowerType;
  capacity: number;
  count: number;
  slotIndex: number;
}

export class GameLogic {
  public queue: { type: FlowerType; capacity: number }[] = [];
  public pots: BasePot[] = [];
  public lockedSlots: Set<number> = new Set([2, 3]);
  
  public score = 0;
  public combo = 0;
  private comboTimer = 0;
  public gameOver = false;

  init(): void {
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.gameOver = false;
    this.lockedSlots.clear();
    this.lockedSlots.add(2);
    this.lockedSlots.add(3);
    this.buildQueue();
  }

  buildQueue(): void {
    this.queue = [];
    const types = [...ALL_FLOWER_TYPES];
    for (let i = 0; i < QUEUE_SIZE; i++) {
      const type = types[Math.floor(Math.random() * types.length)] as FlowerType;
      this.queue.push({ type, capacity: POT_CAP });
    }

    this.pots = [];
    for (let s = 0; s < POT_SLOTS; s++) {
      if (this.lockedSlots.has(s)) continue;
      const q = this.queue.shift();
      if (!q) break;
      this.pots.push({ ...q, count: 0, slotIndex: s });
    }
  }

  getPot(type: FlowerType): BasePot | undefined {
      return this.pots.find(p => p.type === type);
  }

  addToPot(pot: BasePot, timestamp: number): { completed: boolean, combo: number, addScore: number } {
    if (pot.count >= pot.capacity) return { completed: true, combo: this.combo, addScore: 0 };

    pot.count++;
    let addScore = 10;
    this.score += addScore;

    let completed = false;
    let currentCombo = this.combo;

    if (pot.count >= pot.capacity) {
      completed = true;
      addScore += 50;
      this.score += 50;

      if (timestamp - this.comboTimer < 3000) {
        this.combo++;
      } else {
        this.combo = 1;
      }
      this.comboTimer = timestamp;
      currentCombo = this.combo;
    }

    return { completed, combo: currentCombo, addScore };
  }

  removeTopPot(pot: BasePot): void {
    this.pots = this.pots.filter(p => p !== pot);
    const slotIndex = pot.slotIndex;
    
    if (slotIndex >= 2) {
      this.lockedSlots.add(slotIndex);
    } else {
      if (this.queue.length > 0) {
        const q = this.queue.shift()!;
        this.pots.push({ ...q, count: 0, slotIndex });
      }
    }
  }

  checkGameOver(): boolean {
    if (this.gameOver) return true;
    if (this.pots.length === 0 && this.queue.length === 0) {
        this.gameOver = true;
        return true;
    }
    return false;
  }
}