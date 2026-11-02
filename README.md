# visual-agents-workflow

可点击的多 Agent 工作流沙盘 —— **剧本模拟** + **近似实时直播** + **第一期本机 dsh 真实任务**。

> **Clickable multi-agent workflow sandbox** (static HTML + local SSE / Task API). Demo a Planner / Executor / Reviewer loop, stream live events, or run a real prompt via local `dsh`.

## 在线演示

**https://kanjiandahai.github.io/visual-agents-workflow/**

（源码在 `docs/`，Pages 指向该目录。GitHub Pages **没有后端**，线上请用「演示直播」。）

## 本地打开

```bash
git clone https://github.com/kanjiandahai/visual-agents-workflow.git
cd visual-agents-workflow

# 仅静态页（剧本 + 演示直播）
python3 -m http.server 8080 --directory docs
# http://localhost:8080

# 或带 SSE 桥（静态页 + /events + /emit）
node server/sse-server.js
# http://127.0.0.1:8787
```

## 第一期：本机 dsh 真实任务

在本机用 **DeepSeek Harness CLI（`dsh`）** 跑用户真实需求，过程推到沙盘「直播」模式。未安装 `dsh` 时自动用 [`scripts/fake-dsh.sh`](./scripts/fake-dsh.sh) 演示（仍发完整事件序列）。

```bash
node server/sse-server.js
# 浏览器打开 http://127.0.0.1:8787/ → 直播 → 连接 SSE → 填写任务 → 提交任务
```

```bash
curl -s -X POST http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"用三句话总结本仓库 README"}'
```

- 详细步骤与验收：[`docs/REAL_TASKS.md`](./docs/REAL_TASKS.md)「§8 第一期：本机 dsh」
- `GET /runner` 可确认当前是 `dsh` 还是 `fake-dsh`
- 环境变量：`DSH_BIN`、`DSH_PROFILE`（默认 `headless`）

## 沙盘能做什么

| 角色 | 职责 |
|------|------|
| **用户 (User)** | 提出任务目标 |
| **规划者 (Planner)** | 拆解步骤、派发任务 |
| **执行者 (Executor)** | 执行子任务、回报结果 |
| **审核者 (Reviewer)** | 检查质量、决定通过或打回 |

### 剧本模拟

- **播放 / 暂停 / 单步 / 重置** —— 按内置剧本推进
- **节点与连线** —— 高亮当前 handoff；点击查看详情
- **剧本时间轴** —— 规划 → 派发 → 等待 → 审核 → 汇总

### 直播模式

切换顶栏 **「直播」**：

| 能力 | 说明 |
|------|------|
| **演示直播** | 浏览器内定时注入事件，标为「演示直播」，**GitHub Pages 可直接用** |
| **连接 SSE** | EventSource 订阅本地 `http://127.0.0.1:8787/events` |
| **提交真实任务** | 页内表单或 `POST /tasks` → 本机 `dsh` / `fake-dsh`，带 `task_id` |
| **事件流面板** | 时间戳 · Agent · step/tool/status · task · 摘要；可按 task 过滤 |
| **连接状态** | 未连接 / 连接中 / 直播中 / 演示直播 / 已断开 |

## 近似实时直播

### Pages 演示直播 vs 本地 SSE

| 方式 | 需要后端？ | 适用 |
|------|------------|------|
| **演示直播** | 否 | 分享 Pages 链接给客户点开即看 |
| **本地 SSE** | 是（`server/sse-server.js`） | 把真实 Agent / 例程步骤推到沙盘 |

### 事件 schema

每条事件为 JSON（SSE `data:` 或 `POST /emit` body）：

