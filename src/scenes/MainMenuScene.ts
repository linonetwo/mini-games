import Phaser from 'phaser';
import { GAMES, FLOWER_COLORS, ALL_FLOWER_TYPES } from '../types/index.js';
import type { GameInfo, FlowerType } from '../types/index.js';
import { ScoreService } from '../systems/ScoreService.js';
import { SaveService }  from '../systems/SaveService.js';
import { AudioManager } from '../systems/AudioManager.js';
import { SolidSyncService } from '../systems/SolidSyncService.js';

const PAL = {
  bg: 0x0d2b1a, card: 0x1a472a, cardHover: 0x246332,
  goldNum: 0xffd54f, white: 0xffffff, green: 0x5dbb63,
  xpBar: 0x5dbb63, xpBg: 0x2d5a27,
  gold: '#ffd54f', text: '#ffffff', subtext: '#a5d6a7',
};

export class MainMenuScene extends Phaser.Scene {
  private _containers: Phaser.GameObjects.Container[] = [];

  constructor() { super({ key: 'MainMenuScene' }); }

  create(): void {
    this.scale.on('resize', this._rebuild, this);
    AudioManager.getInstance().unlock();
    this._rebuild();
  }

  private _rebuild(): void {
    this.children.removeAll(true);
    this._containers = [];
    const W = this.scale.width, H = this.scale.height;
    const score = ScoreService.getInstance();
    const save  = SaveService.getInstance();

    // ── background ────────────────────────────────────────────────────────────
    this.add.rectangle(0, 0, W, H, PAL.bg).setOrigin(0);

    // Try bg image
    if (this.textures.exists('bg-menu')) {
      const img = this.add.image(W / 2, H / 2, 'bg-menu');
      const s   = Math.max(W / img.width, H / img.height);
      img.setScale(s).setAlpha(0.18);
    }

    // Scattered background flowers
    this._drawBgFlowers(W, H);

    // ── title ────────────────────────────────────────────────────────────────
    const titleY = H * 0.08;
    this.add.text(W / 2, titleY, '🌸 小游戏合集', {
      fontSize: `${Math.max(22, W * 0.065)}px`,
      color: PAL.text, fontFamily: 'Arial',
      stroke: '#000', strokeThickness: 3,
      shadow: { color: '#000', fill: true, blur: 8, offsetY: 2 },
    }).setOrigin(0.5);

    // ── profile bar ──────────────────────────────────────────────────────────
    const lvInfo = score.getLevelInfo();
    const xpProg = score.getXPProgress();
    const profileY = H * 0.17;

    this.add.text(W / 2, profileY, `Lv.${score.level} ${lvInfo.title}`, {
      fontSize: `${Math.max(14, W * 0.038)}px`,
      color: PAL.gold as string, fontFamily: 'Arial',
    }).setOrigin(0.5);

    const barW = Math.min(W * 0.55, 220);
    const barH = 10, barX = (W - barW) / 2, barY = profileY + 24;
    this.add.rectangle(barX, barY, barW, barH, PAL.xpBg).setOrigin(0);
    this.add.rectangle(barX, barY, barW * (xpProg.pct / 100), barH, PAL.xpBar).setOrigin(0);
    this.add.text(W / 2, barY + barH + 6,
      `${xpProg.current} / ${xpProg.required} XP  |  💰 ${score.coins}`,
      { fontSize: '12px', color: PAL.subtext, fontFamily: 'Arial' }).setOrigin(0.5);

    // ── game cards ───────────────────────────────────────────────────────────
    const cardTop    = H * 0.28;
    const cardBottom = H * 0.82;
    const cardAreaH  = cardBottom - cardTop;
    const isPortrait = H > W;

    if (isPortrait) {
      // Portrait: vertical list
      const cardH  = Math.min(cardAreaH / GAMES.length - 16, 120);
      const cardW  = Math.min(W * 0.88, 360);
      GAMES.forEach((g, i) => {
        const cy = cardTop + i * (cardH + 14) + cardH / 2;
        this._makeCard(g, W / 2, cy, cardW, cardH, save.profile.games[g.id].highScore);
      });
    } else {
      // Landscape: horizontal row
      const cardW = Math.min((W - 60) / GAMES.length - 16, 180);
      const cardH = Math.min(cardAreaH * 0.85, 200);
      const totalW = GAMES.length * (cardW + 14) - 14;
      const startX = (W - totalW) / 2 + cardW / 2;
      const cy     = cardTop + cardH / 2;
      GAMES.forEach((g, i) => {
        this._makeCard(g, startX + i * (cardW + 14), cy, cardW, cardH, save.profile.games[g.id].highScore);
      });
    }

    // ── settings / Solid bar ──────────────────────────────────────────────────
    this._drawBottomBar(W, H);
  }

  private _makeCard(
    info: GameInfo, cx: number, cy: number, cardW: number, cardH: number, highScore: number,
  ): void {
    const g = this.add.graphics();

    // Card shadow
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(cx - cardW / 2 + 4, cy - cardH / 2 + 4, cardW, cardH, 14);

    // Card body
    g.fillStyle(info.bgColor, 1);
    g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
    g.lineStyle(2, PAL.green, 0.5);
    g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);

