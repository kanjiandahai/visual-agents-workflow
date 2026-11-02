# 真实用户任务对接方案

> 目标：用户提交并跑起**真实任务** → Agent / 多 Agent 实际执行 → 沙盘「直播」模式近似实时展示过程。  
> **第一期（本机 dsh）已落地**：本地 Task API `POST /tasks` + `dsh` / `fake-dsh` runner + 事件透传；托管多租户仍属后续阶段。

中文为主；English terms kept where they match code (`/emit`, SSE, `task_id`).

---

## 1. 目标

| 角色 | 期望体验 |
|------|----------|
| **最终用户** | 输入真实需求（例如「总结这个 README」），看到 Planner → Executor → Reviewer 的**真实步骤**滚动出现，而不是固定剧本 |
| **集成方** | 在已有 Agent / Grok Bot / 例程 / 自建 runner 里，每完成一步就 `POST` 一条事件；沙盘只负责可视化 |
| **本仓库** | 提供沙盘 UI、事件 schema、本地 SSE 桥、样例与文档；**不**替代真实执行环境 |

成功标准（MVP）：

1. 用户在本机打开沙盘并连接 SSE。
2. 外部对**同一次** `task_id` 连续推送事件。
3. 节点高亮、连线、事件流面板与真实执行顺序一致；任务结束出现 `complete` / `error`。

---

## 2. 架构

```
┌─────────────┐     create/run      ┌──────────────────────┐
│ 用户 / UI   │ ──────────────────► │ Task API / Runner    │
│ (或聊天)    │                     │ (执行器 / Bot / CI)  │
└─────────────┘                     └──────────┬───────────┘
                                               │ 每步 emit
                                               ▼
                                    ┌──────────────────────┐
                                    │ Event bus            │
                                    │ 现有：POST /emit     │
                                    │       GET  /events   │
                                    │ (server/sse-server)  │
                                    └──────────┬───────────┘
                                               │ SSE (event: agent)
                                               ▼
                                    ┌──────────────────────┐
                                    │ 沙盘前端 Live 模式   │
                                    │ docs/app.js          │
                                    └──────────────────────┘
```

数据流一句话：**执行器拥有真相；沙盘只订阅事件流。**

| 组件 | 现状 | 真实任务时的角色 |
|------|------|------------------|
| `docs/` 沙盘 | 剧本 + 演示直播 + SSE 客户端 | 展示 Live 事件；可选将来加「提交任务」表单（调 Task API） |
| `server/sse-server.js` | 本地 `/events` + `/emit`，默认绑 `127.0.0.1` | 开发期事件总线；公网需鉴权 / CORS 收紧 |
| Task API / Runner | **第一期已在本仓**：`POST /tasks` → 本机 `dsh` | 接用户输入、调度 Agent、调工具、按 schema emit |
| GitHub Pages | 仅静态 | **不能**跑真实任务后端；线上真直播需自建/托管 SSE |

---

## 3. 真实运行事件 Schema

兼容现有字段（`ts` / `agent` / `type` / `message` / `edge` / `state` / `activeNodes`），并为真实任务增加追踪字段。

### 3.1 推荐 JSON

```json
{
  "ts": "2026-11-02T07:00:01.000Z",
  "task_id": "task_20261102_readme_1",
  "step": 3,
  "agent": "executor",
  "type": "tool",
  "tool": "Read",
  "status": "ok",
  "message": "已读取 README.md（前 200 行）",
  "edge": null,
  "state": "整理摘要…",
  "activeNodes": ["executor"],
  "detail": {
    "path": "README.md",
    "chars": 4200
  }
}
```

### 3.2 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `task_id` | **真实任务必填** | 一次用户任务的稳定 id；前端可按此过滤/分组 |
| `step` | 建议 | 单调递增序号（1, 2, 3…），便于排序与断线补齐 |
| `ts` | 否 | ISO-8601；缺省由接收端补 |
| `agent` | 建议 | `user` / `planner` / `executor` / `reviewer` / `system` |
| `type` | 建议 | 见下表 |
| `tool` | 工具步骤建议 | 工具名（`Read` / `WebSearch` / …）；**不要**带参数里的密钥 |
| `status` | 建议 | `pending` / `running` / `ok` / `error` / `skipped` |
| `message` | 建议 | 给人看的短摘要（事件流主文案） |
| `edge` | 否 | `e-user-planner` / `e-planner-executor` / `e-executor-reviewer` / `e-reviewer-user` 等 |
| `state` | 否 | 覆盖该 agent 节点状态文案 |
| `activeNodes` | 否 | 同时点亮的节点 id |
| `detail` | 否 | 结构化附件；**禁止**密钥、完整 token、未脱敏 PII |

### 3.3 `type` 约定（真实任务）

| `type` | 典型含义 |
|--------|----------|
| `task_start` | 用户任务已受理（常配 `agent: system` 或 `user`） |
| `status` | 心跳 / 阶段说明 |
| `dispatch` | 规划者派发子任务 |
| `tool` | 工具调用开始或结束（用 `status` 区分） |
| `message` | Agent 之间或对用户的自然语言 |
| `handoff` | 交接（常配 `edge`） |
| `complete` | 任务成功结束 |
| `error` | 失败或取消 |

