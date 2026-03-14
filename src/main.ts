import Phaser from 'phaser';
import { phaserConfig } from './config/phaserConfig.js';

const game = new Phaser.Game(phaserConfig);

// Hide native loading screen once Phaser canvas is ready
game.events.once(Phaser.Core.Events.READY, () => {
  const el = document.getElementById('loading-screen');
  if (el) el.classList.add('hidden');
});

export default game;
