import { describe, it, expect, beforeEach } from 'vitest';
import { GameLogic } from './GameLogic.js';

describe('FlowerPots GameLogic', () => {
  let logic: GameLogic;

  beforeEach(() => {
    logic = new GameLogic();
    logic.init();
  });

  it('initializes correctly with 2 pots active, 2 locked, and queue populated', () => {
    expect(logic.pots.length).toBe(2);
    expect(logic.lockedSlots.has(2)).toBe(true);
    expect(logic.lockedSlots.has(3)).toBe(true);
    expect(logic.queue.length).toBe(18);
  });

  it('adds score when adding to pot', () => {
    const p1 = logic.pots[0];
    const initialScore = logic.score;
    const initialCount = p1.count;
    
    const result = logic.addToPot(p1, 1000);
    expect(result.completed).toBe(false);
    expect(p1.count).toBe(initialCount + 1);
    expect(logic.score).toBe(initialScore + 10);
  });

  it('completes pot and triggers combo', () => {
    const p1 = logic.pots[0];
    logic.addToPot(p1, 1000);
    logic.addToPot(p1, 1000);
    logic.addToPot(p1, 1000);
    let result = logic.addToPot(p1, 1000);

    expect(result.completed).toBe(true);
    expect(logic.score).toBe(40 + 50); // 4*10 + 50 bonus
    expect(result.combo).toBe(1);

    logic.removeTopPot(p1);
    expect(logic.pots.length).toBe(2); // replenished
    
    const p2 = logic.pots[1];
    logic.addToPot(p2, 1500);
    logic.addToPot(p2, 1500);
    logic.addToPot(p2, 1500);
    result = logic.addToPot(p2, 2000);
    
    expect(result.completed).toBe(true);
    expect(result.combo).toBe(2);
  });

  it('checkGameOver is true only when pots and queue are empty', () => {
      expect(logic.checkGameOver()).toBe(false);
      logic.pots = [];
      expect(logic.checkGameOver()).toBe(false);
      logic.queue = [];
      expect(logic.checkGameOver()).toBe(true);
  });
});