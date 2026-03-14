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

const MAX_BUBBLES = 12;
const POT_SLOTS  = 4;
const POT_CAP    = 4;   // flowers per pot
const QUEUE_SIZE = 20;  // pre-generated pot queue

interface BubbleFlowerData {
  type: FlowerType;
  container: Phaser.GameObjects.Container;
  bubble: BubbleData;
  active: boolean;
  localX: number;
  localY: number;
}

interface BubbleData {
  id: string;
  container: Phaser.GameObjects.Container;
  flowers: BubbleFlowerData[];
  bg: Phaser.GameObjects.Graphics;
  radius: number;
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
  
  

  // ── state ────────────────────────────────────────────────────────────────
  private _bubbles: BubbleData[] = [];
  private _bubbleSpawnTimer: Phaser.Time.TimerEvent | null = null;
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
    this._setupBubbles();
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

  
    // ── bubbles ─────────────────────────────────────────────────────────────

    private _setupBubbles(): void {
      this._gridLayer.removeAll(true);
      this._bubbles = [];
      this.matter.world.setBounds(0, this._gridTop, this._W, this._H - this._gridTop, 50, true, true, false, true);

      if (this._bubbleSpawnTimer) {
        this._bubbleSpawnTimer.remove();
      }
      this._bubbleSpawnTimer = this.time.addEvent({
        delay: 2000,
        callback: this._checkSpawnBubble,
        callbackScope: this,
        loop: true,
      });

      for (let i = 0; i < 6; i++) {
        this.time.delayedCall(i * 300, () => this._spawnBubble());
      }
    }

    private _checkSpawnBubble(): void {
      if (this._gameOver) return;
      this._bubbles = this._bubbles.filter(b => b.flowers.some(f => f.active));
      if (this._bubbles.length < MAX_BUBBLES) {
        this._spawnBubble();
      }
    }

    private _spawnBubble(): void {
      const radius = Math.max(45, this._W * 0.12);
      const startX = Phaser.Math.Between(radius * 1.5, this._W - radius * 1.5);
      const startY = this._gridTop - radius;
      
      const c = this.add.container(startX, startY);
      
      const bg = this.add.graphics();
      bg.lineStyle(4, 0x81d4fa, 0.6);
      bg.fillStyle(0xe1f5fe, 0.3);
      bg.fillCircle(0, 0, radius);
      bg.strokeCircle(0, 0, radius);
      c.add(bg);

      const count = Phaser.Math.Between(2, 5);
      const flowersData: BubbleFlowerData[] = [];
      const flowerR = radius * (count <= 3 ? 0.4 : 0.35);
      
      const bData: BubbleData = {
        id: Phaser.Utils.String.UUID(),
        container: c,
        flowers: flowersData,
        bg,
        radius
      };

      this._gridLayer.add(c);
      
      const types = this._weighedFlowerTypes(count);
      for (let i = 0; i < count; i++) {
        const type = types[i];
        const angle = (Math.PI * 2 * i) / count;
        const offset = count === 1 ? 0 : radius * 0.45;
        const fx = Math.cos(angle) * offset;
        const fy = Math.sin(angle) * offset;
        
        const fImg = this._createFlowerImage(type, fx, fy, flowerR, 0x0d3320); 

        fImg.setSize(flowerR * 2, flowerR * 2);
        fImg.setInteractive(new Phaser.Geom.Circle(0, 0, flowerR), Phaser.Geom.Circle.Contains);
        if(fImg.input) fImg.input.cursor = "pointer";
        
        c.add(fImg);
        
        const fData: BubbleFlowerData = {
          type, container: fImg, bubble: bData, active: true, localX: fx, localY: fy
        };
        flowersData.push(fData);
        
        fImg.on('pointerdown', () => this._onFlowerClick(fData));
        
        fImg.on('pointerover', () => { fImg.setScale(1.1); });
        fImg.on('pointerout', () => { fImg.setScale(1); });
      }

      this.matter.add.gameObject(c, { 
        shape: { type: 'circle', radius },
        restitution: 0.5,
        friction: 0.1,
        frictionAir: 0.02,
        density: 0.001
      });
      const body = c.body as MatterJS.BodyType;
      this.matter.body.applyForce(body, body.position, { x:(Math.random()-0.5)*0.01, y: 0.05 });

      this._bubbles.push(bData);
    }

    private _weighedFlowerTypes(needed: number): FlowerType[] {
      const result: FlowerType[] = [];
      const potTypes = this._pots.map(p => p.type);
      if (potTypes.length > 0) {
        potTypes.forEach(t => { for (let i = 0; i < 2; i++) result.push(t); });
      }
      while (result.length < needed + 5) {
        const all: FlowerType[] = ['rose', 'sunflower', 'tulip', 'daisy', 'lily', 'orchid', 'chrysanthemum', 'violet'];
        result.push(all[Math.floor(Math.random() * all.length)]);
      }
      return Phaser.Utils.Array.Shuffle(result).slice(0, needed);
    }

    private _playError(container: Phaser.GameObjects.Container): void {
      AudioManager.getInstance().playSfx('error');
      this.tweens.add({
        targets: container, x: container.x + 6, duration: 50, yoyo: true, repeat: 3,
      });
    }

    // ── interaction ─────────────────────────────────────────────────────────

    private _onFlowerClick(fData: BubbleFlowerData): void {
      if (this._flying || this._gameOver || !fData.active) return;
      if (!fData.bubble.container.active) return;

      const matchPot = this._pots.find(p => p.type === fData.type);
      if (!matchPot || !matchPot.container) {
        this._playError(fData.container);
        return;
      }

      this._flying = true;
      fData.active = false;
      AudioManager.getInstance().playSfx('place');

      const matrix = fData.container.getWorldTransformMatrix();
      const srcX = matrix.tx;
      const srcY = matrix.ty;
      
      const dstX = matchPot.container.x, dstY = matchPot.container.y;

      fData.container.setAlpha(0);

      const flyImg = this._createFlowerImage(fData.type, 0, 0, fData.bubble.radius * 0.4, 0x0d3320);
      flyImg.setPosition(srcX, srcY);
      flyImg.setDepth(100);

      this.tweens.add({
        targets: flyImg,
        x: dstX, y: dstY,
        scaleX: 0.5, scaleY: 0.5,
        duration: 380,
        ease: 'Quad.easeIn',
        onComplete: () => {
          flyImg.destroy();
          this._addToPot(matchPot);
          this._flying = false;
        },
      });

      const remaining = fData.bubble.flowers.filter(f => f.active);
      if (remaining.length === 0) {
        AudioManager.getInstance().playSfx('clear');
        this.tweens.add({
          targets: fData.bubble.container,
          scaleX: 1.2, scaleY: 1.2, alpha: 0,
          duration: 150,
          onComplete: () => {
             this.matter.world.remove(fData.bubble.container.body as MatterJS.BodyType);
             fData.bubble.container.destroy();
          }
        });
      }
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

  private _checkGameOver(): void {
    if (this._gameOver) return;
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
