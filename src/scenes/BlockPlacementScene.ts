/**
 * BlockPlacementScene — 方块放置消除游戏
 *
 * 玩法:
 *  - 9×9 网格，部分格子有钻石标记
 *  - 底部显示 3 个待放方块，拖动放到网格任意合法位置
 *  - 放满整行 / 整列 / 任意一条主对角线 → 全部消除
 *  - 消除时有钻石的格子额外得分
 *  - 当 3 个方块全部无法放置时游戏结束
 */

import Phaser from 'phaser';
import { AudioManager }  from '../systems/AudioManager.js';
import { ScoreService }  from '../systems/ScoreService.js';
import { SaveService }   from '../systems/SaveService.js';
import { GameOverOverlay } from '../ui/GameOverOverlay.js';

const GRID = 9;
const PIECE_PANEL_H_RATIO = 0.22; // bottom panel height ratio

const BLOCK_COLORS = [
  0xe53935, 0x8e24aa, 0x1e88e5, 0x00897b,
  0xf4511e, 0xfb8c00, 0x43a047, 0x039be5,
];

const PIECE_SHAPES: number[][][] = [
  [[1,1,1,1]],                        // I-4
  [[1,1],[1,1]],                       // O-2
  [[1,1,1],[0,1,0]],                   // T
  [[1,1,0],[0,1,1]],                   // S
  [[0,1,1],[1,1,0]],                   // Z
  [[1,0],[1,0],[1,1]],                 // L
  [[0,1],[0,1],[1,1]],                 // J
  [[1,1,1]],                           // I-3
  [[1],[1],[1]],                        // I-3 vertical
  [[1,1,1,1,1]],                       // I-5
  [[1,0],[1,1],[0,1]],                 // S-tall
  [[1,1,1],[1,0,0]],                   // L-corner
  [[1,1,1],[0,0,1]],                   // J-corner
  [[1,1,0],[0,1,0],[0,1,1]],          // Z-tall
  [[1]],                               // single
];

interface PieceState {
  shape: number[][];
  color: number;
  container: Phaser.GameObjects.Container | null;
  placed: boolean;
}

export class BlockPlacementScene extends Phaser.Scene {
  private _W = 0; private _H = 0;
  private _hudH = 0;
  private _gridLeft = 0; private _gridTop = 0;
  private _cellSize = 0;
  private _panelTop = 0;

  // Game state
  private _occupied: boolean[][] = [];  // true = occupied
  private _diamond: boolean[][] = [];   // true = has diamond
  private _score       = 0;
  private _gameOver    = false;
  private _startTime   = 0;
  private _pieces: PieceState[] = [];

  // Rendering
  private _bgG!:         Phaser.GameObjects.Graphics;
  private _gridG!:       Phaser.GameObjects.Graphics;
  private _cellGraphics: Phaser.GameObjects.Graphics[][] = [];
  private _scoreText!:   Phaser.GameObjects.Text;
  private _comboText!:   Phaser.GameObjects.Text;
  private _ghostG!:      Phaser.GameObjects.Graphics;

  constructor() { super({ key: 'BlockPlacementScene' }); }

  init(): void {
    this._score = 0; this._gameOver = false; this._startTime = Date.now();
    this._occupied = Array.from({ length: GRID }, () => new Array<boolean>(GRID).fill(false));
    this._diamond  = Array.from({ length: GRID }, () => new Array<boolean>(GRID).fill(false));
    // Sprinkle diamonds (~20%)
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (Math.random() < 0.2) this._diamond[r][c] = true;
  }

  create(): void {
    AudioManager.getInstance().unlock();
    this._calcLayout();
    this._buildScene();
    this._drawGrid();
    this._generatePieces();
    this.events.on('hud:back', this._onBack, this);
    this.scale.on('resize', this._onResize, this);
  }

  // ── layout ────────────────────────────────────────────────────────────────

  private _calcLayout(): void {
    this._W = this.scale.width;
    this._H = this.scale.height;
    this._hudH = Math.max(44, this._H * 0.07);
    this._panelTop = this._H * (1 - PIECE_PANEL_H_RATIO);

    const available = Math.min(this._W - 16, this._panelTop - this._hudH - 8);
    this._cellSize  = Math.floor(available / GRID);
    const gridW     = this._cellSize * GRID;
    const gridH     = this._cellSize * GRID;
    this._gridLeft  = (this._W - gridW) / 2;
    this._gridTop   = this._hudH + (this._panelTop - this._hudH - gridH) / 2;
  }

  private _onResize(): void {
    if (this._gameOver) return;
    this._calcLayout();
    this.children.removeAll(true);
    this._cellGraphics = [];
    this._buildScene();
    this._drawGrid();
    this._rebuildPieces();
  }

