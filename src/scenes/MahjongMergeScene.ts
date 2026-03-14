/**
 * MahjongMergeScene — 麻将横向拖动消除游戏
 *
 * 棋盘: BOARD_COLS × BOARD_ROWS，每格可空或有一张麻将牌
 *
 * 玩法:
 *  - 拖动麻将牌（仅横向），牌在行内滑动直到碰到边界或另一张牌
 *  - 相同花色+数值的两张牌相遇 → 消除，得分
 *  - 消除后 3 秒内再消除 → 连击倍率增加
 *  - 消除后从上方随机补入新牌
 *  - 时限 150 秒，时间到结算
 */

import Phaser from 'phaser';
import { MAHJONG_COLORS, MAHJONG_SUIT_CHARS } from '../types/index.js';
import type { MahjongSuit, MahjongTileType } from '../types/index.js';
import { AudioManager }  from '../systems/AudioManager.js';
import { ScoreService }  from '../systems/ScoreService.js';
import { SaveService }   from '../systems/SaveService.js';
import { GameOverOverlay } from '../ui/GameOverOverlay.js';

const BOARD_COLS = 8;
const BOARD_ROWS = 5;
const SUITS: MahjongSuit[] = ['bamboo', 'circle', 'character'];
const INITIAL_FILL = 22; // tiles on board at start (rest are empty)
const COMBO_TIMEOUT = 3000; // ms
const GAME_DURATION = 150; // seconds

type TileId = string; // `${suit}-${value}`
interface TileObj { id: TileId; suit: MahjongSuit; value: number; row: number; col: number; container: Phaser.GameObjects.Container; }

export class MahjongMergeScene extends Phaser.Scene {
  private _W = 0; private _H = 0;
  private _hudH = 0;
  private _boardLeft = 0; private _boardTop = 0;
  private _cellW = 0; private _cellH = 0;

  private _board: (TileObj | null)[][] = [];
  private _score       = 0;
  private _combo       = 0;
  private _comboTimer  = 0;
  private _timeLeft    = GAME_DURATION;
  private _gameOver    = false;
  private _startTime   = 0;
  private _dragging: TileObj | null = null;
  private _dragStartX  = 0;
  private _dragOrigCol = 0;

