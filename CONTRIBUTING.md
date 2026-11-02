# 贡献指南 · Contributing

感谢关注 [visual-agents-workflow](https://github.com/kanjiandahai/visual-agents-workflow)。本仓是**可点击的多 Agent 工作流沙盘**（静态页 + 可选本机 SSE / Task API）。欢迎修文档、改 UI、加强事件桥或补样例。

English: fork → branch → keep `docs/` demo working → open a PR. Prefer Chinese or bilingual notes where the repo is already zh-CN first. **Never commit secrets or API keys.**

## 本地运行

```bash
git clone https://github.com/kanjiandahai/visual-agents-workflow.git
cd visual-agents-workflow

# 仅静态（剧本 + 演示直播）— 也是 GitHub Pages 内容
python3 -m http.server 8080 --directory docs
# http://localhost:8080

# 带 SSE 桥 + Task API（本机 dsh / fake-dsh）
node server/sse-server.js
# http://127.0.0.1:8787
```

真实任务说明见 [`docs/REAL_TASKS.md`](./docs/REAL_TASKS.md)。可选环境变量：`PORT`、`HOST`、`DSH_BIN`、`DSH_PROFILE`。不要把 `.env` 或 Key 提交进仓。

## 开 PR

1. Fork 并创建分支（例如 `docs/seo`、`fix/live-panel`）。
2. 改动后自测：静态页能开；若动到 `server/`，确认 `/health`、`/events`、必要时 `POST /tasks`。
3. 保持 `docs/index.html`、`docs/app.js`、`docs/styles.css` 相对路径可用（Pages 无构建步骤）。
4. 更新机器可读入口时同步根目录 [`llms.txt`](./llms.txt) 与 [`docs/llms.txt`](./docs/llms.txt)。
5. 开 PR，说明动机与验证方式。CI（`pages-check`）会核对关键文件与基础 meta。

## 请勿提交

- API Key、`.env`、登录 Cookie、私有日志
- `node_modules/`、`.search-tmp/` 等本地垃圾（见 `.gitignore`）
- 大体积无关二进制

## License

贡献默认按 [MIT](./LICENSE) 授权。
