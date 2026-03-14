# 小游戏合集 — Mini Games Hub

基于 **Phaser 3 + TypeScript + Vite** 的静态小游戏平台，包含三款休闲游戏、统一积分与等级系统、移动端触控支持、GitHub Pages 一键部署，以及可选的 Solid POD 云端存档同步。

## 游戏列表

| 游戏 | 玩法简介 |
|------|----------|
| 🌸 花园花盆 | 点击花朵放入匹配的花盆，装满后花盆消失、新花盆从左侧补入 |
| 🀄 麻将消除 | 横向拖动麻将牌，让相同的牌相遇消除，限时内创造最高连击 |
| 💎 方块钻石 | 拖放方块填满行列或对角线消除，消除含钻石的格子可获得额外加分 |

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器 (热更新)
npm run dev

# 本地预览构建产物
npm run build && npm run preview

# 静态文件 serve (用于其他设备访问)
npm run serve
```

## 生成 AI 素材

所有素材生成脚本均在**本地离线执行**，API 密钥不进入前端代码。

```bash
# 1. 复制并填写 API key
cp .env.example .env
# 编辑 .env，填入 SILICONFLOW_API_KEY

# 2. 生成背景图片 (Kolors 模型)
npm run generate:images

# 3. 合成语音素材 (CosyVoice2 模型)
npm run generate:voices

# 4. 检查素材 & 更新 manifest
node scripts/optimize-assets.mjs
```

生成的素材保存在 `public/assets/` 并提交入仓，前端只读取最终文件。

## GitHub Pages 部署

推送到 `main` 分支后，GitHub Actions 自动构建并发布到 Pages。

```bash
git push origin main
# 等待 Actions 完成后访问 https://<username>.github.io/<repo>/
```

**手动配置 Pages** (仅首次需要):  
Settings → Pages → Source: `GitHub Actions`

## Solid POD 存档同步

- 默认使用 **localStorage** 本地存档，无需账号即可游玩。
- 点击主界面 **☁️ 登录同步** 可选择 Solid POD 提供商（如 [solidcommunity.net](https://solidcommunity.net)）进行登录。
- 登录后存档会上传到你的 POD，多设备自动同步。
- 若断网，自动回退本地存档。

## 积分与等级系统

| 等级 | 称号 | 所需总 XP |
|------|------|-----------|
| 1 | 花园新手 | 0 |
| 2 | 园丁学徒 | 100 |
| 3 | 初级园丁 | 300 |
| 4 | 中级园丁 | 650 |
| 5 | 高级园丁 | 1150 |
| … | … | … |
| 10 | 花园传说 | 9250 |

三个游戏共享同一总 XP 池，各游戏得分按不同系数换算为 XP（方块钻石×1.2 > 麻将消除×1.0 > 花园花盆×0.8）。

## 技术栈

| 层 | 技术 |
|----|------|
| 游戏引擎 | [Phaser 3](https://phaser.io/) |
| 构建工具 | [Vite 5](https://vitejs.dev/) |
| 语言 | TypeScript 5 |
| 存档同步 | [Solid Project](https://solidproject.org/) + `@inrupt/solid-client` |
| AI 图片 | SiliconFlow — Kwai-Kolors/Kolors |
| AI 语音 | SiliconFlow — FunAudioLLM/CosyVoice2-0.5B |
| 部署 | GitHub Pages + GitHub Actions |

## 项目结构

```
mini-games/
├── public/assets/         # 静态素材 (AI生成后提交)
│   ├── images/ui/         # 背景图片
│   └── audio/             # bgm / sfx / voices
├── scripts/               # 离线素材生成脚本
│   ├── generate-images.mjs
│   ├── generate-voices.mjs
│   └── optimize-assets.mjs
├── src/
│   ├── config/            # Phaser 配置
│   ├── scenes/            # 游戏场景
│   ├── systems/           # 共享服务 (Score/Save/Audio…)
│   ├── types/             # TypeScript 类型
│   └── ui/                # 公共 UI 组件
├── .env.example           # API key 模板
├── .github/workflows/     # GitHub Actions CI/CD
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 移动端支持

- 支持竖屏和横屏，布局自动重排
- 触控事件由 Phaser 原生处理，支持多点触控拖拽
- 点击热区 ≥ 44px，符合移动端可访问性标准
- 禁用双击缩放和页面滚动，防止误操作
