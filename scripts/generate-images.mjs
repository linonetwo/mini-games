#!/usr/bin/env node
/**
 * generate-images.mjs — 使用 SiliconFlow Kolors 模型批量生成游戏背景图片
 *
 * 用法:
 *   SILICONFLOW_API_KEY=sk-xxx node scripts/generate-images.mjs
 *   或: cp .env.example .env  # 填入 key，然后 npm run generate:images
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── 读取 .env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8');
    raw.split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim();
    });
  } catch { /* .env not required */ }
}
loadEnv();

const API_KEY = process.env.SILICONFLOW_API_KEY;
if (!API_KEY || API_KEY === 'sk-xxx') {
  console.error('❌ 请在 .env 中设置 SILICONFLOW_API_KEY');
  process.exit(1);
}

// ── 图片任务列表 ──────────────────────────────────────────────────────────────
const IMAGES = [
  {
    key: 'bg-menu',
    file: 'public/assets/images/ui/bg-menu.jpg',
    prompt: 'Beautiful cartoon garden, colorful flowers, butterflies, sunlight, lush green grass, fairy-tale style, soft pastel colors, game background art, no text, 4k quality',
    negative: 'text, watermark, ugly, blurry',
    size: '1024x576',
  },
  {
    key: 'bg-flowerpots',
    file: 'public/assets/images/ui/bg-flowerpots.jpg',
    prompt: 'Cozy garden workshop with clay flower pots on wooden shelves, colorful flowers, warm lighting, cartoon style game background, cute art style, no text',
    negative: 'text, watermark, ugly, blurry, dark',
    size: '1024x576',
  },
  {
    key: 'bg-mahjong',
    file: 'public/assets/images/ui/bg-mahjong.jpg',
    prompt: 'Traditional Chinese tea house interior, mahjong table, warm lantern lights, red and gold decorations, elegant atmosphere, cartoon game background art, no text',
    negative: 'text, watermark, ugly, blurry',
    size: '1024x576',
  },
  {
    key: 'bg-blocks',
    file: 'public/assets/images/ui/bg-blocks.jpg',
    prompt: 'Magical crystal cave with glowing gems and diamonds, vibrant colors, geometric patterns, fantasy game background, neon lights, no text, cartoon art style',
    negative: 'text, watermark, ugly, blurry',
    size: '1024x576',
  },
];

// ── API 调用 ──────────────────────────────────────────────────────────────────
async function generateImage(task) {
  const body = JSON.stringify({
    model: 'black-forest-labs/FLUX.1-schnell',
    prompt: task.prompt,
    image_size: task.size,
    batch_size: 1,
    num_inference_steps: 4,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.siliconflow.cn',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.images?.[0]?.url) {
            resolve(parsed.images[0].url);
          } else if (parsed.data?.[0]?.url) {
            resolve(parsed.data[0].url);
          } else {
            reject(new Error(`Bad response: ${data.slice(0, 200)}`));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function downloadFile(url, destPath) {
  mkdirSync(dirname(destPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = { data: [] };
    protocol.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      res.on('data', chunk => file.data.push(chunk));
      res.on('end', () => {
        writeFileSync(destPath, Buffer.concat(file.data));
        resolve();
      });
    }).on('error', reject);
  });
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
console.log('🎨 开始生成游戏背景图片…\n');

for (const task of IMAGES) {
  const dest = join(ROOT, task.file);
  console.log(`  生成 ${task.key}…`);
  try {
    const url = await generateImage(task);
    await downloadFile(url, dest);
    console.log(`  ✅ 已保存 → ${task.file}`);
  } catch (e) {
    console.error(`  ❌ 失败: ${e.message}`);
  }
  // Brief delay to avoid rate-limiting
  await new Promise(r => setTimeout(r, 800));
}

console.log('\n✨ 图片生成完成！');
