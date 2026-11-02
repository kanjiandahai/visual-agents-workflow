# server/ — 本地 SSE 桥 + 第一期 Task API（本机 dsh）

零依赖 Node 服务：

- 沙盘静态页（`../docs`）
- `GET /events` / `POST /emit` — 事件总线
- **`POST /tasks`** — 受理真实用户任务，经本机 **`dsh`**（DeepSeek Harness）或回退 **`scripts/fake-dsh.sh`** 执行，并把步骤推到 SSE

```bash
node server/sse-server.js
# 默认 http://127.0.0.1:8787
```

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 + runner 信息 |
| `GET /runner` | 当前将用的 dsh / fake-dsh |
| `POST /tasks` | body: `{ "prompt": "…" }` → `{ task_id, runner_kind }` |
| `GET /tasks` / `GET /tasks/:id` | 任务列表 / 详情 |

环境变量：`PORT`、`HOST`、`DSH_BIN`（覆盖二进制路径）、`DSH_PROFILE`（默认 `headless`）。

完整步骤见 [`docs/REAL_TASKS.md`](../docs/REAL_TASKS.md)「第一期：本机 dsh」。
