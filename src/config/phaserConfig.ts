import Phaser from 'phaser';
import { BootScene }           from '../scenes/BootScene.js';
import { PreloadScene }        from '../scenes/PreloadScene.js';
import { MainMenuScene }       from '../scenes/MainMenuScene.js';
import { FlowerPotsScene }     from '../scenes/FlowerPotsScene.js';
import { MahjongMergeScene }   from '../scenes/MahjongMergeScene.js';
import { BlockPlacementScene } from '../scenes/BlockPlacementScene.js';

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0d2b1a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  input: {
    activePointers: 4,  // multi-touch
  },
  render: {
    antialias: true,
    powerPreference: 'default',
  },
  physics: {
    default: 'matter',
    matter: {
      enableSleeping: true,
      gravity: { x: 0, y: 0.5 },
      debug: false
    }
  },
  fps: { target: 60, forceSetTimeOut: false },
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    FlowerPotsScene,
    MahjongMergeScene,
    BlockPlacementScene,
  ],
};