  // ── scene build ───────────────────────────────────────────────────────────

  private _buildScene(): void {
    const W = this._W, H = this._H;

    this._bgG = this.add.graphics();
    this._bgG.fillStyle(0x0a0a1e, 1);
    this._bgG.fillRect(0, 0, W, H);
    if (this.textures.exists('bg-blocks')) {
      const img = this.add.image(W / 2, H / 2, 'bg-blocks');
      img.setScale(Math.max(W / img.width, H / img.height)).setAlpha(0.12);
    }

    // HUD
    const hg = this.add.graphics();
    hg.fillStyle(0x000000, 0.55);
    hg.fillRect(0, 0, W, this._hudH);

    const backBtn = this.add.text(10, this._hudH / 2, '◀ 返回', {
      fontSize: `${Math.max(12, this._hudH * 0.32)}px`, color: '#80cbc4', fontFamily: 'Arial',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this._onBack());

    this._scoreText = this.add.text(W / 2, this._hudH / 2, `得分: ${this._score}`, {
      fontSize: `${Math.max(14, this._hudH * 0.38)}px`,
      color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(W - 10, this._hudH / 2, `Lv.${ScoreService.getInstance().level}`, {
      fontSize: `${Math.max(11, this._hudH * 0.28)}px`, color: '#ffd54f', fontFamily: 'Arial',
    }).setOrigin(1, 0.5);

    // Ghost overlay (drawn above grid, below HUD)
    this._ghostG = this.add.graphics().setDepth(5);

    // Combo text
    this._comboText = this.add.text(W / 2, this._gridTop + 30, '', {
      fontSize: '26px', color: '#ffd54f', fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    // Panel background
    const pg = this.add.graphics();
    pg.fillStyle(0x111135, 1);
    pg.fillRect(0, this._panelTop, W, H - this._panelTop);
    pg.lineStyle(1, 0x3d3d8f, 1);
    pg.lineBetween(0, this._panelTop, W, this._panelTop);
  }

  // ── grid rendering ────────────────────────────────────────────────────────

  private _drawGrid(): void {
    this._gridG = this.add.graphics().setDepth(1);
    this._cellGraphics = Array.from({ length: GRID }, () => new Array<Phaser.GameObjects.Graphics>(GRID));

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const g = this.add.graphics().setDepth(2);
        this._cellGraphics[r][c] = g;
        this._drawCell(r, c);
      }
    }

    // Grid lines
    this._gridG.lineStyle(1, 0x2a2a5a, 0.6);
    for (let i = 0; i <= GRID; i++) {
      const x = this._gridLeft + i * this._cellSize;
      const y = this._gridTop  + i * this._cellSize;
      this._gridG.lineBetween(this._gridLeft, y, this._gridLeft + GRID * this._cellSize, y);
      this._gridG.lineBetween(x, this._gridTop, x, this._gridTop + GRID * this._cellSize);
    }
  }

  private _drawCell(r: number, c: number): void {
    const g   = this._cellGraphics[r]?.[c];
    if (!g) return;
    g.clear();
    const x   = this._gridLeft + c * this._cellSize;
    const y   = this._gridTop  + r * this._cellSize;
    const cs  = this._cellSize;
    const pad = 1;

    if (this._occupied[r][c]) {
      g.fillStyle(0x4444aa, 1);
      g.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
      // Diamond overlay
      if (this._diamond[r][c]) {
        g.fillStyle(0x40c4ff, 0.9);
        const dc = cs * 0.3;
        const mx = x + cs / 2, my = y + cs / 2;
        g.fillTriangle(mx, my - dc, mx + dc, my, mx, my + dc);
        g.fillTriangle(mx, my - dc, mx - dc, my, mx, my + dc);
      }
    } else {
      // Empty cell
      g.fillStyle(0x1a1a3a, 1);
      g.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
      if (this._diamond[r][c]) {
        g.fillStyle(0x40c4ff, 0.25);
        const dc = cs * 0.22;
        const mx = x + cs / 2, my = y + cs / 2;
        g.fillTriangle(mx, my - dc, mx + dc, my, mx, my + dc);
        g.fillTriangle(mx, my - dc, mx - dc, my, mx, my + dc);
      }
    }
  }

  // ── piece management ──────────────────────────────────────────────────────

  private _generatePieces(): void {
    this._pieces = [];
    for (let i = 0; i < 3; i++) {
      const shapeIdx = Math.floor(Math.random() * PIECE_SHAPES.length);
      const color    = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
      const piece: PieceState = {
        shape: PIECE_SHAPES[shapeIdx],
        color,
        container: null,
        placed: false,
      };
      this._pieces.push(piece);
    }
    this._buildPieceContainers();
  }

  private _buildPieceContainers(): void {
    // Destroy old containers
    this._pieces.forEach(p => p.container?.destroy());

    const panelH = this._H - this._panelTop;
    const slotW  = this._W / 3;

    this._pieces.forEach((piece, idx) => {
      if (piece.placed) return;
      const slotCX = slotW * idx + slotW / 2;
      const slotCY = this._panelTop + panelH / 2;
      piece.container = this._makePieceContainer(piece, slotCX, slotCY, slotW, panelH, idx);
    });
  }

  private _rebuildPieces(): void { this._buildPieceContainers(); }

  private _makePieceContainer(
    piece: PieceState, cx: number, cy: number,
    slotW: number, slotH: number, pieceIdx: number,
  ): Phaser.GameObjects.Container {
    const shape = piece.shape;
    const rows  = shape.length, cols = shape[0].length;
    const maxCS = Math.min(slotW / (cols + 1), slotH / (rows + 1), this._cellSize * 0.85);
    const blockSize = Math.max(8, maxCS);

    const totalW = cols * blockSize;
    const totalH = rows * blockSize;
    const originX = cx - totalW / 2;
    const originY = cy - totalH / 2;

    const container = this.add.container(0, 0).setDepth(3);
    const g = this.add.graphics();
    container.add(g);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!shape[r][c]) continue;
        const bx = originX + c * blockSize;
        const by = originY + r * blockSize;
        g.fillStyle(piece.color, 1);
        g.fillRoundedRect(bx + 1, by + 1, blockSize - 2, blockSize - 2, 3);
        g.lineStyle(1, 0xffffff, 0.3);
        g.strokeRoundedRect(bx + 1, by + 1, blockSize - 2, blockSize - 2, 3);
      }
    }

    // Hit zone centered at (cx, cy)
    const zone = this.add.zone(cx, cy, slotW * 0.9, slotH * 0.85)
      .setInteractive({ draggable: true, useHandCursor: true }).setDepth(4);
    container.add(zone);

    let _dragOffX = 0, _dragOffY = 0;

    zone.on('dragstart', (ptr: Phaser.Input.Pointer) => {
      if (this._gameOver) return;
      _dragOffX = ptr.x - cx; _dragOffY = ptr.y - cy;
      container.setDepth(30);
    });

    zone.on('drag', (ptr: Phaser.Input.Pointer) => {
      if (this._gameOver) return;
      const px = ptr.x - _dragOffX, py = ptr.y - _dragOffY;
      // Move the graphics to follow pointer
      g.x = px - cx; g.y = py - cy;

      // Show ghost
      this._ghostG.clear();
      const gridR = Math.round((py - totalH / 2 - this._gridTop) / this._cellSize);
      const gridC = Math.round((px - totalW / 2 - this._gridLeft) / this._cellSize);
      if (this._canPlace(piece.shape, gridR, gridC)) {
        this._ghostG.fillStyle(piece.color, 0.4);
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            if (!piece.shape[r][c]) continue;
            const bx = this._gridLeft + (gridC + c) * this._cellSize;
            const by = this._gridTop  + (gridR + r) * this._cellSize;
            this._ghostG.fillRoundedRect(bx + 1, by + 1, this._cellSize - 2, this._cellSize - 2, 3);
          }
      }
    });

