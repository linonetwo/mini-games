import Phaser from 'phaser';
import { ALL_FLOWER_TYPES, FLOWER_COLORS } from '../../types/index.js';
import type { FlowerType } from '../../types/index.js';

export class TextureGenerator {
  static generateFlowerTextures(scene: Phaser.Scene): void {
    const size = 128;
    const r = size / 2;

    for (const type of ALL_FLOWER_TYPES) {
      const key = `flower-${type}`;
      const outKey = `flower-circle-${type}`;

      if (scene.textures.exists(outKey)) continue;

      if (!scene.textures.exists(key)) {
        const g = scene.make.graphics({ x: 0, y: 0 }, false);
        g.fillStyle(FLOWER_COLORS[type as FlowerType] || 0xffffff, 1);
        g.fillCircle(r, r, r);
        g.generateTexture(outKey, size, size);
        g.destroy();
        continue;
      }

      const src = scene.textures.get(key).getSourceImage();
      if (src instanceof HTMLImageElement || src instanceof HTMLCanvasElement) {
        const canvasTex = scene.textures.createCanvas(outKey, size, size);
        if (canvasTex) {
          const ctx = canvasTex.getContext();
          
          ctx.beginPath();
          ctx.arc(r, r + 2, r - 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fill();

          ctx.save();
          ctx.beginPath();
          ctx.arc(r, r - 2, r - 4, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();

          ctx.drawImage(src, 0, 0, src.width, src.height, 4, 4, size - 8, size - 8);

          ctx.restore();

          ctx.beginPath();
          ctx.arc(r, r - 2, r - 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 4;
          ctx.stroke();

          canvasTex.refresh();
        }
      }
    }
  }
}