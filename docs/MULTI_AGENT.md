# 多 Agent 演示（dsh subagent）

> 本页是**额外**演示，不替换默认的[单 Agent 沙盘](./index.html)。  
> 拓扑对齐 DeepSeek Harness 的父 → 子委派：`subagent` / `subagent_fork`（可选 `list_agents` / `send_message`），**不是**规划者 / 执行者 / 审核者。

在线演示：https://kanjiandahai.github.io/visual-agents-workflow/multi-agent.html

## 你会看到什么

```
用户 → 根 Agent →（动态）子 Agent → 工具 → 回根 Agent → 用户
```

| 节点 | 说明 |
|------|------|
| **用户** | 提出任务，接收根 Agent 的汇总回复 |
| **根 Agent** | dsh 父 Agent：拆任务、调用 `subagent` / `subagent_fork`、汇总交付 |
| **子 Agent** | 被委派的子会话；剧本里预置 A / B，直播里按工具结果动态出现 |
| **工具** | 子 Agent（剧本）或根自己（如 `list_agents`）调用的工具 |

官方 headless 配置里，`subagent` 走 spawn 后端，`subagent_fork` 走 fork 后端。工具结果先返回 `started subagent <childId>`，不等待子任务完成；子 Agent 结束后，运行时向父会话注入完成通知。

## 两种模式

| 模式 | 后端 | 说明 |
|------|------|------|
| 剧本模拟 | 不需要 | 根 Agent 并行委派调研 A（可视化）/ 调研 B（dsh·SSE），子 Agent 调工具后回报，根再汇总 |
| 演示直播 | 不需要（GitHub Pages 可用） | 浏览器定时注入 [`sample/multi-agent-demo.jsonl`](./sample/multi-agent-demo.jsonl) 同款事件 |
| SSE + 真实任务 | `node server/sse-server.js` | `POST /tasks` 带 `{ "mode": "multi" }`，或 `POST /tasks/multi` |

默认首页的 `POST /tasks`（不带 `mode`）仍是**单 Agent**映射，行为不变。

## Live 映射说明

`dsh --profile headless --json` 是**根会话投影**，不是子会话的完整录像。

| 根流里的事件 | 沙盘怎么画 |
|--------------|------------|
| `tool_call` · `subagent` / `subagent_fork` | 新建/点亮子 Agent 节点，边：根 → 子（委派） |
| `tool_result` · `started subagent <id>` | 把该节点绑到 child id，状态改为运行中 |
| `tool_call` / `tool_result` · `send_message` | 根 ↔ 对应子 Agent |
| `list_agents` / `interrupt_agent` 及其他工具 | 仍走根 Agent ↔ 工具 |
| 含 `Background subagent <id> finished` 的文本 | 子 → 根（回报）。真实 `--json` **通常看不到**注入父会话的用户向完成通知，只能看到随后根 Agent 的 `text` / `final`；演示用 fake-dsh 会用 `text` 模拟这条短语以便点亮回报边 |

子 Agent **内部**的 Read / bash 等，父流里基本不可见。剧本和演示直播会把这一段画出来，便于理解完整拓扑；接真实 dsh 时请以根投影为准。

样例：

- 沙盘事件：[`sample/multi-agent-demo.jsonl`](./sample/multi-agent-demo.jsonl)
- 根会话 `--json` 风格：[`sample/multi-agent-dsh-json.jsonl`](./sample/multi-agent-dsh-json.jsonl)

## 本机联调

```bash
node server/sse-server.js
# 浏览器打开 http://127.0.0.1:8787/multi-agent.html
# 直播 → 连接 SSE → 提交任务
```

```bash
curl -s -X POST http://127.0.0.1:8787/tasks \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"分别调研沙盘可视化与本机 dsh/SSE，用子 Agent 并行后再汇总","mode":"multi"}'
```

未安装 `dsh` 时，`VISUAL_AGENTS_MODE=multi` 会让 `scripts/fake-dsh.sh` 输出上述风格的 NDJSON（默认不带该环境变量时，fake-dsh 仍是原来的单 Agent 文本输出）。

更多单 Agent 对接说明见 [REAL_TASKS.md](./REAL_TASKS.md)。
