import type { LayoutInfo } from '../types/index.js';

export class ResponsiveLayoutService {
  private static _instance: ResponsiveLayoutService;

  private constructor() {}

  static getInstance(): ResponsiveLayoutService {
    if (!ResponsiveLayoutService._instance)
      ResponsiveLayoutService._instance = new ResponsiveLayoutService();
    return ResponsiveLayoutService._instance;
  }

  getLayout(scaleManager: Phaser.Scale.ScaleManager): LayoutInfo {
    const w = scaleManager.gameSize.width;
    const h = scaleManager.gameSize.height;
    return {
      width: w, height: h,
      isPortrait: h >= w,
      safeTop: 0, safeBottom: 0,
      cx: w / 2, cy: h / 2,
    };
  }

  /** Fit a source rect into a target rect, maintaining aspect ratio */
  fitRect(
    srcW: number, srcH: number,
    targetW: number, targetH: number,
    margin = 0,
  ): { scale: number; x: number; y: number; w: number; h: number } {
    const s  = Math.min((targetW - margin * 2) / srcW, (targetH - margin * 2) / srcH);
    const fw = srcW * s, fh = srcH * s;
    return { scale: s, x: (targetW - fw) / 2, y: (targetH - fh) / 2, w: fw, h: fh };
  }

  /** Evenly distribute N items across a width, return center X array */
  distributeX(count: number, totalW: number, offsetX: number, itemW: number): number[] {
    const gap = (totalW - count * itemW) / (count + 1);
    return Array.from({ length: count }, (_, i) => offsetX + gap * (i + 1) + itemW * (i + 0.5));
  }
}