  private _boardLayer!: Phaser.GameObjects.Container;
  private _scoreText!:  Phaser.GameObjects.Text;
  private _timerText!:  Phaser.GameObjects.Text;
  private _comboText!:  Phaser.GameObjects.Text;
  private _timerEvent!: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'MahjongMergeScene' }); }

  init(): void {
    this._score = 0; this._combo = 0; this._comboTimer = 0;
    this._timeLeft = GAME_DURATION; this._gameOver = false;
    this._dragging = null; this._startTime = Date.now();
  }

  create(): void {
    AudioManager.getInstance().unlock();
    this._calcLayout();
    this._buildScene();
    this._initBoard();
    this._startTimer();
    this.events.on('hud:back', this._onBack, this);
    this.scale.on('resize', this._onResize, this);
  }

  // ── layout ────────────────────────────────────────────────────────────────

  private _calcLayout(): void {
    this._W = this.scale.width;
    this._H = this.scale.height;
    this._hudH = Math.max(44, this._H * 0.07);

    const margin  = 8;
    const boardW  = this._W - margin * 2;
    const boardH  = this._H - this._hudH - margin * 2 - 40; // -40 for bottom HUD
    this._cellW   = Math.floor(boardW / BOARD_COLS);
    this._cellH   = Math.floor(boardH / BOARD_ROWS);
    this._boardLeft = (this._W - this._cellW * BOARD_COLS) / 2;
    this._boardTop  = this._hudH + margin;
  }

  private _onResize(): void {
    if (this._gameOver) return;
    this._calcLayout();
    this._boardLayer?.destroy();
    this._scoreText?.destroy();
    this._timerText?.destroy();
    this._comboText?.destroy();
    this._buildScene();
    this._rebuildBoard();
  }

  // ── scene ─────────────────────────────────────────────────────────────────

  private _buildScene(): void {
    const W = this._W, H = this._H;
    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a2e, 1);
    bg.fillRect(0, 0, W, H);
    if (this.textures.exists('bg-mahjong')) {
      const img = this.add.image(W / 2, H / 2, 'bg-mahjong');
      img.setScale(Math.max(W / img.width, H / img.height)).setAlpha(0.12);
    }

    // Grid lines
    const gg = this.add.graphics();
    gg.lineStyle(1, 0x2a2a5a, 0.7);
    for (let r = 0; r <= BOARD_ROWS; r++) {
      const y = this._boardTop + r * this._cellH;
      gg.lineBetween(this._boardLeft, y, this._boardLeft + BOARD_COLS * this._cellW, y);
    }
    for (let c = 0; c <= BOARD_COLS; c++) {
      const x = this._boardLeft + c * this._cellW;
      gg.lineBetween(x, this._boardTop, x, this._boardTop + BOARD_ROWS * this._cellH);
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

    this._timerText = this.add.text(W - 10, this._hudH / 2, `⏱ ${this._timeLeft}s`, {
      fontSize: `${Math.max(13, this._hudH * 0.33)}px`, color: '#ffd54f', fontFamily: 'Arial',
    }).setOrigin(1, 0.5);

    // Bottom HUD
    const botY = H - 20;
    this.add.text(W / 2, botY, '←→ 拖动麻将牌，让相同的牌相遇消除', {
      fontSize: `${Math.max(10, W * 0.025)}px`,
      color: '#80cbc4', fontFamily: 'Arial',
    }).setOrigin(0.5);

    // Combo text
    this._comboText = this.add.text(W / 2, this._boardTop + 30, '', {
      fontSize: '26px', color: '#ff8f00', fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    this._boardLayer = this.add.container(0, 0);
  }

  // ── board ─────────────────────────────────────────────────────────────────

  private _initBoard(): void {
    this._board = Array.from({ length: BOARD_ROWS }, () => new Array<TileObj | null>(BOARD_COLS).fill(null));
    const positions = this._randomPositions(INITIAL_FILL);
    positions.forEach(([r, c]) => {
      const tile = this._randomTile(r, c);
      this._board[r][c] = tile;
      this._boardLayer.add(tile.container);
    });
  }

  private _rebuildBoard(): void {
    this._boardLayer?.removeAll(true);
    this._boardLayer = this.add.container(0, 0);
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const tile = this._board[r][c];
        if (tile) {
          tile.container = this._makeTileContainer(tile, r, c);
          this._boardLayer.add(tile.container);
        }
      }
    }
  }

  private _randomPositions(count: number): [number, number][] {
    const all: [number, number][] = [];
    for (let r = 0; r < BOARD_ROWS; r++)
      for (let c = 0; c < BOARD_COLS; c++) all.push([r, c]);
    return Phaser.Utils.Array.Shuffle(all).slice(0, count) as [number, number][];
  }

  private _randomTile(r: number, c: number): TileObj {
    const suit  = SUITS[Math.floor(Math.random() * SUITS.length)];
    const value = Math.floor(Math.random() * 9) + 1;
    const id    = `${suit}-${value}` as TileId;
    const container = this._makeTileContainer({ id, suit, value, row: r, col: c, container: null! }, r, c);
    return { id, suit, value, row: r, col: c, container };
  }

  private _makeTileContainer(tile: MahjongTileType & { id: TileId; row: number; col: number; container: Phaser.GameObjects.Container | null }, rowIdx: number, colIdx: number): Phaser.GameObjects.Container {
    const cw = this._cellW - 4, ch = this._cellH - 4;
    const cx = this._boardLeft + colIdx * this._cellW + this._cellW / 2;
    const cy = this._boardTop  + rowIdx * this._cellH + this._cellH / 2;
    const container = this.add.container(cx, cy);

    const g = this.add.graphics();
    const radius = 6; // slightly rounder

    // Drop shadow
    g.fillStyle(0x000000, 0.4);
    g.fillRoundedRect(-cw / 2 + 2, -ch / 2 + 4, cw, ch, radius);

    // Tile body main
    g.fillStyle(0xfaf0e6, 1);
    g.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, radius);

    // Bevel highlights (left/top)
    g.lineStyle(2, 0xffffff, 0.8);
    g.strokeRoundedRect(-cw / 2 + 1, -ch / 2 + 1, cw - 2, ch - 2, radius);

    // Bevel shadow (right/bottom)
    g.lineStyle(2, 0xdcd0c0, 1);
    g.strokeRoundedRect(-cw / 2 + 1, -ch / 2 + 1, cw - 1, ch - 1, radius);

    // Colored top strip
    g.fillStyle(MAHJONG_COLORS[tile.suit as MahjongSuit], 1);
    g.fillRoundedRect(-cw / 2, -ch / 2, cw, ch * 0.25, { tl: radius, tr: radius, bl: 0, br: 0 } as any);

    // Outer Border
    g.lineStyle(1.5, 0x8b7355, 1);
    g.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, radius);

    const suit = tile.suit as MahjongSuit;
    const suitText = this.add.text(0, -ch * 0.28, MAHJONG_SUIT_CHARS[suit], {
      fontSize: `${Math.max(10, ch * 0.2)}px`,
      color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 2, fill: true }
    }).setOrigin(0.5);

    const valText = this.add.text(0, ch * 0.15, String(tile.value), {
      fontSize: `${Math.max(18, ch * 0.45)}px`,
      color: String('#' + MAHJONG_COLORS[suit].toString(16).padStart(6, '0')),
      fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#ffffff', strokeThickness: 2,
      shadow: { offsetX: 1, offsetY: 2, color: '#00000088', blur: 3, fill: true }
    }).setOrigin(0.5);

    container.add([g, suitText, valText]);
    container.setSize(cw, ch).setInteractive({ draggable: true, useHandCursor: true });

    let _startDragX = 0;
    let _startDragY = 0;
    let _tileStartX = 0;
    let _tileStartY = 0;
    let _dragAxis: 'x' | 'y' | null = null;
    let _downX = 0;
    let _downY = 0;

    container.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this._gameOver) return;
      _downX = ptr.x; _downY = ptr.y;
      this._wiggleHint(tile.id);
    });

    container.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (this._gameOver) return;
      if (Math.abs(ptr.x - _downX) < 5 && Math.abs(ptr.y - _downY) < 5) {
        this._tryAutoMerge(tile.row, tile.col);
      }
    });

    container.on('dragstart', (_ptr: Phaser.Input.Pointer) => {
      if (this._gameOver) return;
      const tileObj = this._board[tile.row]?.[tile.col];
      if (!tileObj) return;
      this._dragging = tileObj;
      this._dragOrigCol = tile.col;
      _startDragX = _ptr.x;
      _startDragY = _ptr.y;
      _tileStartX = container.x;
      _tileStartY = container.y;
      _dragAxis = null;
      container.setDepth(10);
    });

    container.on('drag', (_ptr: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (this._gameOver || this._dragging?.container !== container) return;
      const row    = tile.row;
      const curCol = this._dragging.col;
      const curRow = this._dragging.row;

      const dx = dragX - _tileStartX;
      const dy = dragY - _tileStartY;

      if (!_dragAxis) {
        if (Math.abs(dx) > 5) _dragAxis = 'x';
        else if (Math.abs(dy) > 5) _dragAxis = 'y';
      }

      if (_dragAxis === 'x') {
        const dir     = dx >= 0 ? 1 : -1;
        const maxCols = this._maxSlide(row, curCol, dir);
        const minX    = this._boardLeft + (curCol - (dir < 0 ? maxCols : 0)) * this._cellW + this._cellW / 2;
        const maxX    = this._boardLeft + (curCol + (dir > 0 ? maxCols : 0)) * this._cellW + this._cellW / 2;
        container.x = Phaser.Math.Clamp(dragX, minX, maxX);
        container.y = _tileStartY;
      } else if (_dragAxis === 'y') {
        const dir     = dy >= 0 ? 1 : -1;
        const maxRows = this._maxSlideVert(curRow, curCol, dir);
        const minY    = this._boardTop + (curRow - (dir < 0 ? maxRows : 0)) * this._cellH + this._cellH / 2;
        const maxY    = this._boardTop + (curRow + (dir > 0 ? maxRows : 0)) * this._cellH + this._cellH / 2;
        container.y = Phaser.Math.Clamp(dragY, minY, maxY);
        container.x = _tileStartX;
      }
    });

    container.on('dragend', () => {
      if (this._gameOver || !this._dragging) return;
      container.setDepth(0);
      const tileObj = this._dragging;
      this._dragging = null;

      if (_dragAxis === 'x' || !_dragAxis) {
        const targetCol = Math.round((container.x - this._boardLeft - this._cellW / 2) / this._cellW);
        const clampedCol = Phaser.Math.Clamp(targetCol, 0, BOARD_COLS - 1);
        this._slideToCol(tileObj, clampedCol);
      } else if (_dragAxis === 'y') {
        const targetRow = Math.round((container.y - this._boardTop - this._cellH / 2) / this._cellH);
        const clampedRow = Phaser.Math.Clamp(targetRow, 0, BOARD_ROWS - 1);
        this._slideToRow(tileObj, clampedRow);
      }
    });

    return container;
  }

  private _wiggleHint(id: TileId): void {
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const tile = this._board[r][c];
        if (tile && tile.id === id) {
          const ct = tile.container;
          this.tweens.killTweensOf(ct);
          this.tweens.add({
            targets: ct, angle: 8, yoyo: true, repeat: 3, duration: 60,
            onComplete: () => { ct.angle = 0; }
          });
        }
      }
    }
  }

  private _tryAutoMerge(row: number, col: number): void {
    const tile = this._board[row][col];
    if (!tile) return;
    const { suit, value } = tile;

    const check = (dr: number, dc: number) => {
      let r = row + dr; let c = col + dc;
      while (r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS) {
        const occ = this._board[r][c];
        if (occ) {
          return (occ.suit === suit && occ.value === value) ? { r, c } : null;
        }
        r += dr; c += dc;
      }
      return null;
    };

    const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
    for (const [dr, dc] of dirs) {
      const target = check(dr, dc);
      if (target) {
        if (dr === 0) {
          this._slideToCol(tile, dc > 0 ? BOARD_COLS - 1 : 0);
        } else {
          this._slideToRow(tile, dr > 0 ? BOARD_ROWS - 1 : 0);
        }
        return;
      }
    }
  }

  /** How many columns can tile at (row, col) slide in direction dir (+1=right, -1=left)? */
  private _maxSlide(row: number, col: number, dir: number): number {
    let slides = 0;
    let c = col + dir;
    while (c >= 0 && c < BOARD_COLS) {
      if (this._board[row][c] !== null) return slides; // blocked
      slides++;
      c += dir;
    }
    return slides;
  }

  /** How many rows can tile at (row, col) slide in direction dir (+1=down, -1=up)? */
  private _maxSlideVert(row: number, col: number, dir: number): number {
    let slides = 0;
    let r = row + dir;
    while (r >= 0 && r < BOARD_ROWS) {
      if (this._board[r][col] !== null) return slides; // blocked
      slides++;
      r += dir;
    }
    return slides;
  }

  private _slideToRow(tile: TileObj, targetRow: number): void {
    const col = tile.col;
    if (targetRow === tile.row) {
      // Snap back
      this.tweens.add({
        targets: tile.container,
        y: this._boardTop + tile.row * this._cellH + this._cellH / 2,
        duration: 120, ease: 'Back.easeOut',
      });
      return;
    }

    const dir = targetRow > tile.row ? 1 : -1;
    let finalRow = tile.row;
    for (let r = tile.row + dir; r >= 0 && r < BOARD_ROWS; r += dir) {
      const occupant = this._board[r][col];
      if (occupant === null) {
        finalRow = r;
      } else {
        if (occupant.suit === tile.suit && occupant.value === tile.value) {
          finalRow = r; // will merge
        }
        break;
      }
    }

    const destY = this._boardTop + finalRow * this._cellH + this._cellH / 2;
    this.tweens.add({
      targets: tile.container,
      y: destY, duration: 200, ease: 'Quad.easeOut',
      onComplete: () => {
        const occupant = this._board[finalRow][col];
        if (occupant && occupant !== tile) {
          this._merge(tile, occupant, finalRow, col);
        } else {
          this._board[tile.row][col] = null;
          tile.row = finalRow;
          this._board[finalRow][col] = tile;
          AudioManager.getInstance().playSfx('place');
        }
      },
    });
  }

  private _slideToCol(tile: TileObj, targetCol: number): void {
    const row = tile.row;
    if (targetCol === tile.col) {
      // Snap back
      this.tweens.add({
        targets: tile.container,
        x: this._boardLeft + tile.col * this._cellW + this._cellW / 2,
        duration: 120, ease: 'Back.easeOut',
      });
      return;
    }

    const dir = targetCol > tile.col ? 1 : -1;
    // Find farthest valid col in that direction
    let finalCol = tile.col;
    for (let c = tile.col + dir; c >= 0 && c < BOARD_COLS; c += dir) {
      const occupant = this._board[row][c];
      if (occupant === null) {
        finalCol = c;
      } else {
        // Check merge
        if (occupant.suit === tile.suit && occupant.value === tile.value) {
          finalCol = c; // will merge
        }
        break;
      }
    }

    const destX = this._boardLeft + finalCol * this._cellW + this._cellW / 2;
    this.tweens.add({
      targets: tile.container,
      x: destX, duration: 200, ease: 'Quad.easeOut',
      onComplete: () => {
        const occupant = this._board[row][finalCol];
        if (occupant && occupant !== tile) {
          // Merge!
          this._merge(tile, occupant, row, finalCol);
        } else {
          // Move
          this._board[row][tile.col] = null;
          tile.col = finalCol;
          this._board[row][finalCol] = tile;
          AudioManager.getInstance().playSfx('place');
        }
      },
    });
  }

  private _merge(movingTile: TileObj, staticTile: TileObj, row: number, col: number): void {
    AudioManager.getInstance().playSfx('merge');

    // Remove both
    this._board[row][movingTile.col] = null;
    this._board[row][col] = null;

    const cx = this._boardLeft + col * this._cellW + this._cellW / 2;
    const cy = this._boardTop + row * this._cellH + this._cellH / 2;

    // Flash effect
    const flash = this.add.graphics().setDepth(15);
    flash.fillStyle(0xffffff, 0.8);
    flash.fillCircle(cx, cy, Math.max(this._cellW, this._cellH) * 0.6);
    this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });

    movingTile.container.destroy();
    staticTile.container.destroy();

    // Combo
    const now = this.time.now;
    if (now - this._comboTimer < COMBO_TIMEOUT) {
      this._combo++;
    } else {
      this._combo = 1;
    }
    this._comboTimer = now;

    const points = 20 * Math.pow(2, this._combo - 1);
    this._addScore(Math.floor(points));

    if (this._combo >= 2) {
      AudioManager.getInstance().playSfx('combo');
      this._showCombo(this._combo, cx, cy);
    }

    // Spawn replacement tile
    this.time.delayedCall(400, () => this._spawnNewTile());
  }

  private _showCombo(x: number, _cx: number, cy: number): void {
    this._comboText.setText(`${x}x 连击！`);
    this._comboText.setPosition(this._W / 2, cy - 30);
    this._comboText.setAlpha(1);
    this.tweens.killTweensOf(this._comboText);
    this.tweens.add({
      targets: this._comboText, y: cy - 70, alpha: 0, duration: 1200, ease: 'Quad.easeOut',
    });
  }

  private _spawnNewTile(): void {
    const empties: [number, number][] = [];
    for (let r = 0; r < BOARD_ROWS; r++)
      for (let c = 0; c < BOARD_COLS; c++)
        if (!this._board[r][c]) empties.push([r, c]);
    if (empties.length === 0) return;
    const [r, c] = Phaser.Utils.Array.GetRandom(empties) as [number, number];
    const tile   = this._randomTile(r, c);
    this._board[r][c] = tile;
    this._boardLayer.add(tile.container);
    // Drop-in animation
    tile.container.setAlpha(0).setY(tile.container.y - 30);
    this.tweens.add({ targets: tile.container, alpha: 1, y: tile.container.y + 30, duration: 250 });
  }

  private _addScore(delta: number): void {
    this._score += delta;
    this._scoreText?.setText(`得分: ${this._score}`);
  }

  // ── timer ─────────────────────────────────────────────────────────────────

  private _startTimer(): void {
    this._timerEvent = this.time.addEvent({
      delay: 1000, repeat: GAME_DURATION - 1,
      callback: () => {
        this._timeLeft--;
        this._timerText?.setText(`⏱ ${this._timeLeft}s`);
        if (this._timeLeft <= 10) this._timerText?.setColor('#ff5252');
        if (this._timeLeft <= 0) this._endGame();
      },
    });
  }

  private _endGame(): void {
    if (this._gameOver) return;
    this._gameOver = true;
    this._timerEvent?.remove();
    const duration = Math.floor((Date.now() - this._startTime) / 1000);

    const save  = SaveService.getInstance();
    const score = ScoreService.getInstance();
    const result = score.submitResult({ gameId: 'mahjong', score: this._score, duration });
    save.save(score.profile);

    this.time.delayedCall(400, () => {
      new GameOverOverlay(this).show({
        gameId: 'mahjong',
        score: this._score,
        highScore: save.profile.games.mahjong.highScore,
        ...result,
        onRestart: () => this.scene.restart(),
        onMenu:    () => this.scene.start('MainMenuScene'),
      });
    });
  }

  private _onBack(): void {
    this._timerEvent?.remove();
    const duration = Math.floor((Date.now() - this._startTime) / 1000);
    const save  = SaveService.getInstance();
    const score = ScoreService.getInstance();
    score.submitResult({ gameId: 'mahjong', score: this._score, duration });
    save.save(score.profile);
    this.scene.start('MainMenuScene');
  }

  shutdown(): void {
    this._timerEvent?.remove();
    this.scale.off('resize', this._onResize, this);
    this.events.off('hud:back', this._onBack, this);
  }
}
