import Phaser from 'phaser';
import { AudioManager } from '../systems/AudioManager.js';
import { ScoreService }  from '../systems/ScoreService.js';
import type { GameId }   from '../types/index.js';

export interface GameOverData {
  gameId: GameId;
  score: number;
  highScore: number;
  xpGained: number;
  coinsGained: number;
  levelsGained: number;
  onRestart: () => void;
  onMenu: () => void;
}

export class GameOverOverlay {
  private _container!: Phaser.GameObjects.Container;
  private _scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) { this._scene = scene; }

  show(data: GameOverData): void {
    const scene = this._scene;
    const W = scene.scale.width, H = scene.scale.height;
    const isHighScore = data.score >= data.highScore;
    const title = isHighScore ? '🏆 新纪录！' : '游戏结束';

    const items: Phaser.GameObjects.GameObject[] = [];

    // Dim overlay
    const dim = scene.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0).setDepth(100);
    items.push(dim);

    // Card
    const cardW = Math.min(W * 0.85, 340), cardH = Math.min(H * 0.55, 380);
    const cx = W / 2, cy = H / 2;
    const card = scene.add.graphics().setDepth(101);
    card.fillStyle(0x1a472a, 1);
    card.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 16);
    card.lineStyle(2, 0x5dbb63, 1);
    card.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 16);
    items.push(card);

    const textStyle = { fontFamily: 'Arial', color: '#ffffff' };
    const fs = (n: number) => `${Math.max(n, 13)}px`;

    const addT = (text: string, y: number, color = '#ffffff', size = 18, bold = false) => {
      const t = scene.add.text(cx, cy + y, text, {
        ...textStyle, fontSize: fs(size), color,
        fontStyle: bold ? 'bold' : 'normal',
      }).setOrigin(0.5).setDepth(102);
      items.push(t);
      return t;
    };

    addT(title, -cardH * 0.38, isHighScore ? '#ffd54f' : '#ffffff', 22, true);
    addT(`得分: ${data.score}`, -cardH * 0.22, '#ffffff', 20, true);
    if (isHighScore) addT(`🎉 最高分！`, -cardH * 0.08, '#ffd54f', 16);
    addT(`获得 +${data.xpGained} XP  💰 +${data.coinsGained}`, cardH * 0.04, '#a5d6a7', 15);
    if (data.levelsGained > 0) {
      addT(`🆙 升级了！现在是 Lv.${ScoreService.getInstance().level}`, cardH * 0.17, '#ffd54f', 16, true);
      AudioManager.getInstance().playSfx('levelup');
    }
    AudioManager.getInstance().playSfx('win');

    // Buttons
    const btnW = cardW * 0.38, btnH = 44;
    const btnY  = cy + cardH * 0.33;

    const makeBtn = (label: string, bx: number, color: number, cb: () => void) => {
      const bg = scene.add.graphics().setDepth(102);
      bg.fillStyle(color, 1);
      bg.fillRoundedRect(bx - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);
      const t = scene.add.text(bx, btnY, label, {
        ...textStyle, fontSize: '16px', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(103);
      const z = scene.add.zone(bx, btnY, btnW, btnH).setInteractive({ useHandCursor: true }).setDepth(104);
      z.on('pointerdown', () => {
        AudioManager.getInstance().playSfx('click');
        this._destroy(items);
        cb();
      });
      items.push(bg, t, z);
    };

    makeBtn('重来', cx - cardW * 0.25, 0x2e7d32, data.onRestart);
    makeBtn('主菜单', cx + cardW * 0.25, 0x1565c0, data.onMenu);

    this._container = scene.add.container(0, 0, items as Phaser.GameObjects.GameObject[]);

    // Entrance animation
    scene.cameras.main.flash(300, 255, 255, 0);
  }

  private _destroy(items: Phaser.GameObjects.GameObject[]): void {
    items.forEach(i => i.destroy());
  }
}
