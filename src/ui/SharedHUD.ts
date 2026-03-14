import Phaser from 'phaser';
import { AudioManager } from '../systems/AudioManager.js';
import { ScoreService }  from '../systems/ScoreService.js';
import type { GameId }   from '../types/index.js';

export interface HUDConfig {
  gameId: GameId;
  showCombo: boolean;
}

/**
 * SharedHUD — Phaser Scene plugin (runs in parallel with the game scene).
 * Shows: back button | game title | current score | level chip | combo banner
 */
export class SharedHUD extends Phaser.Scene {
  private _cfg!: HUDConfig;
  private _scoreText!: Phaser.GameObjects.Text;
  private _comboText!: Phaser.GameObjects.Text;
  private _internalScore = 0;

  constructor() { super({ key: 'SharedHUD', active: false }); }

  init(data: HUDConfig): void { this._cfg = data; }

  create(): void {
    this.scale.on('resize', this._layout, this);
    this._layout();
  }

  private _layout(): void {
    this.children.removeAll(true);
    const W = this.scale.width;
    const H = Math.max(50, this.scale.height * 0.07);

    // ── semi-transparent bar ─────────────────────────────────────────────────
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45);
    g.fillRect(0, 0, W, H);

    // ── back button ──────────────────────────────────────────────────────────
    const backBtn = this.add.text(12, H / 2, '◀ 返回', {
      fontSize: `${Math.max(13, H * 0.34)}px`,
      color: '#a5d6a7', fontFamily: 'Arial',
    }).setOrigin(0, 0.5).setDepth(10).setInteractive({ useHandCursor: true });

    backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
    backBtn.on('pointerout',  () => backBtn.setColor('#a5d6a7'));
    backBtn.on('pointerdown', () => {
      AudioManager.getInstance().playSfx('click');
      // Signal the game scene then return to menu
      this.game.scene.getScenes(true).forEach(s => {
        if (s.scene.key !== 'SharedHUD') s.events.emit('hud:back');
      });
    });

    // ── score ────────────────────────────────────────────────────────────────
    this._scoreText = this.add.text(W / 2, H / 2, '0', {
      fontSize: `${Math.max(16, H * 0.42)}px`,
      color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);

    // ── level chip ───────────────────────────────────────────────────────────
    const sc = ScoreService.getInstance();
    this.add.text(W - 10, H / 2, `Lv.${sc.level}`, {
      fontSize: `${Math.max(12, H * 0.3)}px`,
      color: '#ffd54f', fontFamily: 'Arial',
    }).setOrigin(1, 0.5);

    // ── combo banner (hidden until triggered) ────────────────────────────────
    this._comboText = this.add.text(W / 2, H + 28, '', {
      fontSize: `${Math.max(18, H * 0.5)}px`,
      color: '#ff8f00', fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    this._scoreText.setText(String(this._internalScore));
  }

  setScore(v: number): void {
    this._internalScore = v;
    this._scoreText?.setText(String(v));
  }

  addScore(delta: number): void { this.setScore(this._internalScore + delta); }

  showCombo(x: number): void {
    if (!this._cfg.showCombo) return;
    this._comboText.setText(`${x}x 连击！`);
    this._comboText.setAlpha(1);
    this.tweens.add({
      targets: this._comboText,
      y: (this.scale.height * 0.07) + 10,
      alpha: 0,
      duration: 1200,
      ease: 'Quad.easeOut',
      onComplete: () => this._comboText.setAlpha(0),
    });
  }

  shutdown(): void {
    this.scale.off('resize', this._layout, this);
  }

  get currentScore(): number { return this._internalScore; }
}