### 3.4 与当前 SSE 实现的兼容

今日 `normalizeEvent` 主要保留 `ts/agent/type/message/edge/state/activeNodes`。对接时：

- **Phase 0（立即可用）**：把 `task_id` / `step` / `tool` / `status` 写入 `message` 前缀，例如 `[task_xxx #3 tool:Read ok] 已读取 README`，前端无需改即可看见。
- **Phase 1（建议改 server + 前端）**：`normalizeEvent` **透传**未知字段；事件流展示 `task_id` / `tool` / `status`；可选按 `task_id` 过滤。

样例序列见 [`sample/real-task-readme-summarize.jsonl`](./sample/real-task-readme-summarize.jsonl)。

---

## 4. 安全

真实任务几乎总会碰到仓库内容、网页或用户数据，事件总线必须当**半可信日志通道**，不是调试 dump。

| 风险 | 要求 |
|------|------|
| 密钥泄漏 | 事件中**禁止** API Key、token、cookie、密码、私钥；工具参数只留名称与非敏感摘要 |
| 未授权 emit | 本机 `127.0.0.1` 可无鉴权；**任何非本机或公网** `/emit` 必须鉴权（如 `Authorization: Bearer <EMIT_TOKEN>` 或 mTLS） |
| CORS | 开发期可 `*`；托管后应允许**明确的**沙盘 Origin 列表，且鉴权头需在 `Access-Control-Allow-Headers` 中声明 |
| 任务内容 | `message` / `detail` 默认只给操作者看；对外演示页应对用户输入做脱敏或仅展示元数据 |
| 多租户 | 按 `task_id` + 用户会话隔离；禁止订阅者看到他人任务事件 |
| 重放 | 历史缓冲区（如最近 200 条）可能含敏感摘要；公网部署应缩短 TTL 或按鉴权过滤 |

本仓现状：SSE 默认只听本机、CORS 较宽、**无** emit 鉴权 —— 仅适合本地对接；上线前必须在执行器侧或网关侧补齐。

---

## 5. 分阶段计划

### Phase A — 本地 curl（1 天内）

1. `node server/sse-server.js`
2. 浏览器打开沙盘 →「直播」→ 连接 `http://127.0.0.1:8787/events`
3. 按 §7 用 curl / 脚本依次 `POST /emit`
4. 验收：事件流顺序正确，节点随 `activeNodes` / `edge` 变化

### Phase B — Grok Bot / 例程 emit（数天）

1. 在真实执行路径（每步工具前后、派发、交还）调用同一 `/emit`（或经小代理转发到本机）。
2. 固定生成 `task_id`（例程 run id / 会话 id）。
3. 失败路径必发 `type: error` + `status: error`。
4. 验收：用户在聊天里下发真实任务，沙盘同步跳动（本机桥或隧道）。

> 隧道（如 Cloudflare Tunnel / ngrok）仅作联调；必须带 emit 鉴权，用完即关。

### Phase C — 托管 Runner + 托管 SSE（产品化）

1. Task API：`POST /tasks` 创建，`GET /tasks/:id` 查状态；异步执行。
2. 托管事件总线（SSE 或 WebSocket），按用户鉴权订阅。
3. 沙盘可改为连托管 URL；可选「在页内提交任务」表单。
4. 观测：按 `task_id` 的延迟、丢事件率、错误率。
5. GitHub Pages 仍只承载静态 UI；API 与 SSE 在独立域名。

不在早期做的：完整多租户计费、事件永久存储、在 Pages 上伪造成真实后端。

---

## 6. 本仓库 vs 执行器 / 宿主

| 能力 | visual-agents-workflow（本仓） | 执行器 / Host（Bot、例程、自建 runner） |
|------|--------------------------------|------------------------------------------|
| 沙盘 UI、剧本、演示直播 | ✅ | — |
| 本地 SSE `/events` `/emit` | ✅（开发桥） | 可替换为自建总线 |
| 事件 schema 与样例 | ✅ 文档 + jsonl | 必须遵守并 emit |
| 接收用户真实任务并执行 | ❌ | ✅ |
| 调用工具 / LLM / 多 Agent | ❌ | ✅ |
| 密钥与凭证 | ❌ 不进事件、不进本仓 | ✅ vault / 环境变量 |
| 公网鉴权、多租户、审计 | 文档要求；实现属宿主 | ✅ |
| GitHub Pages 托管静态演示 | ✅ | — |

边界口诀：**本仓可视化；宿主负责跑任务并推事件。**

---

## 7. 最小样例：真实任务「总结这个 README」

### 7.1 用户输入

> 总结这个 README，用三条中文要点，并提到沙盘能力与 SSE。

### 7.2 期望事件序列（摘要）

完整 NDJSON：[`sample/real-task-readme-summarize.jsonl`](./sample/real-task-readme-summarize.jsonl)

