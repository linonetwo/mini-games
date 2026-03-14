/// <reference types="vite/client" />
import Phaser from 'phaser';
import { AudioManager } from '../systems/AudioManager.js';

/** Lists every audio file to attempt loading (missing files are silently skipped). */
const AUDIO_FILES: Array<{ key: string; path: string }> = [
  { key: 'sfx-click',       path: 'assets/audio/sfx/click.mp3'        },
  { key: 'sfx-place',       path: 'assets/audio/sfx/place.mp3'        },
  { key: 'sfx-error',       path: 'assets/audio/sfx/error.mp3'        },
  { key: 'sfx-clear',       path: 'assets/audio/sfx/clear.mp3'        },
  { key: 'sfx-combo',       path: 'assets/audio/sfx/combo.mp3'        },
  { key: 'sfx-levelup',     path: 'assets/audio/sfx/levelup.mp3'      },
  { key: 'sfx-merge',       path: 'assets/audio/sfx/merge.mp3'        },
  { key: 'sfx-diamond',     path: 'assets/audio/sfx/diamond.mp3'      },
  { key: 'sfx-potcomplete', path: 'assets/audio/sfx/potcomplete.mp3'  },
  { key: 'voice-rose',          path: 'assets/audio/voices/rose.mp3'          },
  { key: 'voice-sunflower',     path: 'assets/audio/voices/sunflower.mp3'     },
  { key: 'voice-tulip',         path: 'assets/audio/voices/tulip.mp3'         },
  { key: 'voice-daisy',         path: 'assets/audio/voices/daisy.mp3'         },
  { key: 'voice-lily',          path: 'assets/audio/voices/lily.mp3'          },
  { key: 'voice-orchid',        path: 'assets/audio/voices/orchid.mp3'        },
  { key: 'voice-chrysanthemum', path: 'assets/audio/voices/chrysanthemum.mp3' },
  { key: 'voice-violet',        path: 'assets/audio/voices/violet.mp3'        },
  { key: 'voice-combo',         path: 'assets/audio/voices/combo.mp3'         },
  { key: 'voice-levelup',       path: 'assets/audio/voices/levelup.mp3'       },
];

const IMAGE_FILES: Array<{ key: string; path: string }> = [
  { key: 'bg-menu',        path: 'assets/images/ui/bg-menu.jpg'        },
  { key: 'bg-flowerpots',  path: 'assets/images/ui/bg-flowerpots.jpg'  },
  { key: 'bg-mahjong',     path: 'assets/images/ui/bg-mahjong.jpg'     },
  { key: 'bg-blocks',      path: 'assets/images/ui/bg-blocks.jpg'      },
  { key: 'flower-rose',          path: 'assets/images/flowers/rose.jpg'          },
  { key: 'flower-sunflower',     path: 'assets/images/flowers/sunflower.jpg'     },
  { key: 'flower-tulip',         path: 'assets/images/flowers/tulip.jpg'         },
  { key: 'flower-daisy',         path: 'assets/images/flowers/daisy.jpg'         },
  { key: 'flower-lily',          path: 'assets/images/flowers/lily.jpg'          },
  { key: 'flower-orchid',        path: 'assets/images/flowers/orchid.jpg'        },
  { key: 'flower-chrysanthemum', path: 'assets/images/flowers/chrysanthemum.jpg' },
  { key: 'flower-violet',        path: 'assets/images/flowers/violet.jpg'        },
];

export class PreloadScene extends Phaser.Scene {
  private _bar!: Phaser.GameObjects.Rectangle;
  private _text!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'PreloadScene' }); }

  preload(): void {
    const base = import.meta.env.BASE_URL as string;
    const W = this.scale.width, H = this.scale.height;

    // ── loading bar ──────────────────────────────────────────────────────────
    const barW = Math.min(W * 0.6, 300), barH = 8;
    const bx = (W - barW) / 2, by = H / 2 + 30;

    const bg = this.add.rectangle(bx, by, barW, barH, 0x2d5a27).setOrigin(0);
    void bg;
    this._bar  = this.add.rectangle(bx, by, 0, barH, 0x5dbb63).setOrigin(0);
    this._text = this.add.text(W / 2, H / 2 - 10, '加载中…', {
      fontSize: '18px', color: '#ccffcc', fontFamily: 'Arial',
    }).setOrigin(0.5);

    this.load.on('progress', (v: number) => {
      this._bar.width  = barW * v;
      this._text.setText(`加载中… ${Math.floor(v * 100)}%`);
    });

    // ── load images (ignore 404) ─────────────────────────────────────────────
    for (const img of IMAGE_FILES) {
      this.load.image(img.key, base + img.path);
    }

    // ── load audio via Web Audio API (after unlock) ──────────────────────────
    const audio = AudioManager.getInstance();
    for (const a of AUDIO_FILES) {
      audio.loadFile(a.key, a.path).catch(() => { /* missing file — ok */ });
    }
  }

  create(): void {
    // Suppress Phaser 404 errors for optional assets
    this.load.on('loaderror', () => { /* intentionally empty */ });
    this.scene.start('MainMenuScene');
  }
}
