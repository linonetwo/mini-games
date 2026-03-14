import type { ProfileSave } from '../types/index.js';
import { DEFAULT_PROFILE } from '../types/index.js';

const SAVE_KEY = 'mini-games:profile';
const SAVE_VERSION = 1;

export class SaveService {
  private static _instance: SaveService;
  private _profile!: ProfileSave;

  private constructor() {}

  static getInstance(): SaveService {
    if (!SaveService._instance) SaveService._instance = new SaveService();
    return SaveService._instance;
  }

  initialize(): void { this._profile = this._load(); }

  get profile(): ProfileSave { return this._profile; }

  private _load(): ProfileSave {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ...DEFAULT_PROFILE, lastUpdated: Date.now() };
      const parsed = JSON.parse(raw) as ProfileSave;
      if (!parsed.version || parsed.version < SAVE_VERSION) return this._migrate(parsed);
      return { ...DEFAULT_PROFILE, ...parsed }; // forward-compat
    } catch { return { ...DEFAULT_PROFILE, lastUpdated: Date.now() }; }
  }

  private _migrate(old: Partial<ProfileSave>): ProfileSave {
    // Basic migration: keep whatever valid fields exist
    return {
      ...DEFAULT_PROFILE,
      totalScore: old.totalScore ?? 0,
      totalXP:    old.totalXP    ?? 0,
      level:      old.level      ?? 1,
      coins:      old.coins      ?? 0,
      settings:   { ...DEFAULT_PROFILE.settings, ...(old.settings ?? {}) },
      lastUpdated: Date.now(),
    };
  }

  save(profile: ProfileSave): void {
    this._profile = profile;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.warn('[SaveService] Could not write to localStorage', e);
    }
  }

  /** Merge a remote profile (Solid POD) with local, keeping highest XP */
  merge(remote: ProfileSave): ProfileSave {
    if (remote.totalXP > this._profile.totalXP) {
      const merged = { ...remote };
      // Keep local settings
      merged.settings = { ...this._profile.settings };
      this.save(merged);
      return merged;
    }
    return this._profile;
  }

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
    this._profile = { ...DEFAULT_PROFILE, lastUpdated: Date.now() };
  }
}
