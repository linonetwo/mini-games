const fs = require('fs');
let txt = fs.readFileSync('src/scenes/FlowerPotsScene.ts', 'utf8');

// replace _createFlowerImage with simple implementation using generated texture
txt = txt.replace(/private _createFlowerImage[\s\S]*?return c;\s*\}/m, `private _createFlowerImage(type: FlowerType, x: number, y: number, r: number) {
      const img = this.add.sprite(x, y, \`flower-circle-\${type}\`);
      img.setDisplaySize(r * 2, r * 2);
      return img;
    }`);

// Change container: Phaser.GameObjects.Container to Sprite everywhere relevant inside FlowerPotsScene.ts
// Wait, we can just replace what's needed.
txt = txt.replace(/container: Phaser.GameObjects.Container;/g, 'container: Phaser.GameObjects.Sprite | Phaser.GameObjects.Container;');

// Replace spawn code
const fImgSpawnRegex = /const fImg = this\._createFlowerImage\(type, fx, fy, flowerR\);\s*fImg\.setSize\(flowerR \* 2, flowerR \* 2\);\s*fImg\.setInteractive\(new Phaser\.Geom\.Circle\(0, 0, flowerR\), Phaser\.Geom\.Circle\.Contains\);\s*if\(fImg\.input\) fImg\.input\.cursor = "pointer";/gm;

txt = txt.replace(fImgSpawnRegex, `const fImg = this._createFlowerImage(type, fx, fy, flowerR);
          fImg.setInteractive();
          if(fImg.input) fImg.input.cursor = "pointer";`);

// add texture generator logic
if (!txt.includes('TextureGenerator.generateFlowerTextures(this)')) {
    txt = txt.replace(/this\._buildQueue\(\);\s*this\._calcLayout\(\);/m, 
`this._buildQueue();
      this._calcLayout();
      TextureGenerator.generateFlowerTextures(this);`);
}

// Add import
if(!txt.includes('import { TextureGenerator }')) {
    txt = txt.replace(/import \{ GameOverOverlay \} from '\.\.\/ui\/GameOverOverlay\.js';/, `import { GameOverOverlay } from '../ui/GameOverOverlay.js';
import { TextureGenerator } from './flowerpots/TextureGenerator.js';`);
}

fs.writeFileSync('src/scenes/FlowerPotsScene.ts', txt);