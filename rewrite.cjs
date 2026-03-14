const fs = require('fs');
let txt = fs.readFileSync('src/scenes/FlowerPotsScene.ts', 'utf8');

// Use the exact match to replace _createFlowerImage
txt = txt.replace(/private _createFlowerImage\(type: FlowerType, x: number, y: number, r: number\): Phaser\.GameObjects\.Container \{[\s\S]*?return c;\s*\}/m, `private _createFlowerImage(type: any, x: number, y: number, r: number) {
      const img = this.add.sprite(x, y, \`flower-circle-\${type}\`);
      img.setDisplaySize(r * 2, r * 2);
      return img;
    }`);

// Replace spawn code fImg.setSize...
const regexSpawn = /const fImg = this\._createFlowerImage\(type, fx, fy, flowerR\);[\s\S]*?fImg\.setSize.*?;\s*fImg\.setInteractive.*?;(\s*if\(fImg\.input\) fImg\.input\.cursor.*?;)?/gm;

txt = txt.replace(regexSpawn, `const fImg = this._createFlowerImage(type, fx, fy, flowerR);
          fImg.setInteractive();
          if(fImg.input) fImg.input.cursor = 'pointer';`);

// Quick workaround for any type issues
txt = txt.replace(/container: Phaser\.GameObjects\.Container;/g, 'container: Phaser.GameObjects.Sprite | Phaser.GameObjects.Container | any;');

if (!txt.includes('TextureGenerator.generateFlowerTextures(this)')) {
    txt = txt.replace(/this\._buildQueue\(\);\s*this\._calcLayout\(\);/m, 
`this._buildQueue();
      this._calcLayout();
      TextureGenerator.generateFlowerTextures(this);`);
}

if(!txt.includes('import { TextureGenerator }')) {
    txt = txt.replace(/import \{ GameOverOverlay \} from '\.\.\/ui\/GameOverOverlay\.js';/, `import { GameOverOverlay } from '../ui/GameOverOverlay.js';
import { TextureGenerator } from './flowerpots/TextureGenerator.js';`);
}

fs.writeFileSync('src/scenes/FlowerPotsScene.ts', txt);