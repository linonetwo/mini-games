import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FLOWERS = [
  { key: 'rose', name: 'red rose' },
  { key: 'sunflower', name: 'sunflower' },
  { key: 'tulip', name: 'pink tulip' },
  { key: 'daisy', name: 'daisy' },
  { key: 'lily', name: 'white lily' },
  { key: 'orchid', name: 'purple orchid' },
  { key: 'chrysanthemum', name: 'yellow chrysanthemum' },
  { key: 'violet', name: 'violet flower' },
];

const IMAGES = FLOWERS.map(f => ({
  key: f.key,
  file: `public/assets/images/flowers/${f.key}.jpg`,
  prompt: `A beautiful ${f.name} flower, thick oil painting style, vibrant colors, close-up, game icon asset, solid white background, high quality, no text`,
  size: '1024x1024'
}));

const API_KEY = process.env.SILICONFLOW_API_KEY;

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
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
    }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.images?.[0]?.url || parsed.data?.[0]?.url);
        } catch (e) { reject(e); }
      });
    });
    req.write(body); req.end();
  });
}

async function downloadFile(url, destPath) {
  mkdirSync(dirname(destPath), { recursive: true });
  return new Promise((resolve, reject) => {
    (url.startsWith('https') ? https : http).get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) return downloadFile(res.headers.location, destPath).then(resolve);
      const file = { data: [] };
      res.on('data', chunk => file.data.push(chunk));
      res.on('end', () => { writeFileSync(destPath, Buffer.concat(file.data)); resolve(); });
    });
  });
}

console.log('开始生成油画风花朵素材…');
for (const task of IMAGES) {
  try {
    const dest = join(ROOT, task.file);
    if (!existsSync(dest)) {
      const url = await generateImage(task);
      await downloadFile(url, dest);
      console.log(`✅ 已保存 -> ${task.file}`);
    } else {
      console.log(`✅ 已跳过 (已存在) -> ${task.file}`);
    }
  } catch (e) { console.error(`❌ 失败: ${task.key} - ${e.message}`); }
  await new Promise(r => setTimeout(r, 2000));
}
