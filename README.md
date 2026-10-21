# 有声书在线播放器

纯静态前端，无后端依赖。音频与字幕托管于云盘，本仓库只含播放器运行必需文件。

---

## 在线使用

部署到任意静态托管（Cloudflare Pages / Vercel / Netlify / GitHub Pages）即可，
无需构建步骤，把本目录直接作为发布根目录。

本地预览：

```bash
python -m http.server 8080
# 或任意支持 Range 的静态服务：npx serve / npx http-server
# 访问 http://127.0.0.1:8080/
```

> 必须通过 HTTP 访问，不能直接双击 `index.html`（`file://` 无法 fetch JSON）。
> 进度条拖动依赖服务端支持 HTTP Range，`python -m http.server` 不支持，
> 本地测试建议用 `npx serve`。

---

## 目录结构

```
online/
├── index.html                 入口
├── manifest.json              书目索引
├── wrangler.jsonc             Cloudflare Workers 部署配置
├── .assetsignore              Workers 静态资源上传排除规则
├── _headers                   静态托管响应头（缓存策略）
├── _redirects                 静态托管重定向（本项目为空，见部署章节）
├── css/
│   └── style.css              样式（设计令牌集中在文件顶部）
├── js/
│   ├── app.js                 主逻辑
│   └── background.js          动态背景动画
├── books-config/
│   └── <书名>.json            章节索引（媒体路径指向云盘直链）
├── fonts/
│   ├── fonts.json             字体元数据
│   └── *.TTF / *.TTC          中文字体
└── bgm/
    └── *.mp3                  背景音乐
```

**不包含**（已加入 `.gitignore`）：`books/`（章节音频）、`subs/`（字幕 JSON）、
构建脚本、自检脚本、字幕源文件。

部署到 Workers 时实际只上传 **17 个文件**（`.git/`、配置文件、脚本均被 `.assetsignore` 排除）。

---

## 媒体架构

音频与字幕不在本仓库，全部通过云盘直链加载：

```
books-config/<书名>.json
    └── chapters[]
          ├── audio.src     → https://<云盘>/<书名>/mp3/001_xxx.mp3
          └── subtitle.json → https://<云盘>/<书名>/sub/001_xxx.json
```

云盘需满足：

| 条件 | 原因 |
|---|---|
| 支持 HTTP Range（206） | 进度条拖动 |
| `Access-Control-Allow-Origin: *` | 跨域加载字幕 JSON |
| 正确的 `Content-Type` | `audio/mpeg` / `application/json` |

---

## 数据结构 (v4)

### manifest.json

书目索引，只含索引字段，不含章节数据：

```jsonc
{
  "version": 4,
  "baseURL": "./",
  "generatedAt": "2026-09-26T16:34:08Z",
  "bookCount": 1,
  "bgm": ["bgm/曲目1.mp3", "bgm/曲目2.mp3"],
  "books": [
    {
      "id": "打卡-人在洪荒-刚捏爆三足金乌-by-何为孤独",
      "title": "打卡，人在洪荒，刚捏爆三足金乌 by 何为孤独",
      "description": "",
      "config": "books-config/打卡-人在洪荒-刚捏爆三足金乌-by-何为孤独.json"
    }
  ]
}
```

### books-config/\*.json

每本书独立配置：

```jsonc
{
  "id": "打卡-人在洪荒-刚捏爆三足金乌-by-何为孤独",
  "title": "打卡，人在洪荒，刚捏爆三足金乌 by 何为孤独",
  "chapterGroupSize": 0,        // 章节分页大小，0=不分页
  "chapterCount": 488,
  "chapters": [
    {
      "id": "001",
      "title": "第一章，无耻的准提圣人",
      "audio": {
        "src": "https://<云盘>/<书名>/mp3/001_第一章，无耻的准提圣人.mp3",
        "duration": 313.2
      },
      "subtitle": {
        "json": "https://<云盘>/<书名>/sub/001_第一章，无耻的准提圣人.json"
      }
    }
  ]
}
```

### 字幕 JSON

```json
[
  { "start": 100, "end": 2862, "text": "洪荒太阳星 遍及热浪的汤谷" }
]
```

时间单位毫秒。`start` / `end` 为该条字幕的起止时间。

### fonts/fonts.json

```json
[
  { "file": "STZHONGS.TTF", "name": "华文中宋", "family": "STZhongsong" }
]
```

`name` 用于下拉框显示，`family` 用于 CSS `font-family` 与 FontFace API。

---

## 功能

