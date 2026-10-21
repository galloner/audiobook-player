# 有声书在线播放器

纯静态前端，无后端依赖。v4 分层架构：目录索引 + 每书独立配置 + 字幕资源分离。

## 快速开始

```bash
# 1. 放文件
books/<书名>/<编号>_<章节标题>.mp3   （音频）
books/<书名>/<编号>_<章节标题>.srt   （字幕，可选）

# 2. 生成目录（v4 分层结构）
python build_manifest.py --group-size 100

# 3. 启动 HTTP 服务
python -m http.server 31245
# 访问 http://localhost:31245/
```

## 架构 (v4)

```
manifest.json           ← 书目索引（只含 id/title/config 路径，不含章节数据）
books-config/*.json     ← 每本书独立配置（章节列表 + 分组信息 + 资源路径）
subs/*.json             ← 字幕资源（JSON cues，由 build_manifest.py 从 SRT 生成）
books/*.mp3             ← 音频资源
books/*.srt             ← 原始字幕源（构建时用，前端运行时不碰）
```

### 数据流

```
manifest.json (书目索引)
    │
    ├─ click 书 → fetch books-config/<书>.json (章节配置)
    │                   │
    │                   └─ click 章 → fetch audio + subs/*.json (字幕)
    │
    └─ chapterGroupSize 决定章节分页（100章/页）
```

### manifest.json

```jsonc
{
  "version": 4,
  "baseURL": "./",
  "bookCount": 1,
  "books": [
    { "id": "测试书1", "title": "测试书1", "config": "books-config/测试书1.json" }
  ]
}
```

### books-config/*.json

```jsonc
{
  "id": "测试书1",
  "title": "测试书1",
  "chapterGroupSize": 100,      // 分页大小，0=不分页
  "chapterCount": 2,
  "chapters": [
    {
      "id": "001",
      "title": "第一章 少年的决定",
      "audio": { "src": "books/测试书1/001_第一章 少年的决定.mp3", "duration": 79.4 },
      "subtitle": { "json": "subs/测试书1/001_第一章 少年的决定.json" }
    }
  ]
}
```

### subs/*.json

```json
[{"start": 100, "end": 2675, "text": "小秋狠狠甩了一下手中的柳条鞭"}]
```

## 前端特性

| 特性 | 说明 |
|---|---|
| **字幕三态** | 单行（默认，只显示当前句）/ 展开（歌词式滚动列表）/ 关（隐藏全部） |
| **分层导航** | 主页只显示书目列表，点书加载章节，不一次性全加载 |
| **章节分页** | 根据 chapterGroupSize 自动分页（1-100, 101-200...） |
| **目录与资源分离** | manifest 只含索引，配置独立，字幕独立 |
| **SRT 不参与运行时** | 前端只读 JSON，不 fetch SRT，消除 octet-stream 下载问题 |
| **JSON 缺失有提示** | 找不到字幕 JSON 时显示明确提示 |
| **兼容网络 URL** | audio.src / subtitle.json 都支持 `https://` |
| **进度记忆** | 播放位置存 localStorage，切章后自动恢复 |
| **沉浸模式** | 全屏 + 隐藏 UI + 音频驱动背景动画 |

## 快捷键

| 按键 | 功能 |
|---|---|
| 空格 | 播放/暂停 |
| ←/→ | 后退/前进 5 秒 |
| ↑/↓ | 音量 +/- |
| N/P | 下一章/上一章 |
| C | 字幕模式切换（单行→展开→关） |
| F | 全屏/退出 |
| L | 目录显示/隐藏 |
| B | 切换背景 |
| Esc | 退出全屏 / 返回书目 |

## 命令行

```bash
python build_manifest.py                      # 默认：不分页
python build_manifest.py --group-size 100     # 每100章一页
python build_manifest.py --no-subs            # 不生成字幕 JSON
python build_manifest.py --base-url ./        # 指定 baseURL
python build_manifest.py --check              # 只打印不写文件
```

## 手动编辑

可以直接编辑 manifest.json 和 books-config/*.json 引用网络资源：

```jsonc
// books-config/mybook.json
{
  "id": "mybook",
  "title": "我的书",
  "chapterGroupSize": 100,
  "chapterCount": 1,
  "chapters": [{
    "id": "001",
    "title": "第一章",
    "audio": { "src": "https://cdn.example.com/ch01.mp3", "duration": 79.4 },
    "subtitle": { "json": "https://cdn.example.com/ch01.json" }
  }]
}
```

## 目录结构

```
online/
├── index.html
├── manifest.json              ← 书目索引
├── build_manifest.py          ← 生成器
├── _verify.mjs                ← 自检
├── README.md
├── css/style.css
├── js/
│   ├── app.js
│   └── background.js
├── books-config/              ← 每书独立配置
│   └── 测试书1.json
├── books/                     ← 音频 + 原始字幕
│   └── 测试书1/
│       ├── 001_第一章 少年的决定.mp3
│       └── 001_第一章 少年的决定.srt
└── subs/                      ← 字幕 JSON
    └── 测试书1/
        └── 001_第一章 少年的决定.json
```