| step | agent | type | 要点 |
|------|-------|------|------|
| 1 | user | `task_start` | 用户提交任务；`edge: e-user-planner` |
| 2 | planner | `status` | 拆解：读 README → 提炼 → 交审核 |
| 3 | planner | `dispatch` | 派发执行者；`edge: e-planner-executor` |
| 4 | executor | `tool` / `status: running` | `tool: Read` 开始读 `README.md` |
| 5 | executor | `tool` / `status: ok` | 读取完成（消息里可含字数，勿贴全文密钥） |
| 6 | executor | `message` | 产出三条要点草稿 |
| 7 | executor | `handoff` | 交审核；`edge: e-executor-reviewer` |
| 8 | reviewer | `status` | 检查是否覆盖沙盘 + SSE |
| 9 | reviewer | `message` | 通过或打回（样例为通过） |
| 10 | reviewer | `handoff` | 回用户；`edge: e-reviewer-user` |
| 11 | system | `complete` | `task_id` 结束 |

### 7.3 本地快速演练

```bash
# 终端 1
node server/sse-server.js

# 终端 2 — 浏览器已连接 SSE 后
while IFS= read -r line; do
  [ -z "$line" ] && continue
  curl -s -X POST http://127.0.0.1:8787/emit \
    -H 'Content-Type: application/json' \
    -d "$line" >/dev/null
  sleep 0.8
done < docs/sample/real-task-readme-summarize.jsonl
```

（若当前 server 未透传 `task_id` 等字段，事件仍会显示 `message`；透传改造见 §3.4 Phase 1。）

---

## 8. 第一期：本机 dsh（已实现）

把 **DeepSeek Harness CLI `dsh`** 当作本机真实任务执行器；没有安装时自动回退到仓库内的 [`scripts/fake-dsh.sh`](../scripts/fake-dsh.sh)（演示用，不调模型）。

### 8.1 端到端步骤

```bash
git clone https://github.com/kanjiandahai/visual-agents-workflow.git
cd visual-agents-workflow

# 终端 1 — SSE + Task API + 静态沙盘
node server/sse-server.js
# 启动日志会打印 runner: dsh 或 fake-dsh

# 浏览器
# 打开 http://127.0.0.1:8787/
# 顶栏「直播」→「连接 SSE」→ 在「真实任务（本机 dsh）」框输入需求 →「提交任务」
```

或纯 curl（浏览器已连接 SSE 时更直观）：

```bash
# 看将用哪个 runner
curl -s http://127.0.0.1:8787/runner | python3 -m json.tool

# 提交真实任务
curl -s -X POST http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"用三句话总结本仓库 README，并提到沙盘与 SSE"}' | python3 -m json.tool

# 查询
curl -s http://127.0.0.1:8787/tasks | python3 -m json.tool
```

验收：

1. 返回 `task_id` 与 `runner_kind`（`dsh` 或 `fake-dsh`）。
2. 直播事件流出现带同一 `task_id` 的 `task_start` → planner → executor（stdout 行）→ reviewer → `complete`/`error`。
3. 节点与连线随 `activeNodes` / `edge` 变化；可勾选「只看当前 task」。

### 8.2 dsh 安装与回退

| 情况 | 行为 |
|------|------|
| `command -v dsh` 成功，或设置了 `DSH_BIN` | 执行：`dsh --profile "${DSH_PROFILE:-headless}" "<prompt>"` |
| 否则 | 执行：`scripts/fake-dsh.sh --profile headless "<prompt>"`，事件里 `runner_kind: fake-dsh` |

安装真实 dsh（DeepSeek Harness）请按其官方文档（npm / 发行包）。装好后**重启** `node server/sse-server.js`，`GET /runner` 应显示 `dsh_on_path: true`。

可选环境变量：

| 变量 | 含义 |
|------|------|
| `DSH_BIN` | 强制指定 dsh 可执行文件路径 |
| `DSH_PROFILE` | 默认 `headless`（一次性跑完退出） |
| `PORT` / `HOST` | 服务监听（默认 `127.0.0.1:8787`） |

### 8.3 本仓已实现 vs 仍待做

| 项 | 状态 |
|----|------|
| `normalizeEvent` 透传 `task_id` / `step` / `tool` / `status` / `detail` | ✅ |
| 前端事件行展示 + 当前 `task_id` 过滤 | ✅ |
| `POST /tasks` + dsh / fake-dsh runner | ✅ |
| 沙盘页内提交任务表单 | ✅ |
| Emit 鉴权 / 公网 CORS 白名单 | ❌ 仍仅适合本机 |
| Grok Bot / 例程一步一 emit | ❌ 见 Phase B |
| 托管 Runner + 多租户 | ❌ 见 Phase C |

---

## 相关链接

- 沙盘与 SSE 用法：[仓库 README](../README.md)
- 演示事件：[`sample/demo-events.jsonl`](./sample/demo-events.jsonl)
- 本机桥 + Task API：[`server/sse-server.js`](../server/sse-server.js)、[`server/task-runner.js`](../server/task-runner.js)
- 无 dsh 时的演示 CLI：[`scripts/fake-dsh.sh`](../scripts/fake-dsh.sh)
