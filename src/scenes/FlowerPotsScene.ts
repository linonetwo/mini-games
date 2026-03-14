/**
 * FlowerPotsScene — 花园花盆配对游戏
 *
 * 布局：
 *  - HUD 条 (顶部)
 *  - 4 个花盆槽位 (顶部区域)
 *  - 6×4 花朵网格 (底部区域)
 *
 * 玩法：
 *  1. 点击花朵 → 若有匹配花盆 → 花朵飞入花盆 → 花盆计数+1
 *  2. 花盆装满 → 消失动画 → 从左侧补入新花盆，其余花盆右移
 *  3. 每次正确放置报读花名（语音文件可选）
 *  4. 无效点击触发轻微震动 + 音效
 */

import Phaser from 'phaser';
import {
  ALL_FLOWER_TYPES, FLOWER_COLORS, FLOWER_NAMES,
} from '../types/index.js';
import type { FlowerType } from '../types/index.js';
import { AudioManager }  from '../systems/AudioManager.js';
import { ScoreService }  from '../systems/ScoreService.js';
import { SaveService }   from '../systems/SaveService.js';
import { GameOverOverlay } from '../ui/GameOverOverlay.js';

const GRID_COLS  = 6;
const GRID_ROWS  = 4;
const POT_SLOTS  = 4;
const POT_CAP    = 4;   // flowers per pot
const QUEUE_SIZE = 20;  // pre-generated pot queue

interface CellData {
  type: FlowerType; row: number; col: number;
  container: Phaser.GameObjects.Container | null;
}

interface PotData {
  type: FlowerType; capacity: number; count: number; slotIndex: number;
  container: Phaser.GameObjects.Container | null;
  countText: Phaser.GameObjects.Text | null;
  dotGraphics: Phaser.GameObjects.Graphics | null;
}

export class FlowerPotsScene extends Phaser.Scene {
  // ── layout params (recalculated on resize) ───────────────────────────────
  private _W = 0; private _H = 0;
  private _hudH      = 0;
  private _potAreaH  = 0;
  private _potY      = 0;
  private _gridTop   = 0;
  private _cellW     = 0; private _cellH = 0;
  private _gridLeft  = 0; private _gridTop2 = 0;

  // ── state ────────────────────────────────────────────────────────────────
  private _cells: CellData[][] = [];
  private _pots: PotData[]     = [];
  private _lockedSlots: Set<number> = new Set([2, 3]);
  private _queue: Array<{ type: FlowerType; capacity: number }> = [];
  private _score      = 0;
  private _combo      = 0;
  private _comboTimer = 0;
  private _flying     = false;  // throttle: one animation at a time
  private _gameOver   = false;
  private _startTime  = 0;

  // ── graphics layers ──────────────────────────────────────────────────────
  private _bgGraphics!: Phaser.GameObjects.Graphics;
  private _potLayer!:   Phaser.GameObjects.Container;
  private _gridLayer!:  Phaser.GameObjects.Container;
  private _scoreText!:  Phaser.GameObjects.Text;
  private _comboText!:  Phaser.GameObjects.Text;

  constructor() { super({ key: 'FlowerPotsScene' }); }

  // ── init/preload ──────────────────────────────────────────────────────────

  init(): void {
    this._score = 0; this._combo = 0; this._comboTimer = 0;
    this._flying = false; this._gameOver = false;
    this._startTime = Date.now();
    this._lockedSlots.clear();
    this._lockedSlots.add(2);
    this._lockedSlots.add(3);
  }

  create(): void {
    AudioManager.getInstance().unlock();
    this._lockedSlots.clear();
    this._lockedSlots.add(2);
    this._lockedSlots.add(3);
    this._buildQueue();
    this._calcLayout();
    this._buildScene();
    this.events.on('hud:back', this._onBack, this);
    this.scale.on('resize', this._onResize, this);
  }

  // ── layout helpers ────────────────────────────────────────────────────────

