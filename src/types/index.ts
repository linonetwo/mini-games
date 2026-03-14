// ─── 花朵类型 ─────────────────────────────────────────────────────────────────

export type FlowerType =
  | 'rose' | 'sunflower' | 'tulip' | 'daisy'
  | 'lily' | 'orchid' | 'chrysanthemum' | 'violet';

export const FLOWER_NAMES: Record<FlowerType, string> = {
  rose: '玫瑰花', sunflower: '向日葵', tulip: '郁金香', daisy: '雏菊',
  lily: '百合花', orchid: '兰花', chrysanthemum: '菊花', violet: '紫罗兰',
};

export const FLOWER_COLORS: Record<FlowerType, number> = {
  rose: 0xe74c3c, sunflower: 0xf39c12, tulip: 0xec407a, daisy: 0xfff176,
  lily: 0xff7043, orchid: 0xab47bc, chrysanthemum: 0x7e57c2, violet: 0x4a148c,
};

export const FLOWER_CENTER_COLORS: Record<FlowerType, number> = {
  rose: 0xffd54f, sunflower: 0x4e342e, tulip: 0xffd54f, daisy: 0xf9a825,
  lily: 0xffd54f, orchid: 0xfff9c4, chrysanthemum: 0xffd54f, violet: 0xffd54f,
};

export const ALL_FLOWER_TYPES: FlowerType[] = [
  'rose', 'sunflower', 'tulip', 'daisy', 'lily', 'orchid', 'chrysanthemum', 'violet',
];

// ─── 麻将类型 ─────────────────────────────────────────────────────────────────

export type MahjongSuit = 'bamboo' | 'circle' | 'character';

export interface MahjongTileType { suit: MahjongSuit; value: number; }

export const MAHJONG_COLORS: Record<MahjongSuit, number> = {
  bamboo: 0x2e7d32, circle: 0x1565c0, character: 0xb71c1c,
};
export const MAHJONG_SUIT_CHARS: Record<MahjongSuit, string> = {
  bamboo: '索', circle: '饼', character: '万',
};

// ─── 游戏信息 ─────────────────────────────────────────────────────────────────

export type GameId = 'flowerpots' | 'mahjong' | 'blocks';

export interface GameInfo {
  id: GameId; title: string; description: string;
  sceneKey: string; bgColor: number; iconColor: number; emoji: string;
}

export const GAMES: GameInfo[] = [
  {
    id: 'flowerpots', title: '花园花盆', emoji: '🌸',
    description: '点击花朵放入匹配的花盆',
    sceneKey: 'FlowerPotsScene', bgColor: 0x2e7d32, iconColor: 0xec407a,
  },
  {
    id: 'mahjong', title: '麻将消除', emoji: '🀄',
    description: '横向拖动让相同的牌相遇消除',
    sceneKey: 'MahjongMergeScene', bgColor: 0x1a237e, iconColor: 0xffd54f,
  },
  {
    id: 'blocks', title: '方块钻石', emoji: '💎',
    description: '放置方块消除行列获得钻石',
    sceneKey: 'BlockPlacementScene', bgColor: 0x311b92, iconColor: 0x40c4ff,
  },
];

// ─── 等级表 ───────────────────────────────────────────────────────────────────

export interface LevelInfo {
  level: number; xpRequired: number; xpForNext: number; title: string;
}

export const LEVEL_TABLE: LevelInfo[] = [
  { level: 1,  xpRequired: 0,     xpForNext: 100,  title: '花园新手' },
  { level: 2,  xpRequired: 100,   xpForNext: 200,  title: '园丁学徒' },
  { level: 3,  xpRequired: 300,   xpForNext: 350,  title: '初级园丁' },
  { level: 4,  xpRequired: 650,   xpForNext: 500,  title: '中级园丁' },
  { level: 5,  xpRequired: 1150,  xpForNext: 700,  title: '高级园丁' },
  { level: 6,  xpRequired: 1850,  xpForNext: 1000, title: '资深园丁' },
  { level: 7,  xpRequired: 2850,  xpForNext: 1400, title: '花园专家' },
  { level: 8,  xpRequired: 4250,  xpForNext: 2000, title: '花园大师' },
  { level: 9,  xpRequired: 6250,  xpForNext: 3000, title: '园林艺术家' },
  { level: 10, xpRequired: 9250,  xpForNext: 99999, title: '花园传说' },
];

// ─── 存档类型 ─────────────────────────────────────────────────────────────────

export interface GameStats {
  highScore: number; totalGames: number; totalScore: number;
}

export interface ProfileSave {
  version: number;
  totalScore: number; totalXP: number; level: number; coins: number;
  games: { flowerpots: GameStats; mahjong: GameStats; blocks: GameStats };
  settings: { soundEnabled: boolean; musicEnabled: boolean; vibrationEnabled: boolean };
  solid: { webId: string | null; lastSynced: number };
  lastUpdated: number;
}

export const DEFAULT_PROFILE: ProfileSave = {
  version: 1, totalScore: 0, totalXP: 0, level: 1, coins: 0,
  games: {
    flowerpots: { highScore: 0, totalGames: 0, totalScore: 0 },
    mahjong:    { highScore: 0, totalGames: 0, totalScore: 0 },
    blocks:     { highScore: 0, totalGames: 0, totalScore: 0 },
  },
  settings: { soundEnabled: true, musicEnabled: true, vibrationEnabled: true },
  solid: { webId: null, lastSynced: 0 },
  lastUpdated: 0,
};

// ─── 游戏结果 ─────────────────────────────────────────────────────────────────

export interface GameResult {
  gameId: GameId; score: number; duration: number;
  extraData?: Record<string, unknown>;
}

// ─── 布局类型 ─────────────────────────────────────────────────────────────────

export interface LayoutInfo {
  width: number; height: number;
  isPortrait: boolean; safeTop: number; safeBottom: number;
  cx: number; cy: number;          // canvas center
}
