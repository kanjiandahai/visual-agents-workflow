# visual-agents-workflow

[![GitHub stars](https://img.shields.io/github/stars/kanjiandahai/visual-agents-workflow?style=social)](https://github.com/kanjiandahai/visual-agents-workflow/stargazers)
[![License: MIT](https://img.shields.io/github/license/kanjiandahai/visual-agents-workflow)](LICENSE)
[![Live demo](https://img.shields.io/badge/GitHub%20Pages-live%20demo-blue)](https://kanjiandahai.github.io/visual-agents-workflow/)
[![Pages Check](https://github.com/kanjiandahai/visual-agents-workflow/actions/workflows/pages-check.yml/badge.svg)](https://github.com/kanjiandahai/visual-agents-workflow/actions/workflows/pages-check.yml)

可点击的**单 Agent** 工作流沙盘：把一次真实运行画成 **用户 ↔ 助手 ↔ 工具**，支持剧本回放与近似实时直播（含本机 `dsh`）。

> **Clickable single-agent sandbox** — visualizes **User ↔ Agent ↔ Tools** as in `dsh --profile headless`. Scripted playback, demo live stream, or local SSE + real tasks.

## 在线演示 / Live demo

**https://kanjiandahai.github.io/visual-agents-workflow/**

源码在 `docs/`，GitHub Pages 指向该目录。线上**没有后端**，请用「演示直播」；本机 `dsh` / SSE 需本地启动服务。

另有一页基于 dsh **父 → 子委派** 的多 Agent 演示（不改变本页默认单 Agent 沙盘）：

**https://kanjiandahai.github.io/visual-agents-workflow/multi-agent.html**

说明见 [docs/MULTI_AGENT.md](./docs/MULTI_AGENT.md)。

## 你会看到什么

画布对齐 **dsh headless 单 Agent**（不是多角色编排）：

| 节点 | 说明 |
|------|------|
| **用户 (User)** | 提出任务，接收最终回复 |
| **助手 (Agent)** | 唯一 Agent：理解、推理、决定是否调工具、整理交付 |
| **工具 (Tools)** | bash / Read / glob 等；亮起表示调用中或结果回传 |

连线：`提出任务` → `调用工具` → `工具结果` → `回复交付`。

## 两种模式

### 剧本模拟

播放 / 暂停 / 单步 / 重置，按内置单 Agent 剧本推进：提出任务 → 理解 → 调工具 → 工具结果 → 起草 → 交付。点击节点与连线可看详情。

### 直播

| 能力 | 说明 |
|------|------|
| **演示直播** | 浏览器内定时注入事件；**GitHub Pages 可直接用** |
| **连接 SSE** | 订阅本地 `http://127.0.0.1:8787/events` |
| **提交任务** | 页内表单或 `POST /tasks` → 本机 `dsh` / `fake-dsh` |
| **事件流** | 时间戳 · 节点 · tool/status · task · 摘要 |

## 快速开始

```bash
git clone https://github.com/kanjiandahai/visual-agents-workflow.git
cd visual-agents-workflow

# 仅静态页（剧本 + 演示直播）
python3 -m http.server 8080 --directory docs
# → http://localhost:8080

# 或带 SSE / Task API
node server/sse-server.js
# → http://127.0.0.1:8787
```

打开页面后：顶栏切到 **剧本模拟** 或 **直播**。直播下可先点「开始演示直播」，或「连接 SSE」后再提交任务。

## 本机 dsh（可选）

本机用 DeepSeek Harness CLI（`dsh`）跑真实 prompt，步骤推到沙盘「直播」。未安装 `dsh` 时自动用 [`scripts/fake-dsh.sh`](./scripts/fake-dsh.sh)。

```bash
node server/sse-server.js
# 浏览器：http://127.0.0.1:8787/ → 直播 → 连接 SSE → 填写任务 → 提交
```

```bash
curl -s -X POST http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"用三句话总结本仓库 README"}'
```

`GET /runner` 可确认当前是 `dsh` 还是 `fake-dsh`。事件 schema、安全与验收见 **[docs/REAL_TASKS.md](./docs/REAL_TASKS.md)**。

事件示例（`POST /emit` 或 SSE `data:`）：

```json
{
  "agent": "tools",
  "type": "tool",
  "tool": "Read",
  "status": "running",
  "message": "tool: Read · README.md",
  "edge": "e-agent-tools",
  "activeNodes": ["agent", "tools"]
}
```

`agent` 取 `user` / `agent` / `tools`（`system` 仅日志）。完整字段与样例 NDJSON 见 `REAL_TASKS.md` 与 [`docs/sample/`](./docs/sample/)。

## 目录结构

```
docs/                 # 沙盘前端（Pages 根目录）
  index.html · app.js · styles.css   # 默认单 Agent 沙盘
  multi-agent.html · multi-agent.js  # 额外的多 Agent 演示
  REAL_TASKS.md · MULTI_AGENT.md
  sample/             # 样例事件（含 multi-agent-*.jsonl）
server/
  sse-server.js       # SSE + /emit + /tasks + 静态 docs
  task-runner.js      # dsh / fake-dsh → 事件（默认单 Agent；mode=multi 映射子 Agent）
scripts/
  fake-dsh.sh         # 无 dsh 时的演示 CLI
```

开启 Pages：仓库 Settings → Pages → Deploy from a branch → `main` / `/docs`。

## License

[MIT](./LICENSE) © 2026 kanjiandahai
