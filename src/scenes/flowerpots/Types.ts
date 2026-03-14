import Phaser from 'phaser';
import type { FlowerType } from '../../types/index.js';

export interface BubbleFlowerData {
  type: FlowerType;
  sprite: Phaser.GameObjects.Sprite;
  bubble: BubbleData;
  active: boolean;
  localX: number;
  localY: number;
}

export interface BubbleData {
  id: string;
  container: Phaser.GameObjects.Container;
  flowers: BubbleFlowerData[];
  bg: Phaser.GameObjects.Graphics;
  radius: number;
}

export interface PotData {
  type: FlowerType;
  capacity: number;
  count: number;
  slotIndex: number;
  container: Phaser.GameObjects.Container | null;
  countText: Phaser.GameObjects.Text | null;
  dotGraphics: Phaser.GameObjects.Graphics | null;
}