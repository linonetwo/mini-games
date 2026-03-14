#!/usr/bin/env node
/**
 * optimize-assets.mjs — 检查生成的图片/音频并更新 manifest.json
 * 可选: 使用 sharp 压缩图片 (npm install -D sharp)
 */

import { existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const IMAGE_DIR = join(ROOT, 'public/assets/images');
const AUDIO_DIR = join(ROOT, 'public/assets/audio');

function scanDir(dir, exts) {
  if (!existsSync(dir)) return [];
  const results = [];
  function walk(d, rel) {
    readdirSync(d).forEach(f => {
      const full = join(d, f), relPath = join(rel, f);
      if (statSync(full).isDirectory()) { walk(full, relPath); }
      else if (exts.includes(extname(f).toLowerCase())) {
        results.push({ file: relPath.replace(/\\/g, '/'), size: statSync(full).size });
      }
    });
  }
  walk(dir, '');
  return results;
}

const images = scanDir(IMAGE_DIR, ['.jpg', '.jpeg', '.png', '.webp']);
const audio  = scanDir(AUDIO_DIR, ['.mp3', '.ogg', '.wav']);

const manifest = {
  version: new Date().toISOString(),
  images: Object.fromEntries(images.map(i => [basename(i.file, extname(i.file)), `assets/images/${i.file}`])),
  audio:  Object.fromEntries(audio.map(a  => [basename(a.file, extname(a.file)),  `assets/audio/${a.file}`])),
};

const outPath = join(ROOT, 'src/assets/manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));

console.log(`✅ manifest.json 已更新 (${images.length} 图片, ${audio.length} 音频)`);

// Optional: resize images with sharp if available
let sharp;
try { sharp = (await import('sharp')).default; } catch { /* optional */ }

if (sharp && images.length > 0) {
  console.log('🔧 压缩图片…');
  for (const img of images) {
    const full = join(IMAGE_DIR, img.file);
    if (img.size > 300_000) { // compress if > 300KB
      try {
        await sharp(full).jpeg({ quality: 82, progressive: true }).toFile(full + '.tmp');
        const { renameSync } = await import('fs');
        renameSync(full + '.tmp', full);
        console.log(`  ✅ 压缩 ${img.file}`);
      } catch (e) { console.warn(`  ⚠ ${img.file}: ${e.message}`); }
    }
  }
}
