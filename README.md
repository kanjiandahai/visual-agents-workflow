# visual-agents-workflow

可点击的多 Agent 工作流沙盘模拟页 —— 用来给用户演示「规划 → 派发 → 等待 → 审核 → 汇总」如何在画布上跑起来。

> **Clickable multi-agent workflow sandbox** (static HTML). Demo a Planner / Executor / Reviewer loop with Play · Pause · Step · Reset.

## 在线演示

若已开启 GitHub Pages：

**https://kanjiandahai.github.io/visual-agents-workflow/**

（源码在 `docs/`，Pages 指向该目录。）

## 本地打开

无需构建，直接打开静态页即可：

```bash
# 克隆
git clone https://github.com/kanjiandahai/visual-agents-workflow.git
cd visual-agents-workflow

# 任选其一
open docs/index.html          # macOS
xdg-open docs/index.html      # Linux
# 或起一个本地静态服务
python3 -m http.server 8080 --directory docs
# 浏览器访问 http://localhost:8080
```

## 沙盘演示什么

| 角色 | 职责 |
|------|------|
| **用户 (User)** | 提出任务目标 |
| **规划者 (Planner)** | 拆解步骤、派发任务 |
| **执行者 (Executor)** | 执行子任务、回报结果 |
| **审核者 (Reviewer)** | 检查质量、决定通过或打回 |

页面能力：

- **播放 / 暂停 / 单步 / 重置** —— 按剧本推进状态机
- **节点与连线** —— 高亮当前 handoff；点击查看角色、状态、最近消息
- **右侧详情面板** —— 角色说明与当前上下文
- **剧本时间轴** —— 规划 → 派发 → 等待 → 审核 → 汇总

适合销售演示、培训讲解、产品原型，不连接真实 Agent 后端（假数据剧本）。

## 开启 GitHub Pages

1. 仓库 **Settings → Pages**
2. Source 选 **Deploy from a branch**
3. Branch 选 `main`，文件夹选 `/docs`
4. Save 后等待一两分钟，访问 `https://kanjiandahai.github.io/visual-agents-workflow/`

也可用 API（需仓库写权限）：

```bash
gh api -X PUT repos/kanjiandahai/visual-agents-workflow/pages \
  -f build_type=legacy \
  -f source[branch]=main \
  -f source[path]=/docs
```

## 目录结构

```
docs/
  index.html   # 页面骨架
  styles.css   # 样式
  app.js       # 状态机、剧本、交互
LICENSE        # MIT
README.md
.gitignore
```

## License

[MIT](./LICENSE) © 2026 kanjiandahai