  private _calcLayout(): void {
    this._W = this.scale.width;
    this._H = this.scale.height;
    this._hudH     = Math.max(44, this._H * 0.07);
    this._potAreaH = Math.max(110, this._H * 0.22);
    this._potY     = this._hudH + this._potAreaH / 2;
    this._gridTop  = this._hudH + this._potAreaH + 8;

    const gridH   = this._H - this._gridTop - 4;
    this._cellW   = Math.floor((this._W - 16) / GRID_COLS);
    this._cellH   = Math.floor(gridH / GRID_ROWS);
    this._gridLeft = (this._W - this._cellW * GRID_COLS) / 2;
    this._gridTop2 = this._gridTop;
  }

  private _onResize(): void {
    if (this._gameOver) return;
    this._calcLayout();
    // Full rebuild
    this._bgGraphics?.destroy();
    this._potLayer?.destroy();
    this._gridLayer?.destroy();
    this._scoreText?.destroy();
    this._comboText?.destroy();
    this._buildScene();
  }

  // ── scene construction ────────────────────────────────────────────────────

  private _buildScene(): void {
    const W = this._W, H = this._H;

    // Background
    this._bgGraphics = this.add.graphics();
    this._bgGraphics.fillStyle(0x0d3320, 1);
    this._bgGraphics.fillRect(0, 0, W, H);
    if (this.textures.exists('bg-flowerpots')) {
      const img = this.add.image(W / 2, H / 2, 'bg-flowerpots');
      img.setScale(Math.max(W / img.width, H / img.height)).setAlpha(0.15);
    }

    // HUD bar
    const hg = this.add.graphics();
    hg.fillStyle(0x000000, 0.5);
    hg.fillRect(0, 0, W, this._hudH);

    const backBtn = this.add.text(10, this._hudH / 2, '◀ 返回', {
      fontSize: `${Math.max(12, this._hudH * 0.32)}px`, color: '#a5d6a7', fontFamily: 'Arial',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this._onBack());

    this._scoreText = this.add.text(W / 2, this._hudH / 2, `得分: ${this._score}`, {
      fontSize: `${Math.max(14, this._hudH * 0.38)}px`,
      color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(W - 10, this._hudH / 2, `Lv.${ScoreService.getInstance().level}`, {
      fontSize: `${Math.max(11, this._hudH * 0.28)}px`, color: '#ffd54f', fontFamily: 'Arial',
    }).setOrigin(1, 0.5);

    // Divider
    const dg = this.add.graphics();
    dg.lineStyle(1, 0x5dbb63, 0.4);
    dg.lineBetween(8, this._hudH + this._potAreaH + 4, W - 8, this._hudH + this._potAreaH + 4);

    // Pot layer
    this._potLayer  = this.add.container(0, 0);
    this._gridLayer = this.add.container(0, 0);

    this._comboText = this.add.text(W / 2, this._hudH + this._potAreaH + 28, '', {
      fontSize: '22px', color: '#ff8f00', fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    this._buildPots();
    this._buildGrid();
  }

  // ── queue & pots ──────────────────────────────────────────────────────────

  private _buildQueue(): void {
    this._queue = [];
    const types = [...ALL_FLOWER_TYPES];
    for (let i = 0; i < QUEUE_SIZE; i++) {
      const type = types[Math.floor(Math.random() * types.length)] as FlowerType;
      this._queue.push({ type, capacity: POT_CAP });
    }

    this._pots = [];
    for (let s = 0; s < POT_SLOTS; s++) {
      if (this._lockedSlots.has(s)) continue;
      const q = this._queue.shift();
      if (!q) break;
      this._pots.push({ ...q, count: 0, slotIndex: s, container: null, countText: null, dotGraphics: null });
    }
  }

  private _buildPots(): void {
    this._potLayer.removeAll(true);
    const potW  = Math.min((this._W - 24) / POT_SLOTS, 90);
    const potH  = Math.min(this._potAreaH - 16, 100);
    const gap   = (this._W - POT_SLOTS * potW) / (POT_SLOTS + 1);

    // Render active pots
    this._pots.forEach((pot) => {
      const i = pot.slotIndex;
      const cx = gap * (i + 1) + potW * i + potW / 2;
      const cy = this._potY;
      pot.container = this._makePotContainer(pot, cx, cy, potW, potH);
      this._potLayer.add(pot.container);
    });

    // Render locked slots
    for (let i = 0; i < POT_SLOTS; i++) {
      if (this._lockedSlots.has(i)) {
        const cx = gap * (i + 1) + potW * i + potW / 2;
        const cy = this._potY;
        const c = this._makeLockedSlot(i, cx, cy, potW, potH);
        this._potLayer.add(c);
      }
    }
  }

  private _makeLockedSlot(slotIndex: number, cx: number, cy: number, potW: number, potH: number): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    const g = this.add.graphics();
    const bodyH = potH * 0.55, bodyW = potW * 0.8, rimH = potH * 0.12;

    g.fillStyle(0x1a472a, 0.5);
    g.fillRoundedRect(-bodyW / 2, -bodyH / 2 + rimH, bodyW, bodyH, 6);
    g.lineStyle(2, 0x000000, 0.3);
    g.strokeRoundedRect(-bodyW / 2, -bodyH / 2 + rimH, bodyW, bodyH, 6);

    const t = this.add.text(0, rimH, '🔒\n50分', {
      fontSize: `${Math.max(10, potW * 0.15)}px`,
      align: 'center', color: '#ffd54f', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);

    c.add([g, t]);
    c.setSize(bodyW, bodyH).setInteractive({ useHandCursor: true });
    
    // Bounce effect on hover
    c.on('pointerover', () => { c.setScale(1.05); });
    c.on('pointerout', () => { c.setScale(1); });
    c.on('pointerdown', () => this._unlockSlot(slotIndex, c));
    
    return c;
  }

  private _unlockSlot(slotIndex: number, container: Phaser.GameObjects.Container): void {
    if (this._score >= 50) {
      this._addScore(-50);
      this._lockedSlots.delete(slotIndex);
      AudioManager.getInstance().playSfx('levelup');

      if (this._queue.length === 0) {
        const types = [...ALL_FLOWER_TYPES];
        for (let i = 0; i < 10; i++) {
          const type = types[Math.floor(Math.random() * types.length)] as FlowerType;
          this._queue.push({ type, capacity: POT_CAP });
        }
      }
      const q = this._queue.shift()!;
      const newPot: PotData = { ...q, count: 0, slotIndex, container: null, countText: null, dotGraphics: null };
      this._pots.push(newPot);
      this._buildPots();
      this._checkGameOver();
    } else {
      AudioManager.getInstance().playSfx('error');
      this.tweens.add({ targets: container, x: container.x + 4, duration: 50, yoyo: true, repeat: 3 });
    }
  }

  private _makePotContainer(
    pot: PotData, cx: number, cy: number, potW: number, potH: number,
  ): Phaser.GameObjects.Container {
    const c   = this.add.container(cx, cy);
    const col = FLOWER_COLORS[pot.type];

    // Pot body
    const g = this.add.graphics();
    const bodyH = potH * 0.55, bodyW = potW * 0.8;
    const rimH  = potH * 0.12, rimW  = potW * 0.95;
    const baseH = potH * 0.08;

    // Pot base
    g.fillStyle(0x5d4037, 1);
    g.fillRoundedRect(-bodyW / 2, -bodyH / 2 + rimH, bodyW, bodyH, 6);
    // Rim
    g.fillStyle(0x795548, 1);
    g.fillRect(-rimW / 2, -bodyH / 2, rimW, rimH);
    // Base plate
    g.fillStyle(0x4e342e, 1);
    g.fillRect(-bodyW * 0.45, bodyH / 2 + rimH - bodyH, bodyW * 0.9, baseH);

    // Flower type indicator on pot
    const flowerImg = this._createFlowerImage(pot.type, 0, -bodyH * 0.05, potW * 0.16, 0x8d6e63);
    c.add([g, flowerImg]);

    // Flower name label
    c.add(this.add.text(0, -potH * 0.5 + rimH - 10, FLOWER_NAMES[pot.type], {
      fontSize: `${Math.max(9, potW * 0.13)}px`,
      color: '#ffffff', fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 1,
    }).setOrigin(0.5, 1));

    // Dot progress indicators
    const dotG = this.add.graphics();
    this._drawDots(dotG, pot, potW, bodyH);
    pot.dotGraphics = dotG;
    c.add(dotG);

    // Count text
    pot.countText = this.add.text(0, bodyH * 0.3, `${pot.count}/${pot.capacity}`, {
      fontSize: `${Math.max(9, potW * 0.12)}px`,
      color: '#fff9c4', fontFamily: 'Arial',
    }).setOrigin(0.5);
    c.add(pot.countText);

    // Color accent
    const accent = this.add.graphics();
    accent.lineStyle(2, col, 0.6);
    accent.strokeRoundedRect(-bodyW / 2, -bodyH / 2 + rimH, bodyW, bodyH, 6);
    c.add(accent);

    return c;
  }

  private _drawDots(g: Phaser.GameObjects.Graphics, pot: PotData, potW: number, bodyH: number): void {
    g.clear();
    const r = Math.max(4, potW * 0.07);
    const spacing = r * 2.5;
    const totalW  = spacing * (pot.capacity - 1);
    for (let i = 0; i < pot.capacity; i++) {
      const dx = -totalW / 2 + i * spacing;
      const dy = bodyH * 0.55;
      g.fillStyle(i < pot.count ? FLOWER_COLORS[pot.type] : 0x555555, 1);
      g.fillCircle(dx, dy, r);
    }
  }

  // ── grid ──────────────────────────────────────────────────────────────────

  private _buildGrid(): void {
    this._gridLayer.removeAll(true);
    this._cells = [];

    const types = this._weighedFlowerTypes();

    for (let r = 0; r < GRID_ROWS; r++) {
      this._cells[r] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const type = types[(r * GRID_COLS + c) % types.length] as FlowerType;
        const cell: CellData = { type, row: r, col: c, container: null };
        cell.container = this._makeCellContainer(cell);
        this._gridLayer.add(cell.container);
        this._cells[r][c] = cell;
      }
    }
  }

  /** Generate a type list that guarantees each active pot type has multiple flowers */
  private _weighedFlowerTypes(): FlowerType[] {
    const result: FlowerType[] = [];
    const potTypes = this._pots.map(p => p.type);
    // Add each pot type extra times
    potTypes.forEach(t => { for (let i = 0; i < 5; i++) result.push(t); });
    // Fill with random types
    while (result.length < GRID_COLS * GRID_ROWS) {
      result.push(ALL_FLOWER_TYPES[Math.floor(Math.random() * ALL_FLOWER_TYPES.length)] as FlowerType);
    }
    return Phaser.Utils.Array.Shuffle(result);
  }

  private _makeCellContainer(cell: CellData): Phaser.GameObjects.Container {
    const cw = this._cellW, ch = this._cellH;
    const cx = this._gridLeft + cell.col * cw + cw / 2;
    const cy = this._gridTop2 + cell.row * ch + ch / 2;
    const c  = this.add.container(cx, cy);

    const bg = this.add.graphics();
    const pad = 3;
    bg.fillStyle(0x1a472a, 1);
    bg.fillRoundedRect(-cw / 2 + pad, -ch / 2 + pad, cw - pad * 2, ch - pad * 2, 6);

    const flowerImg = this._createFlowerImage(cell.type, 0, 0, Math.min(cw, ch) * 0.32);

    c.add([bg, flowerImg]);
    c.setSize(cw - 6, ch - 6).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x2a5e3a, 1);
      bg.fillRoundedRect(-cw / 2 + pad, -ch / 2 + pad, cw - pad * 2, ch - pad * 2, 6);
      bg.lineStyle(2, FLOWER_COLORS[cell.type], 0.8);
      bg.strokeRoundedRect(-cw / 2 + pad, -ch / 2 + pad, cw - pad * 2, ch - pad * 2, 6);
    });
    c.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x1a472a, 1);
      bg.fillRoundedRect(-cw / 2 + pad, -ch / 2 + pad, cw - pad * 2, ch - pad * 2, 6);
    });
    c.on('pointerdown', () => this._onFlowerClick(cell));
    return c;
  }

  // ── interaction ───────────────────────────────────────────────────────────

  private _onFlowerClick(cell: CellData): void {
    if (this._flying || this._gameOver || !cell.container) return;

    const matchPot = this._pots.find(p => p.type === cell.type);
    if (!matchPot || !matchPot.container) {
      this._playError(cell.container);
      return;
    }

    this._flying = true;
    AudioManager.getInstance().playSfx('place');

    // Fly animation: from cell to pot
    const srcX = cell.container.x, srcY = cell.container.y;
    const dstX = matchPot.container.x, dstY = matchPot.container.y;

    // Create flying flower
    const flyImg = this._createFlowerImage(cell.type, 0, 0, Math.min(this._cellW, this._cellH) * 0.3);
    flyImg.setPosition(srcX, srcY);

    // Remove from grid immediately
    cell.container.setAlpha(0.3);

    this.tweens.add({
      targets: flyImg,
      x: dstX, y: dstY,
      scaleX: 0.5, scaleY: 0.5,
      duration: 380,
      ease: 'Quad.easeIn',
      onComplete: () => {
        flyImg.destroy();
        this._removeCellContainer(cell);
        this._addToPot(matchPot);
        this._flying = false;
      },
    });
  }

  private _removeCellContainer(cell: CellData): void {
    cell.container?.destroy();
    cell.container = null;
  }

  private _addToPot(pot: PotData): void {
    pot.count++;
    this._addScore(10);
    pot.dotGraphics && this._drawDots(pot.dotGraphics, pot,
      Math.min((this._W - 24) / POT_SLOTS, 90),
      Math.min(this._potAreaH - 16, 100) * 0.55);
    pot.countText?.setText(`${pot.count}/${pot.capacity}`);

    if (pot.count >= pot.capacity) {
      this.time.delayedCall(120, () => this._completePot(pot));
    } else {
      this._checkGameOver();
    }
  }

  private _completePot(pot: PotData): void {
    AudioManager.getInstance().playSfx('potcomplete');
    AudioManager.getInstance().playVoice(pot.type);
    this._addScore(50);
    this._showCombo();

    // Scale-up & fade-out the pot container
    if (pot.container) {
      this.tweens.add({
        targets: pot.container,
        scaleX: 1.3, scaleY: 1.3, alpha: 0,
        duration: 350, ease: 'Back.easeIn',
        onComplete: () => {
          pot.container?.destroy();
          pot.container = null;
            this._handlePotComplete(pot);
          },
        });
      }
    }

    private _handlePotComplete(removedPot: PotData): void {
      // Remove from active pots
      this._pots = this._pots.filter(p => p !== removedPot);

      const slotIndex = removedPot.slotIndex;
      if (slotIndex >= 2) {
        // High level slot: re-lock it
        this._lockedSlots.add(slotIndex);
      } else {
        // Base slot: replenish immediately
        if (this._queue.length === 0) {
          const types = [...ALL_FLOWER_TYPES];
          for (let i = 0; i < 10; i++) {
            const type = types[Math.floor(Math.random() * types.length)] as FlowerType;
            this._queue.push({ type, capacity: POT_CAP });
          }
        }
        const q = this._queue.shift()!;
        const newPot: PotData = { ...q, count: 0, slotIndex, container: null, countText: null, dotGraphics: null };
        this._pots.push(newPot);
      }
    this._checkGameOver();
  }

  private _showCombo(): void {
    const now = this.time.now;
    if (now - this._comboTimer < 3000) {
      this._combo++;
    } else {
      this._combo = 1;
    }
    this._comboTimer = now;

    if (this._combo >= 2) {
      AudioManager.getInstance().playSfx('combo');
      this._comboText.setText(`${this._combo}x 连击！`);
      this._comboText.setAlpha(1);
      this.tweens.killTweensOf(this._comboText);
      this.tweens.add({
        targets: this._comboText,
        alpha: 0, y: '-=30', duration: 1500, ease: 'Quad.easeOut',
        onComplete: () => { this._comboText.setAlpha(0); },
      });
      this._addScore(this._combo * 20);
    }
  }

  private _addScore(delta: number): void {
    this._score += delta;
    this._scoreText.setText(`得分: ${this._score}`);
  }

  private _playError(container: Phaser.GameObjects.Container): void {
    AudioManager.getInstance().playSfx('error');
    this.tweens.add({
      targets: container, x: container.x + 6, duration: 50, yoyo: true, repeat: 3,
    });
  }

  // ── game-over check ───────────────────────────────────────────────────────

  private _checkGameOver(): void {
    if (this._gameOver) return;

    // Check if any flower in grid matches any active pot
    let hasMatch = false;
    outer:
    for (const row of this._cells) {
      for (const cell of row) {
        if (!cell.container) continue;
        for (const pot of this._pots) {
          if (pot.type === cell.type) { hasMatch = true; break outer; }
        }
      }
    }

    // Also check if grid is fully cleared
    const anyCell = this._cells.flat().some(c => c.container !== null);
    if (!anyCell) {
      this._addScore(200); // bonus for clearing the board
      // Refill grid
      this._buildGrid();
      return;
    }

    if (!hasMatch && this._pots.length > 0) {
      // No moves possible
      this._endGame();
    }

    if (this._pots.length === 0 && this._queue.length === 0) {
      this._endGame();
    }
  }

  private _endGame(): void {
    if (this._gameOver) return;
    this._gameOver = true;
    const duration = Math.floor((Date.now() - this._startTime) / 1000);

    const save  = SaveService.getInstance();
    const score = ScoreService.getInstance();
    const result = score.submitResult({ gameId: 'flowerpots', score: this._score, duration });
    save.save(score.profile);

    this.time.delayedCall(500, () => {
      new GameOverOverlay(this).show({
        gameId: 'flowerpots',
        score: this._score,
        highScore: save.profile.games.flowerpots.highScore,
        ...result,
        onRestart: () => this.scene.restart(),
        onMenu:    () => this.scene.start('MainMenuScene'),
      });
    });
  }

  private _onBack(): void {
    if (this._gameOver) return;
    const duration = Math.floor((Date.now() - this._startTime) / 1000);
    const save  = SaveService.getInstance();
    const score = ScoreService.getInstance();
    score.submitResult({ gameId: 'flowerpots', score: this._score, duration });
    save.save(score.profile);
    this.scene.start('MainMenuScene');
  }

  // ── programmatic flower drawing ───────────────────────────────────────────

  private _createFlowerImage(type: FlowerType, x: number, y: number, r: number, bgColor: number = 0x1a472a): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    // Drop shadow
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(2, 4, r * 0.9);
    c.add(g);

    // The generated image
    // The key must be in the form of 'flower-TYPE' based on preload
    const key = `flower-${type}`;
    if (this.textures.exists(key)) {
      const img = this.add.image(0, 0, key);
      const scale = ((r * 2.2) / img.width); 
      img.setScale(scale);
      c.add(img);

      // Create an inverted mask overlay by drawing a thick frame in the background color instead of complicated WebGL masks
      const overlay = this.add.graphics();
      // Outer ring covering the square corners
      overlay.lineStyle(r * 0.8, bgColor, 1);
      overlay.strokeCircle(0, 0, r + r * 0.4);

      // Add a nice white rim on top
      overlay.lineStyle(3, 0xffffff, 1);
      overlay.strokeCircle(0, 0, r);
      
      c.add(overlay);
    } else {
      // Fallback
      g.fillStyle(FLOWER_COLORS[type], 1);
      g.fillCircle(0, 0, r);
    }

    return c;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  shutdown(): void {
    this.scale.off('resize', this._onResize, this);
    this.events.off('hud:back', this._onBack, this);
  }
}