    zone.on('dragend', (ptr: Phaser.Input.Pointer) => {
      if (this._gameOver) return;
      container.setDepth(3);
      this._ghostG.clear();
      g.x = 0; g.y = 0;

      const px = ptr.x - _dragOffX, py = ptr.y - _dragOffY;
      const gridR = Math.round((py - totalH / 2 - this._gridTop) / this._cellSize);
      const gridC = Math.round((px - totalW / 2 - this._gridLeft) / this._cellSize);

      if (this._canPlace(piece.shape, gridR, gridC)) {
        this._placePiece(piece, pieceIdx, gridR, gridC);
      } else {
        // Snap back
        g.x = 0; g.y = 0;
      }
    });

    return container;
  }

  // ── placement logic ───────────────────────────────────────────────────────

  private _canPlace(shape: number[][], startR: number, startC: number): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const gr = startR + r, gc = startC + c;
        if (gr < 0 || gr >= GRID || gc < 0 || gc >= GRID) return false;
        if (this._occupied[gr][gc]) return false;
      }
    }
    return true;
  }

  private _placePiece(piece: PieceState, pieceIdx: number, startR: number, startC: number): void {
    AudioManager.getInstance().playSfx('place');

    const shape = piece.shape;
    // Mark occupied
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        this._occupied[startR + r][startC + c] = true;
        this._drawCell(startR + r, startC + c);
      }
    }

    this._addScore(shape.flat().filter(Boolean).length * 5);

    // Remove piece container
    piece.container?.destroy();
    piece.container = null;
    piece.placed = true;

    // Check clears
    this._checkClears();

    // If all 3 placed, generate new set
    if (this._pieces.every(p => p.placed)) {
      this._generatePieces();
    } else {
      // Check if any remaining piece can be placed
      const canPlay = this._pieces.some(p => !p.placed && this._hasValidPlacement(p.shape));
      if (!canPlay) {
        this.time.delayedCall(500, () => this._endGame());
      }
    }
  }

  private _hasValidPlacement(shape: number[][]): boolean {
    for (let r = 0; r <= GRID - shape.length; r++) {
      for (let c = 0; c <= GRID - shape[0].length; c++) {
        if (this._canPlace(shape, r, c)) return true;
      }
    }
    return false;
  }

  private _checkClears(): void {
    const toClear = new Set<string>(); // "r,c"
    let diamondBonus = 0;

    // Rows
    for (let r = 0; r < GRID; r++) {
      if (this._occupied[r].every(Boolean)) {
        for (let c = 0; c < GRID; c++) toClear.add(`${r},${c}`);
      }
    }
    // Columns
    for (let c = 0; c < GRID; c++) {
      if (this._occupied.every(row => row[c])) {
        for (let r = 0; r < GRID; r++) toClear.add(`${r},${c}`);
      }
    }
    // Main diagonal (top-left → bottom-right)
    if (Array.from({ length: GRID }, (_, i) => this._occupied[i][i]).every(Boolean)) {
      for (let i = 0; i < GRID; i++) toClear.add(`${i},${i}`);
    }
    // Anti-diagonal (top-right → bottom-left)
    if (Array.from({ length: GRID }, (_, i) => this._occupied[i][GRID - 1 - i]).every(Boolean)) {
      for (let i = 0; i < GRID; i++) toClear.add(`${i},${GRID - 1 - i}`);
    }

    if (toClear.size === 0) return;

    // Count diamonds
    toClear.forEach(key => {
      const [r, c] = key.split(',').map(Number) as [number, number];
      if (this._diamond[r][c]) diamondBonus += 50;
    });

    // Animate clear
    toClear.forEach(key => {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const cg = this._cellGraphics[r]?.[c];
      if (cg) {
        this.tweens.add({ targets: cg, alpha: 0, duration: 250,
          onComplete: () => {
            this._occupied[r][c] = false;
            cg.setAlpha(1);
            this._drawCell(r, c);
          }
        });
      }
    });

    const cleared = toClear.size;
    const basePoints = cleared * 10 + (cleared >= GRID ? 100 : 0);
    this._addScore(basePoints + diamondBonus);

    if (diamondBonus > 0) {
      AudioManager.getInstance().playSfx('diamond');
      this._showClearFX(`💎 ×${Math.floor(diamondBonus / 50)} 钻石奖励！`, 0x40c4ff);
    } else {
      AudioManager.getInstance().playSfx('clear');
      this._showClearFX(`消除 ${cleared} 格！`, 0xffd54f);
    }
  }

  private _showClearFX(msg: string, color: number): void {
    this._comboText.setText(msg);
    this._comboText.setColor('#' + color.toString(16).padStart(6, '0'));
    this._comboText.setAlpha(1).setY(this._gridTop + 30);
    this.tweens.killTweensOf(this._comboText);
    this.tweens.add({
      targets: this._comboText, alpha: 0, y: this._gridTop + 5,
      duration: 1400, ease: 'Quad.easeOut',
    });
  }

  private _addScore(delta: number): void {
    this._score += delta;
    this._scoreText?.setText(`得分: ${this._score}`);
  }

  // ── game over ─────────────────────────────────────────────────────────────

  private _endGame(): void {
    if (this._gameOver) return;
    this._gameOver = true;
    const duration = Math.floor((Date.now() - this._startTime) / 1000);

    const save  = SaveService.getInstance();
    const score = ScoreService.getInstance();
    const result = score.submitResult({ gameId: 'blocks', score: this._score, duration });
    save.save(score.profile);

    this.time.delayedCall(400, () => {
      new GameOverOverlay(this).show({
        gameId: 'blocks',
        score: this._score,
        highScore: save.profile.games.blocks.highScore,
        ...result,
        onRestart: () => this.scene.restart(),
        onMenu:    () => this.scene.start('MainMenuScene'),
      });
    });
  }

  private _onBack(): void {
    const duration = Math.floor((Date.now() - this._startTime) / 1000);
    const save  = SaveService.getInstance();
    const score = ScoreService.getInstance();
    score.submitResult({ gameId: 'blocks', score: this._score, duration });
    save.save(score.profile);
    this.scene.start('MainMenuScene');
  }

  shutdown(): void {
    this.scale.off('resize', this._onResize, this);
    this.events.off('hud:back', this._onBack, this);
  }
}
