/// <reference types="vite/client" />
import Phaser from 'phaser';
import { SaveService }  from '../systems/SaveService.js';
import { ScoreService } from '../systems/ScoreService.js';
import { AudioManager } from '../systems/AudioManager.js';
import { SolidSyncService } from '../systems/SolidSyncService.js';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  create(): void {
    (window as any).phaserGame = this.game;
    // 1. Init save + score services
    const save  = SaveService.getInstance();
    save.initialize();

    const score = ScoreService.getInstance();
    score.initialize(save.profile);

    // 2. Init audio (base URL from Vite)
    const baseUrl = import.meta.env.BASE_URL as string;
    const audio   = AudioManager.getInstance();
    audio.initialize(baseUrl, save.profile.settings.soundEnabled, save.profile.settings.musicEnabled);

    // 3. Attempt Solid session restore (non-blocking)
    SolidSyncService.getInstance().restoreSession().catch(() => { /* ignore */ });

    // 4. Proceed to preload
    this.scene.start('PreloadScene');
  }
}