```json
{
  "ts": "2026-11-02T07:00:01.000Z",
  "agent": "planner",
  "type": "dispatch",
  "message": "派发起草子任务",
  "edge": "e-planner-executor",
  "state": "已派发，等待回报",
  "activeNodes": ["planner", "executor"]
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `ts` | 否 | ISO 时间；缺省为接收时刻 |
| `agent` | 建议 | `user` / `planner` / `executor` / `reviewer` / `system` |
| `type` | 建议 | `status` / `dispatch` / `tool` / `message` / `handoff` / `complete` / `error` |
| `message` | 建议 | 短摘要（事件流与节点「最近消息」） |
| `edge` | 否 | 高亮连线：`e-user-planner` 等 |
| `state` | 否 | 覆盖该 agent 节点状态文案 |
| `activeNodes` | 否 | 同时点亮的节点 id 列表 |
| `task_id` / `step` / `tool` / `status` | 真实任务建议 | 第一期已透传并在事件流展示 |

样例 NDJSON：[`docs/sample/demo-events.jsonl`](./docs/sample/demo-events.jsonl)

### 启动本地 SSE

```bash
node server/sse-server.js
# PORT=8787 HOST=127.0.0.1
```

- 沙盘：`http://127.0.0.1:8787/`
- 流：`GET /events`（SSE，事件名 `agent`）
- 推送：`POST /emit`
- **任务**：`POST /tasks`、`GET /tasks`、`GET /tasks/:id`、`GET /runner`
- 健康检查：`GET /health`

页面「直播」→ 确认 SSE 地址 → **连接 SSE**。

### curl 推送示例

```bash
# 规划者派发
curl -s -X POST http://127.0.0.1:8787/emit \
  -H 'Content-Type: application/json' \
  -d '{
    "agent":"planner",
    "type":"dispatch",
    "message":"派发：撰写公告草稿",
    "edge":"e-planner-executor",
    "state":"已派发，等待回报",
    "activeNodes":["planner","executor"]
  }'

# 执行者工具调用
curl -s -X POST http://127.0.0.1:8787/emit \
  -H 'Content-Type: application/json' \
  -d '{
    "agent":"executor",
    "type":"tool",
    "message":"tool: draft_outline ok",
    "state":"撰写草稿…",
    "activeNodes":["executor"]
  }'

# 结束
curl -s -X POST http://127.0.0.1:8787/emit \
  -H 'Content-Type: application/json' \
  -d '{"agent":"system","type":"complete","message":"run complete"}'
```

### 真实 Agent / 例程怎么接

在每一步（派发、工具调用、交还、完成）用 HTTP POST 同一 schema 即可，例如 shell：

```bash
emit() {
  curl -s -X POST http://127.0.0.1:8787/emit \
    -H 'Content-Type: application/json' \
    -d "$1" >/dev/null
}

emit '{"agent":"planner","type":"status","message":"开始规划","state":"拆解步骤中","activeNodes":["planner"]}'
# …真实工作…
emit '{"agent":"planner","type":"dispatch","message":"已派发","edge":"e-planner-executor","activeNodes":["planner","executor"]}'
```

Python 同上：`urllib.request` / `httpx` POST JSON 到 `/emit`。无需密钥（默认只绑 `127.0.0.1`；若暴露到公网请自行加鉴权，本仓库不提供密钥配置）。

## 真实用户任务对接

演示直播 ≠ 真实任务。若要把**用户真实任务**的执行过程推到沙盘，请读：

**[docs/REAL_TASKS.md](./docs/REAL_TASKS.md)** —— 架构、事件 schema、安全、分阶段计划；**§8 第一期：本机 dsh** 含安装/回退与端到端命令。

样例 NDJSON：[`docs/sample/real-task-readme-summarize.jsonl`](./docs/sample/real-task-readme-summarize.jsonl)

## 开启 GitHub Pages

1. 仓库 **Settings → Pages**
2. Source：**Deploy from a branch**
3. Branch：`main`，文件夹：`/docs`

## 目录结构

```
docs/
  index.html              # 页面骨架（剧本 / 直播 / 提交任务）
  styles.css
  app.js                  # 状态机、剧本、演示直播、SSE、Task 表单
  REAL_TASKS.md           # 真实任务对接（含第一期 dsh）
  sample/
server/
  sse-server.js           # SSE + /emit + /tasks + 静态 docs
  task-runner.js          # dsh / fake-dsh 执行与事件编排
  package.json
  README.md
scripts/
  fake-dsh.sh             # 无 dsh 时的演示 CLI
LICENSE                   # MIT
README.md
.gitignore
```

## License

[MIT](./LICENSE) © 2026 kanjiandahai