| 特性 | 说明 |
|---|---|
| **书架 / 章节 / 播放器三视图** | 主页居中书架卡片，点书加载章节列表 |
| **章节分页** | 按 `chapterGroupSize` 分页，0 表示不分页 |
| **音频播放** | 进度拖动、倍速（0.75–2.0）、音量、自动连播 |
| **字幕三态** | 单行悬浮 / 展开滚动列表 / 关闭 |
| **字幕自定义** | 位置（底/中/顶）、字号（14–32px）、8 种中文字体 |
| **悬浮字幕弹窗** | `window.open` 独立浏览器窗口，`postMessage` 同步字幕与字体 |
| **背景音乐** | 独立音量、曲目切换、单曲循环，不占播放器进度 |
| **动态背景** | 极光 / 星尘 / 音浪，随音频频谱响应 |
| **进度记忆** | 自动保存阅读位置，下次打开恢复书 + 章 + 秒数 |
| **闲置自动隐藏** | 播放时 3.5 秒无操作淡出 UI |
| **键盘快捷键** | 见下表 |
| **MediaSession** | 支持系统媒体控制（耳机按键、锁屏控制） |

---

## 快捷键

| 按键 | 功能 |
|---|---|
| `Space` | 播放 / 暂停 |
| `←` / `→` | 后退 / 前进 5 秒 |
| `↑` / `↓` | 音量 +5% / -5% |
| `N` | 下一章 |
| `P` | 上一章 |
| `C` | 字幕模式切换（单行 → 展开 → 关） |
| `L` | 显示 / 隐藏侧边栏 |
| `B` | 背景动画切换 |
| `M` | 背景音乐开关 |
| `Esc` | 关闭设置面板 / 切换侧边栏 |

---

## 添加新书

1. 用 `novel2audio.py` 合成音频 + SRT（该脚本不在此仓库）
2. 用 `build_manifest.py` 生成配置（该脚本不在此仓库）
3. 用 `convert_to_cloud.py` 把本地路径转成云盘直链（该脚本不在此仓库）
4. 上传 MP3 与字幕 JSON 到云盘对应目录
5. 把生成的 `manifest.json` 和 `books-config/*.json` 提交到本仓库

云盘目录约定：

```
<云盘前缀>/
└── <书名>/
    ├── mp3/001_第一章.mp3
    └── sub/001_第一章.json
```

---

## 部署

### Cloudflare Workers（推荐）

仓库已内置 `wrangler.jsonc`，直接连接 Git 部署即可：

```
Framework preset : None
Build command    : npx wrangler deploy
Build output dir : /（仓库根目录）
```

或命令行手动部署：

```bash
npx wrangler deploy
```

配置要点：

| 配置 | 值 | 说明 |
|---|---|---|
| `assets.directory` | `.` | 仓库根目录即静态资源 |
| `assets.html_handling` | `auto-trailing-slash` | `/` → `/index.html`，`/index.html` → 307 → `/` |
| `assets.not_found_handling` | 不设置（默认 404） | 见下方警告 |

#### 两个必须注意的坑

**1. `_redirects` 不能写 `/ → /index.html 200`**

Workers 默认 `html_handling: auto-trailing-slash` 已内置这个映射。
再写一遍会与内置规则冲突形成无限循环，部署报错：

```
Invalid _redirects configuration:
Line N: Infinite loop detected in this rule. This would cause a redirect
to strip `.html` or `/index` and end up triggering this rule again.
[code: 100324]
```

本项目 `_redirects` 已清空（仅保留说明注释）。

**2. 用 `.assetsignore` 排除非资源文件**

`assets.directory` 下的**所有文件**都会被当作静态资源上传，
包括 `.git/` 目录。不排除会出现日志里大量 `+ /.git/HEAD`、`+ /.git/config`，
既浪费上传配额又把 Git 元数据暴露到公网。

本项目 `.assetsignore` 已排除：`.git/`、`_headers`、`_redirects`、
`wrangler.jsonc`、`*.py`、`*.md`、`_*.mjs` 等。
实际只上传 **17 个文件**（全部是前端运行必需）。

**3. 不要用 `not_found_handling: "single-page-application"`**

该选项会让未命中的请求返回 `index.html`（200），
导致缺失的音频/字幕/字体请求收到 HTML，`<audio>` 报格式错误。
本项目所有资源按真实路径直接命中，无需兜底。

### Cloudflare Pages

```
Framework preset : None
Build command    : (留空)
Build output dir : /（仓库根目录）
```

Pages 同样识别 `_headers`，但**不识别 `.assetsignore`**（Pages 只上传 Git 跟踪的文件，
`.git/` 天然不会上传）。

### 其他平台

Vercel / Netlify / GitHub Pages 均可，输出目录填仓库根目录。
`_headers` 与 `_redirects` 仅 Cloudflare / Netlify 识别，其他平台会忽略。

> 不要加 `/* → /index.html 200` 的 SPA 兜底规则，
> 否则缺失的资源会被重写成 HTML，导致 `<audio>` 报格式错误。

---

## 浏览器要求

| 特性 | 最低版本 |
|---|---|
| 基础播放 | Chrome 60+ / Edge 79+ / Firefox 55+ / Safari 11+ |
| `captureStream` 音频分析 | Chrome 53+ / Edge 79+ / Firefox 43+ |
| FontFace API | Chrome 35+ / Firefox 41+ / Safari 10+ |
| 悬浮弹窗 | 需允许弹窗 |

> 音频分析不可用时会静默降级：声音正常播放，仅背景动画不随音频律动。
