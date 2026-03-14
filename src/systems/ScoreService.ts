import { LEVEL_TABLE, DEFAULT_PROFILE } from '../types/index.js';
import type { ProfileSave, GameId, GameResult, LevelInfo } from '../types/index.js';

export class ScoreService {
  private static _instance: ScoreService;
  private _profile!: ProfileSave;

  private constructor() {}

  static getInstance(): ScoreService {
    if (!ScoreService._instance) ScoreService._instance = new ScoreService();
    return ScoreService._instance;
  }

  initialize(profile: ProfileSave): void { this._profile = profile; }

  get profile(): ProfileSave { return this._profile; }
  get totalScore(): number { return this._profile.totalScore; }
  get totalXP(): number    { return this._profile.totalXP; }
  get level(): number      { return this._profile.level; }
  get coins(): number      { return this._profile.coins; }

  /** Game-specific raw-score → global XP multipliers */
  private xpMultiplier(id: GameId): number {
    return id === 'blocks' ? 1.2 : id === 'mahjong' ? 1.0 : 0.8;
  }

  submitResult(result: GameResult): { xpGained: number; coinsGained: number; levelsGained: number } {
    const xpGained    = Math.floor(result.score * this.xpMultiplier(result.gameId));
    const coinsGained = Math.floor(result.score / 10);

    this._profile.totalScore  += result.score;
    this._profile.totalXP     += xpGained;
    this._profile.coins       += coinsGained;

    const gs = this._profile.games[result.gameId];
    gs.totalScore += result.score;
    gs.totalGames += 1;
    if (result.score > gs.highScore) gs.highScore = result.score;

    const oldLevel = this._profile.level;
    this._profile.level = this.calcLevel(this._profile.totalXP);
    this._profile.lastUpdated = Date.now();

    return { xpGained, coinsGained, levelsGained: this._profile.level - oldLevel };
  }

  calcLevel(xp: number): number {
    let lv = 1;
    for (const row of LEVEL_TABLE) { if (xp >= row.xpRequired) lv = row.level; else break; }
    return lv;
  }

  getLevelInfo(): LevelInfo {
    return LEVEL_TABLE.find(r => r.level === this._profile.level) ?? LEVEL_TABLE[LEVEL_TABLE.length - 1];
  }

  getXPProgress(): { current: number; required: number; pct: number } {
    const info = this.getLevelInfo();
    const cur = this._profile.totalXP - info.xpRequired;
    return { current: cur, required: info.xpForNext, pct: Math.min(100, Math.floor((cur / info.xpForNext) * 100)) };
  }

  reset(): void { this._profile = { ...DEFAULT_PROFILE, lastUpdated: Date.now() }; }
}