    // Emoji / icon
    const emojiY = cy - cardH * 0.22;
    this.add.text(cx, emojiY, info.emoji, {
      fontSize: `${Math.max(24, cardH * 0.28)}px`, fontFamily: 'Arial',
    }).setOrigin(0.5);

    // Title
    this.add.text(cx, cy + cardH * 0.08, info.title, {
      fontSize: `${Math.max(14, cardH * 0.14)}px`,
      color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Description
    this.add.text(cx, cy + cardH * 0.26, info.description, {
      fontSize: `${Math.max(10, cardH * 0.09)}px`,
      color: '#a5d6a7', fontFamily: 'Arial', wordWrap: { width: cardW - 16 },
    }).setOrigin(0.5);

    // High score
    if (highScore > 0) {
      this.add.text(cx, cy + cardH * 0.44, `最高 ${highScore}`, {
        fontSize: '11px', color: PAL.gold as string, fontFamily: 'Arial',
      }).setOrigin(0.5);
    }

    // Hit area
    const zone = this.add.zone(cx, cy, cardW, cardH).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      g.clear();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(cx - cardW / 2 + 4, cy - cardH / 2 + 4, cardW, cardH, 14);
      g.fillStyle(info.bgColor + 0x111111, 1);
      g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
      g.lineStyle(2, PAL.goldNum, 0.8);
      g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
    });
    zone.on('pointerout', () => {
      g.clear();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(cx - cardW / 2 + 4, cy - cardH / 2 + 4, cardW, cardH, 14);
      g.fillStyle(info.bgColor, 1);
      g.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
      g.lineStyle(2, PAL.green, 0.5);
      g.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
    });
    zone.on('pointerdown', () => {
      AudioManager.getInstance().playSfx('click');
      this.cameras.main.flash(120, 255, 255, 255, false);
      this.time.delayedCall(100, () => {
        this.scene.start(info.sceneKey);
      });
    });
  }

  private _drawBgFlowers(W: number, H: number): void {
    const types = ALL_FLOWER_TYPES;
    const g = this.add.graphics();
    g.setAlpha(0.06);
    for (let i = 0; i < 18; i++) {
      const x  = Phaser.Math.Between(0, W);
      const y  = Phaser.Math.Between(0, H);
      const r  = Phaser.Math.Between(12, 28);
      const ft = types[i % types.length] as FlowerType;
      this._drawFlower(g, ft, x, y, r);
    }
  }

  private _drawFlower(g: Phaser.GameObjects.Graphics, type: FlowerType, x: number, y: number, r: number): void {
    const col = FLOWER_COLORS[type];
    g.fillStyle(col, 1);
    const petalCount = 6;
    for (let i = 0; i < petalCount; i++) {
      const a  = (i / petalCount) * Math.PI * 2;
      const px = x + Math.cos(a) * r * 0.65;
      const py = y + Math.sin(a) * r * 0.65;
      g.fillCircle(px, py, r * 0.4);
    }
    g.fillStyle(0xffd54f, 1);
    g.fillCircle(x, y, r * 0.3);
  }

  private _drawBottomBar(W: number, H: number): void {
    const save  = SaveService.getInstance();
    const audio = AudioManager.getInstance();
    const solid = SolidSyncService.getInstance();
    const barY  = H * 0.9;
    const iconSize = Math.max(32, W * 0.08);

    // Sound toggle
    const soundOn = save.profile.settings.soundEnabled;
    const sText   = this.add.text(W * 0.25, barY, soundOn ? '🔊' : '🔇', {
      fontSize: `${iconSize * 0.7}px`, fontFamily: 'Arial',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    sText.on('pointerdown', () => {
      const en = !save.profile.settings.soundEnabled;
      save.profile.settings.soundEnabled = en;
      audio.setSfxEnabled(en);
      save.save(save.profile);
      sText.setText(en ? '🔊' : '🔇');
      audio.playSfx('click');
    });

    // Music toggle
    const musicOn = save.profile.settings.musicEnabled;
    const mText   = this.add.text(W * 0.5, barY, musicOn ? '🎵' : '🔕', {
      fontSize: `${iconSize * 0.7}px`, fontFamily: 'Arial',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    mText.on('pointerdown', () => {
      const en = !save.profile.settings.musicEnabled;
      save.profile.settings.musicEnabled = en;
      audio.setMusicEnabled(en);
      save.save(save.profile);
      mText.setText(en ? '🎵' : '🔕');
    });

    // Solid status / login
    const solidLabel = solid.status === 'logged-in' ? '☁️ 已同步' : '☁️ 登录同步';
    const sBtn = this.add.text(W * 0.75, barY, solidLabel, {
      fontSize: `${Math.max(10, W * 0.028)}px`,
      color: solid.status === 'logged-in' ? PAL.subtext : '#80cbc4',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    sBtn.on('pointerdown', () => {
      if (solid.status !== 'logged-in') {
        const issuer = prompt('请输入你的 Solid POD 服务地址 (如 https://solidcommunity.net)');
        if (issuer) solid.login(issuer);
      } else {
        solid.push(save.profile).then(() => {
          save.profile.solid.lastSynced = Date.now();
          save.save(save.profile);
          sBtn.setText('☁️ 已同步');
        });
      }
    });
  }

  shutdown(): void {
    this.scale.off('resize', this._rebuild, this);
  }
}
