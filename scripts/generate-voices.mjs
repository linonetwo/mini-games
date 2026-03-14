#!/usr/bin/env node
/**
 * generate-voices.mjs — 使用 SiliconFlow CosyVoice2 合成游戏语音素材
 *
 * 用法:
 *   SILICONFLOW_API_KEY=sk-xxx node scripts/generate-voices.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8');
    raw.split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim();
    });
  } catch { /* ok */ }
}
loadEnv();

const API_KEY = process.env.SILICONFLOW_API_KEY;
if (!API_KEY || API_KEY === 'sk-xxx') {
  console.error('❌ 请在 .env 中设置 SILICONFLOW_API_KEY');
  process.exit(1);
}

// ── 语音任务列表 ──────────────────────────────────────────────────────────────
const VOICES = [
  // 花名播报 (花盆游戏)
  { key: 'rose',          file: 'public/assets/audio/voices/rose.mp3',          text: '玫瑰花！', speed: 1.1 },
  { key: 'sunflower',     file: 'public/assets/audio/voices/sunflower.mp3',     text: '向日葵！', speed: 1.1 },
  { key: 'tulip',         file: 'public/assets/audio/voices/tulip.mp3',         text: '郁金香！', speed: 1.1 },
  { key: 'daisy',         file: 'public/assets/audio/voices/daisy.mp3',         text: '雏菊！', speed: 1.1 },
  { key: 'lily',          file: 'public/assets/audio/voices/lily.mp3',          text: '百合花！', speed: 1.1 },
  { key: 'orchid',        file: 'public/assets/audio/voices/orchid.mp3',        text: '兰花！', speed: 1.1 },
  { key: 'chrysanthemum', file: 'public/assets/audio/voices/chrysanthemum.mp3', text: '菊花！', speed: 1.1 },
  { key: 'violet',        file: 'public/assets/audio/voices/violet.mp3',        text: '紫罗兰！', speed: 1.1 },
  // 游戏提示
  { key: 'combo',         file: 'public/assets/audio/voices/combo.mp3',         text: '连击！太棒了！', speed: 1.2 },
  { key: 'levelup',       file: 'public/assets/audio/voices/levelup.mp3',       text: '升级了！继续加油！', speed: 1.0 },
  { key: 'gamestart',     file: 'public/assets/audio/voices/gamestart.mp3',     text: '游戏开始！', speed: 1.0 },
  { key: 'excellent',     file: 'public/assets/audio/voices/excellent.mp3',     text: '太出色了！', speed: 1.1 },
];

// ── API 调用 ──────────────────────────────────────────────────────────────────
async function synthesize(task) {
  const body = JSON.stringify({
    model: 'FunAudioLLM/CosyVoice2-0.5B',
    input: task.text,
    voice: 'FunAudioLLM/CosyVoice2-0.5B:diana',
    response_format: 'mp3',
    speed: task.speed ?? 1.0,
  });

  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.request({
      hostname: 'api.siliconflow.cn',
      path: '/v1/audio/speech',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      if (res.statusCode && res.statusCode >= 400) {
        let err = '';
        res.on('data', d => { err += d; });
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${err.slice(0, 200)}`)));
        return;
      }
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
console.log('🎤 开始合成游戏语音素材…\n');

for (const task of VOICES) {
  const dest = join(ROOT, task.file);
  mkdirSync(dirname(dest), { recursive: true });
  console.log(`  合成 "${task.text}"…`);
  try {
    const buf = await synthesize(task);
    writeFileSync(dest, buf);
    console.log(`  ✅ 已保存 → ${task.file}`);
  } catch (e) {
    console.error(`  ❌ 失败: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 600));
}

console.log('\n✨ 语音合成完成！');
