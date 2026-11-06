(() => {
  "use strict";

  const BASE_NODES = [
    {
      id: "user",
      title: "用户",
      en: "User",
      desc: "提出目标与约束，接收根 Agent 汇总后的最终回复。",
    },
    {
      id: "agent",
      title: "根 Agent",
      en: "Root",
      desc: "dsh 父 Agent：理解任务、用 subagent / subagent_fork 委派子 Agent，接收回报后汇总交付。",
    },
    {
      id: "tools",
      title: "工具",
      en: "Tools",
      desc: "bash / Read / list_agents 等。子 Agent 调工具时亮起；根会话投影里通常只能看到根自己的工具调用。",
    },
  ];

  const BASE_EDGES = [
    { id: "e-user-agent", from: "user", to: "agent", label: "提出任务" },
    { id: "e-agent-user", from: "agent", to: "user", label: "回复交付" },
    { id: "e-agent-tools", from: "agent", to: "tools", label: "根调用工具" },
    { id: "e-tools-agent", from: "tools", to: "agent", label: "结果回根" },
  ];

  const SCRIPT_CHILDREN = [
    {
      id: "child-a",
      title: "子 Agent A",
      en: "Spawn",
      desc: "通过 subagent 启动的子 Agent：调研「沙盘可视化」，调用工具后向根 Agent 回报。",
    },
    {
      id: "child-b",
      title: "子 Agent B",
      en: "Fork",
      desc: "通过 subagent_fork 启动的子 Agent：调研「本机 dsh / SSE」，调用工具后向根 Agent 回报。",
    },
  ];

  /** @type {{id:string,title:string,en:string,desc:string,role?:string}[]} */
  let NODES = [];
  /** @type {{id:string,from:string,to:string,label:string}[]} */
  let EDGES = [];
  /** @type {Record<string,string>} */
  let AGENT_TITLE = { system: "系统" };

  function defaultStates() {
    return {
      user: "空闲",
      agent: "空闲",
      tools: "空闲",
      "child-a": "待命",
      "child-b": "待命",
    };
  }

  /** Scripted scenario: root delegates two subagents in parallel, then summarizes. */
  const SCRIPT = [
    {
      id: "brief",
      phase: "提出任务",
      activeNodes: ["user"],
      activeEdge: "e-user-agent",
      states: {
        ...defaultStates(),
        user: "正在说明需求",
        agent: "待命",
      },
      focus: "user",
      message:
        "用户 → 根 Agent\n请分别调研本仓库的「沙盘可视化」和「本机 dsh / SSE」，用子 Agent 并行完成后再汇总成中文要点。",
      toast: "用户提出任务",
    },
    {
      id: "plan",
      phase: "拆分与委派规划",
      activeNodes: ["agent"],
      activeEdge: null,
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "准备并行委派",
      },
      focus: "agent",
      message:
        "根 Agent（内部）\n两项调研相互独立：同一轮用 subagent 启动子 A、用 subagent_fork 启动子 B，等回报后再汇总。",
      toast: "根 Agent 决定并行委派",
    },
    {
      id: "spawn-a",
      phase: "委派子 Agent A",
      activeNodes: ["agent", "child-a"],
      activeEdge: "e-agent-child-a",
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "调用 subagent",
        "child-a": "启动中…",
      },
      focus: "child-a",
      message:
        "根 Agent → 子 Agent A\ntool: subagent · task=调研沙盘可视化（节点、连线、剧本/直播）\n结果：started subagent child-a",
      toast: "subagent 启动子 A",
    },
    {
      id: "spawn-b",
      phase: "委派子 Agent B",
      activeNodes: ["agent", "child-b"],
      activeEdge: "e-agent-child-b",
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "调用 subagent_fork",
        "child-a": "运行中",
        "child-b": "启动中…",
      },
      focus: "child-b",
      message:
        "根 Agent → 子 Agent B\ntool: subagent_fork · task=调研本机 dsh headless 与 SSE /tasks\n结果：started subagent child-b",
      toast: "subagent_fork 启动子 B",
    },
    {
      id: "work-a-call",
      phase: "子 A 调用工具",
      activeNodes: ["child-a", "tools"],
      activeEdge: "e-child-a-tools",
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "等待子 Agent",
        tools: "Read 运行中…",
        "child-a": "调用 Read",
        "child-b": "运行中",
      },
      focus: "tools",
      message: "子 Agent A → 工具\ntool: Read · README / 沙盘说明 · status=running",
      toast: "子 A 调用 Read",
    },
    {
      id: "work-a-result",
      phase: "工具结果回子 A",
      activeNodes: ["tools", "child-a"],
      activeEdge: "e-tools-child-a",
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "等待子 Agent",
        tools: "Read 完成",
        "child-a": "消化工具输出",
        "child-b": "运行中",
      },
      focus: "child-a",
      message: "工具 → 子 Agent A\ntool: Read ok · 画布为用户 ↔ 助手 ↔ 工具，支持剧本与直播",
      toast: "工具结果回到子 A",
    },
    {
      id: "report-a",
      phase: "子 A 回报根 Agent",
      activeNodes: ["child-a", "agent"],
      activeEdge: "e-child-a-agent",
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "接收子 A 回报",
        "child-a": "已回报",
        "child-b": "运行中",
      },
      focus: "agent",
      message:
        "子 Agent A → 根 Agent\n可视化：用户提出任务 → 单一助手推理并调工具 → 工具回传 → 助手交付。支持剧本回放与演示直播。",
      toast: "子 A 已回报",
    },
    {
      id: "work-b-call",
      phase: "子 B 调用工具",
      activeNodes: ["child-b", "tools"],
      activeEdge: "e-child-b-tools",
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "等待子 B",
        tools: "Read 运行中…",
        "child-a": "已回报",
        "child-b": "调用 Read",
      },
      focus: "tools",
      message: "子 Agent B → 工具\ntool: Read · 本机 dsh / SSE 说明 · status=running",
      toast: "子 B 调用 Read",
    },
    {
      id: "work-b-result",
      phase: "工具结果回子 B",
      activeNodes: ["tools", "child-b"],
      activeEdge: "e-tools-child-b",
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "等待子 B",
        tools: "Read 完成",
        "child-a": "已回报",
        "child-b": "消化工具输出",
      },
      focus: "child-b",
      message:
        "工具 → 子 Agent B\ntool: Read ok · dsh --profile headless --json；本地 POST /tasks + GET /events",
      toast: "工具结果回到子 B",
    },
    {
      id: "report-b",
      phase: "子 B 回报根 Agent",
      activeNodes: ["child-b", "agent"],
      activeEdge: "e-child-b-agent",
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "接收子 B 回报",
        "child-a": "已回报",
        "child-b": "已回报",
      },
      focus: "agent",
      message:
        "子 Agent B → 根 Agent\n本机可用 dsh headless（--json 为根会话投影）经 SSE 推到沙盘；未安装 dsh 时回退 fake-dsh。",
      toast: "子 B 已回报",
    },
    {
      id: "summarize",
      phase: "根 Agent 汇总",
      activeNodes: ["agent"],
      activeEdge: null,
      states: {
        ...defaultStates(),
        user: "等待中",
        agent: "汇总两点…",
        "child-a": "已回报",
        "child-b": "已回报",
      },
      focus: "agent",
      message:
        "根 Agent（汇总）\n① 沙盘默认画的是单 Agent 拓扑\n② 本页额外展示父→子委派\n③ 本机 dsh + SSE 可把真实步骤推到直播",
      toast: "根 Agent 汇总中",
    },
    {
      id: "deliver",
      phase: "回复交付",
      activeNodes: ["agent", "user"],
      activeEdge: "e-agent-user",
      states: {
        ...defaultStates(),
        user: "查收成果",
        agent: "已交付",
        "child-a": "已完成",
        "child-b": "已完成",
      },
      focus: "user",
      message:
        "根 Agent → 用户\n【交付】两点调研已汇总：可视化拓扑 + 本机 dsh/SSE。子 Agent 只向根回报，由根交付给你。",
      toast: "回复已交付 · 剧本结束",
    },
  ];

  /** Browser-only demo live event sequence (Pages-safe). */
  const DEMO_LIVE_EVENTS = [
    {
      agent: "system",
      type: "status",
      message: "演示直播开始 · 假数据定时注入，对齐 dsh 父→子委派（非真实 dsh）",
    },
    {
      agent: "user",
      type: "handoff",
      message: "请分别调研「沙盘可视化」和「本机 dsh / SSE」，用子 Agent 并行后再汇总。",
      edge: "e-user-agent",
      state: "正在说明需求",
      activeNodes: ["user", "agent"],
    },
    {
      agent: "agent",
      type: "status",
      message: "两项独立：同一轮 subagent + subagent_fork",
      state: "准备并行委派",
      activeNodes: ["agent"],
    },
    {
      agent: "child-a",
      type: "handoff",
      tool: "subagent",
      status: "running",
      message: "tool: subagent · 调研沙盘可视化 → started subagent child-a",
      edge: "e-agent-child-a",
      state: "启动中…",
      activeNodes: ["agent", "child-a"],
      createChild: { id: "child-a", title: "子 Agent A", en: "Spawn" },
    },
    {
      agent: "child-b",
      type: "handoff",
      tool: "subagent_fork",
      status: "running",
      message: "tool: subagent_fork · 调研本机 dsh / SSE → started subagent child-b",
      edge: "e-agent-child-b",
      state: "启动中…",
      activeNodes: ["agent", "child-b"],
      createChild: { id: "child-b", title: "子 Agent B", en: "Fork" },
    },
    {
      agent: "tools",
      type: "tool",
      tool: "Read",
      status: "running",
      message: "子 A · tool: Read · 沙盘说明",
      edge: "e-child-a-tools",
      state: "Read 运行中…",
      activeNodes: ["child-a", "tools"],
    },
    {
      agent: "tools",
      type: "tool",
      tool: "Read",
      status: "ok",
      message: "子 A · tool: Read ok · 用户 ↔ 助手 ↔ 工具",
      edge: "e-tools-child-a",
      state: "Read 完成",
      activeNodes: ["tools", "child-a"],
    },
    {
      agent: "child-a",
      type: "handoff",
      message: "子 A 回报：默认沙盘是单 Agent 拓扑，支持剧本与直播",
      edge: "e-child-a-agent",
      state: "已回报",
      activeNodes: ["child-a", "agent"],
    },
    {
      agent: "tools",
      type: "tool",
      tool: "Read",
      status: "running",
      message: "子 B · tool: Read · dsh / SSE 说明",
      edge: "e-child-b-tools",
      state: "Read 运行中…",
      activeNodes: ["child-b", "tools"],
    },
    {
      agent: "tools",
      type: "tool",
      tool: "Read",
      status: "ok",
      message: "子 B · tool: Read ok · headless --json + POST /tasks",
      edge: "e-tools-child-b",
      state: "Read 完成",
      activeNodes: ["tools", "child-b"],
    },
    {
      agent: "child-b",
      type: "handoff",
      message: "子 B 回报：本机 dsh --json 是根会话投影，经 SSE 推到沙盘",
      edge: "e-child-b-agent",
      state: "已回报",
      activeNodes: ["child-b", "agent"],
    },
    {
      agent: "agent",
      type: "message",
      message: "汇总：① 单 Agent 沙盘 ② 本页父→子委派 ③ 本机 dsh/SSE",
      state: "汇总两点…",
      activeNodes: ["agent"],
    },
    {
      agent: "agent",
      type: "handoff",
      message: "【交付】两点调研已汇总",
      edge: "e-agent-user",
      state: "已交付",
      activeNodes: ["agent", "user"],
    },
    {
      agent: "system",
      type: "complete",
      message: "演示直播结束",
      activeNodes: ["user"],
    },
  ];

  const state = {
    mode: "script",
    step: -1,
    playing: false,
    timer: null,
    selected: null,
    lastByNode: {},
    lastByEdge: {},
    nodeStates: {},
    activeNodes: new Set(),
    activeEdge: null,
    liveStatus: "idle",
    events: [],
    es: null,
    demoTimer: null,
    demoIndex: 0,
    demoRunning: false,
    currentTaskId: null,
    filterCurrentTask: true,
    runnerHint: "",
  };

  const el = {
    nodes: document.getElementById("nodes"),
    edges: document.getElementById("edges"),
    timeline: document.getElementById("timeline"),
    timelineWrap: document.getElementById("timeline-wrap"),
    eventStreamWrap: document.getElementById("event-stream-wrap"),
    eventList: document.getElementById("event-list"),
    eventCount: document.getElementById("event-count"),
    toast: document.getElementById("toast"),
    panelTitle: document.getElementById("panel-title"),
    panelBadge: document.getElementById("panel-badge"),
    panelType: document.getElementById("panel-type"),
    panelState: document.getElementById("panel-state"),
    panelDesc: document.getElementById("panel-desc"),
    panelMessage: document.getElementById("panel-message"),
    btnPlay: document.getElementById("btn-play"),
    btnPause: document.getElementById("btn-pause"),
    btnStep: document.getElementById("btn-step"),
    btnReset: document.getElementById("btn-reset"),
    stage: document.getElementById("stage"),
    toolbarScript: document.getElementById("toolbar-script"),
    toolbarLive: document.getElementById("toolbar-live"),
    tabScript: document.getElementById("tab-script"),
    tabLive: document.getElementById("tab-live"),
    liveDot: document.getElementById("live-dot"),
    liveStatusText: document.getElementById("live-status-text"),
    liveBadge: document.getElementById("live-badge"),
    btnLiveDemo: document.getElementById("btn-live-demo"),
    btnLiveStopDemo: document.getElementById("btn-live-stop-demo"),
    btnLiveConnect: document.getElementById("btn-live-connect"),
    btnLiveDisconnect: document.getElementById("btn-live-disconnect"),
    btnLiveClear: document.getElementById("btn-live-clear"),
    sseUrl: document.getElementById("sse-url"),
    taskPrompt: document.getElementById("task-prompt"),
    btnTaskSubmit: document.getElementById("btn-task-submit"),
    taskIdDisplay: document.getElementById("task-id-display"),
    taskFilter: document.getElementById("task-filter"),
    runnerHint: document.getElementById("runner-hint"),
  };

  function nodeById(id) {
    return NODES.find((n) => n.id === id);
  }

  function edgeById(id) {
    return EDGES.find((e) => e.id === id);
  }

  function rebuildTitles() {
    AGENT_TITLE = Object.fromEntries(NODES.map((n) => [n.id, n.title]));
    AGENT_TITLE.system = "系统";
  }

  function childEdgesFor(id) {
    return [
      { id: `e-agent-${id}`, from: "agent", to: id, label: "委派" },
      { id: `e-${id}-agent`, from: id, to: "agent", label: "回报" },
      { id: `e-${id}-tools`, from: id, to: "tools", label: "调用工具" },
      { id: `e-tools-${id}`, from: "tools", to: id, label: "工具结果" },
    ];
  }

  function layoutChildPositions() {
    const children = NODES.filter((n) => n.role === "child");
    const n = children.length;
    children.forEach((c, i) => {
      const left = n <= 1 ? 50 : 24 + (52 * i) / Math.max(n - 1, 1);
      const nodeEl = el.nodes.querySelector(`[data-id="${c.id}"]`);
      if (nodeEl) {
        nodeEl.style.setProperty("--nx", `${left}%`);
        nodeEl.style.setProperty("--ny", "52%");
      }
    });
  }

  function ensureChild(id, meta) {
    if (!id || id === "user" || id === "agent" || id === "tools" || id === "system") {
      return nodeById(id);
    }
    const existing = nodeById(id);
    if (existing) {
      if (meta && meta.title && meta.title !== existing.title) {
        existing.title = meta.title;
        AGENT_TITLE[id] = meta.title;
        const h = el.nodes.querySelector(`[data-id="${id}"] h3`);
        if (h) h.textContent = meta.title;
      }
      if (meta && meta.en) existing.en = meta.en;
      return existing;
    }
    const node = {
      id,
      title: (meta && meta.title) || "子 Agent",
      en: (meta && meta.en) || "Subagent",
      desc:
        (meta && meta.desc) ||
        "dsh 子 Agent：由根 Agent 通过 subagent / subagent_fork 委派，完成后回报根 Agent。子 Agent 内部工具在根会话投影中通常不可见。",
      role: "child",
    };
    NODES.push(node);
    AGENT_TITLE[id] = node.title;
    if (state.nodeStates[id] === undefined) state.nodeStates[id] = "空闲";
    if (state.lastByNode[id] === undefined) state.lastByNode[id] = "（尚未开始）";
    childEdgesFor(id).forEach((edge) => {
      if (!edgeById(edge.id)) {
        EDGES.push(edge);
        state.lastByEdge[edge.id] = "（尚未开始）";
      }
    });
    renderNodes();
    layout();
    return node;
  }

  function harvestChildren(ev) {
    const seen = new Set();
    if (ev.createChild && ev.createChild.id) {
      ensureChild(ev.createChild.id, ev.createChild);
      seen.add(ev.createChild.id);
    }
    const maybe = [];
    if (ev.agent) maybe.push(ev.agent);
    if (Array.isArray(ev.activeNodes)) maybe.push(...ev.activeNodes);
    if (ev.edge) {
      const m = String(ev.edge).match(/child-[A-Za-z0-9_-]+/g);
      if (m) maybe.push(...m);
    }
    maybe.forEach((id) => {
      if (id && String(id).startsWith("child-") && !seen.has(id)) {
        ensureChild(id);
        seen.add(id);
      }
    });
  }

  function resetGraph(includeScriptChildren) {
    NODES = BASE_NODES.map((n) => ({ ...n }));
    EDGES = BASE_EDGES.map((e) => ({ ...e }));
    rebuildTitles();
    if (includeScriptChildren) {
      SCRIPT_CHILDREN.forEach((c) => {
        NODES.push({ ...c, role: "child" });
        AGENT_TITLE[c.id] = c.title;
        childEdgesFor(c.id).forEach((edge) => {
          if (!edgeById(edge.id)) EDGES.push(edge);
        });
      });
    }
    state.nodeStates = Object.fromEntries(NODES.map((n) => [n.id, "空闲"]));
    state.lastByNode = Object.fromEntries(NODES.map((n) => [n.id, "（尚未开始）"]));
    state.lastByEdge = Object.fromEntries(EDGES.map((e) => [e.id, "（尚未开始）"]));
    state.activeNodes = new Set();
    state.activeEdge = null;
    renderNodes();
    layout();
  }

  function idleNodeStates() {
    return Object.fromEntries(NODES.map((n) => [n.id, "空闲"]));
  }

  function renderTimeline() {
    el.timeline.innerHTML = "";
    SCRIPT.forEach((step, i) => {
      const li = document.createElement("li");
      li.textContent = `${i + 1}. ${step.phase}`;
      if (i < state.step) li.classList.add("done");
      if (i === state.step) li.classList.add("current");
      el.timeline.appendChild(li);
    });
  }

  function formatClock(ts) {
    try {
      const d = ts ? new Date(ts) : new Date();
      if (Number.isNaN(d.getTime())) return "--:--:--";
      return d.toLocaleTimeString("zh-CN", { hour12: false });
    } catch {
      return "--:--:--";
    }
  }

  function visibleEvents() {
    if (!state.filterCurrentTask || !state.currentTaskId) return state.events;
    return state.events.filter(
      (ev) => !ev.task_id || ev.task_id === state.currentTaskId || (ev.type === "status" && !ev.task_id)
    );
  }

  function renderEventList() {
    el.eventList.innerHTML = "";
    const all = visibleEvents();
    const slice = all.slice(-80).reverse();
    slice.forEach((ev, idx) => {
      const li = document.createElement("li");
      if (idx === 0) li.classList.add("fresh");
      const agent = ev.agent || "system";
      const tid = ev.task_id ? escapeHtml(String(ev.task_id).replace(/^task_/, "…")) : "";
      const metaBits = [];
      if (ev.step != null) metaBits.push("#" + ev.step);
      if (ev.tool) metaBits.push(ev.tool);
      if (ev.status) metaBits.push(ev.status);
      const meta = metaBits.length ? metaBits.join(" · ") : ev.type || "event";
      li.innerHTML = `
        <span class="ts">${formatClock(ev.ts)}</span>
        <span class="agent" data-agent="${agent}">${AGENT_TITLE[agent] || agent}</span>
        <span class="etype">${escapeHtml(meta)}</span>
        <span class="task" title="${escapeHtml(ev.task_id || "")}">${tid || "—"}</span>
        <span class="payload">${escapeHtml(ev.message || "")}</span>
      `;
      el.eventList.appendChild(li);
    });
    const suffix =
      state.filterCurrentTask && state.currentTaskId ? `（过滤 ${state.currentTaskId}）` : "";
    el.eventCount.textContent = `${all.length}/${state.events.length} 条${suffix}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderNodes() {
    el.nodes.innerHTML = "";
    NODES.forEach((n) => {
      const div = document.createElement("div");
      div.className = "node";
      div.dataset.id = n.id;
      if (n.role) div.dataset.role = n.role;
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", `${n.title} ${n.en}`);
      div.innerHTML = `
        <div class="role">
          <span class="dot" aria-hidden="true"></span>
          <h3>${n.title}</h3>
          <span class="en">${n.en}</span>
        </div>
        <p class="status" data-status>${state.nodeStates[n.id] || "空闲"}</p>
      `;
      div.addEventListener("click", () => select({ kind: "node", id: n.id }));
      div.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          select({ kind: "node", id: n.id });
        }
      });
      el.nodes.appendChild(div);
    });
    layoutChildPositions();
  }

  function nodeCenter(id) {
    const node = el.nodes.querySelector(`[data-id="${id}"]`);
    if (!node) return { x: 0, y: 0 };
    const stageBox = el.stage.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return {
      x: box.left + box.width / 2 - stageBox.left,
      y: box.top + box.height / 2 - stageBox.top,
    };
  }

  function curvedPath(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const mx = (a.x + b.x) / 2 + dy * 0.12;
    const my = (a.y + b.y) / 2 - dx * 0.12;
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  }

  function renderEdges() {
    const w = el.stage.clientWidth;
    const h = el.stage.clientHeight;
    el.edges.setAttribute("viewBox", `0 0 ${w} ${h}`);
    el.edges.innerHTML = `
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#5b8cff"></path>
        </marker>
      </defs>
    `;

    EDGES.forEach((edge) => {
      if (!nodeById(edge.from) || !nodeById(edge.to)) return;
      const a = nodeCenter(edge.from);
      const b = nodeCenter(edge.to);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const pad = 46;
      const a2 = { x: a.x + Math.cos(ang) * pad, y: a.y + Math.sin(ang) * pad };
      const b2 = { x: b.x - Math.cos(ang) * pad, y: b.y - Math.sin(ang) * pad };
      const d = curvedPath(a2, b2);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("d", d);
      hit.setAttribute("class", "edge-hit");
      hit.dataset.id = edge.id;
      hit.addEventListener("click", (ev) => {
        ev.stopPropagation();
        select({ kind: "edge", id: edge.id });
      });

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "edge-path");
      path.dataset.id = edge.id;

      el.edges.appendChild(hit);
      el.edges.appendChild(path);
    });
  }

  function showToast(text) {
    if (!text) {
      el.toast.hidden = true;
      return;
    }
    el.toast.hidden = false;
    el.toast.textContent = text;
  }

  function currentActiveNodes() {
    if (state.mode === "live") return state.activeNodes;
    const step = state.step >= 0 ? SCRIPT[state.step] : null;
    return new Set(step ? step.activeNodes : []);
  }

  function currentActiveEdge() {
    if (state.mode === "live") return state.activeEdge;
    const step = state.step >= 0 ? SCRIPT[state.step] : null;
    return step ? step.activeEdge : null;
  }

  function applyHighlights() {
    const activeNodes = currentActiveNodes();
    const activeEdge = currentActiveEdge();

    el.nodes.querySelectorAll(".node").forEach((node) => {
      const id = node.dataset.id;
      node.classList.toggle("active", activeNodes.has(id));
      node.classList.toggle(
        "selected",
        state.selected && state.selected.kind === "node" && state.selected.id === id
      );
      const st = node.querySelector("[data-status]");
      if (st) st.textContent = state.nodeStates[id] || "空闲";
    });

    el.edges.querySelectorAll(".edge-path").forEach((path) => {
      const id = path.dataset.id;
      path.classList.toggle("active", id === activeEdge);
      path.classList.toggle(
        "selected",
        state.selected && state.selected.kind === "edge" && state.selected.id === id
      );
    });
  }

  function updatePanel() {
    if (!state.selected) {
      el.panelTitle.textContent = "选择一个节点或连线";
      if (state.mode === "live") {
        const labels = {
          idle: "未连接",
          connecting: "连接中",
          live: "直播中",
          demo: "演示直播",
          disconnected: "已断开",
          error: "出错",
        };
        el.panelBadge.textContent = labels[state.liveStatus] || "直播";
        el.panelBadge.className =
          "badge" + (state.liveStatus === "live" || state.liveStatus === "demo" ? " busy" : "");
        el.panelState.textContent = `${state.events.length} 条事件`;
      } else {
        el.panelBadge.textContent = state.step < 0 ? "空闲" : "运行中";
        el.panelBadge.className = "badge" + (state.step >= 0 ? " busy" : "");
        el.panelState.textContent = state.step < 0 ? "未开始" : SCRIPT[state.step].phase;
      }
      el.panelType.textContent = "—";
      el.panelDesc.textContent =
        "点击画布上的节点或消息边，查看职责与最近一次交接内容（用户 / 根 Agent / 子 Agent / 工具）。";
      el.panelMessage.textContent =
        state.mode === "live"
          ? state.events.length
            ? state.events[state.events.length - 1].message
            : "（等待事件…）"
          : state.step >= 0
            ? SCRIPT[state.step].message
            : "（尚未开始）";
      return;
    }

    if (state.selected.kind === "node") {
      const n = nodeById(state.selected.id);
      if (!n) return;
      const busy = currentActiveNodes().has(n.id);
      el.panelTitle.textContent = `${n.title} · ${n.en}`;
      el.panelBadge.textContent = busy ? "活跃" : state.nodeStates[n.id];
      el.panelBadge.className = "badge" + (busy ? " busy" : "");
      el.panelType.textContent = n.role === "child" ? "子 Agent 节点" : "角色节点";
      el.panelState.textContent = state.nodeStates[n.id] || "空闲";
      el.panelDesc.textContent = n.desc;
      el.panelMessage.textContent = state.lastByNode[n.id] || "（尚未开始）";
      return;
    }

    const e = edgeById(state.selected.id);
    if (!e) return;
    const from = nodeById(e.from);
    const to = nodeById(e.to);
    const isActive = currentActiveEdge() === e.id;
    el.panelTitle.textContent = `${from ? from.title : e.from} → ${to ? to.title : e.to}`;
    el.panelBadge.textContent = isActive ? "交接中" : "消息边";
    el.panelBadge.className = "badge" + (isActive ? " busy" : "");
    el.panelType.textContent = `连线 · ${e.label}`;
    el.panelState.textContent = isActive ? "当前 handoff" : "历史可回看";
    el.panelDesc.textContent = `表示「${e.label}」方向的消息交接。点击后可查看该边上最近一次传递的内容。`;
    el.panelMessage.textContent = state.lastByEdge[e.id] || "（尚未开始）";
  }

  function select(sel) {
    state.selected = sel;
    applyHighlights();
    updatePanel();
  }

  function applyStep(index) {
    state.step = index;
    if (index < 0) {
      state.nodeStates = idleNodeStates();
      state.activeNodes = new Set();
      state.activeEdge = null;
      showToast("");
      renderTimeline();
      applyHighlights();
      updatePanel();
      return;
    }

    const step = SCRIPT[index];
    state.nodeStates = { ...idleNodeStates(), ...step.states };
    state.activeNodes = new Set(step.activeNodes);
    state.activeEdge = step.activeEdge;

    step.activeNodes.forEach((id) => {
      state.lastByNode[id] = step.message;
    });
    if (step.activeEdge) {
      state.lastByEdge[step.activeEdge] = step.message;
      const edge = edgeById(step.activeEdge);
      if (edge) {
        state.lastByNode[edge.from] = step.message;
        state.lastByNode[edge.to] = step.message;
      }
    }

    if (!state.selected && step.focus) {
      state.selected = { kind: "node", id: step.focus };
    }

    showToast(step.toast);
    renderTimeline();
    applyHighlights();
    updatePanel();
    syncButtons();
  }

  function stopTimer() {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function syncButtons() {
    const atEnd = state.step >= SCRIPT.length - 1;
    el.btnPlay.disabled = state.playing || atEnd;
    el.btnPause.disabled = !state.playing;
    el.btnStep.disabled = state.playing || atEnd;
  }

  function scheduleNext() {
    stopTimer();
    if (!state.playing) return;
    if (state.step >= SCRIPT.length - 1) {
      state.playing = false;
      syncButtons();
      el.panelBadge.textContent = "完成";
      el.panelBadge.className = "badge done";
      return;
    }
    const delay = [2, 3, 4, 7].includes(state.step) ? 1500 : 1100;
    state.timer = setTimeout(() => {
      applyStep(state.step + 1);
      scheduleNext();
    }, delay);
  }

  function play() {
    if (state.mode !== "script") return;
    if (state.step >= SCRIPT.length - 1) return;
    state.playing = true;
    if (state.step < 0) applyStep(0);
    syncButtons();
    scheduleNext();
  }

  function pause() {
    state.playing = false;
    stopTimer();
    syncButtons();
  }

  function stepOnce() {
    if (state.mode !== "script") return;
    if (state.playing) return;
    if (state.step >= SCRIPT.length - 1) return;
    applyStep(state.step + 1);
    syncButtons();
  }

  function resetScript() {
    pause();
    state.selected = null;
    resetGraph(true);
    applyStep(-1);
    syncButtons();
  }

  const LIVE_STATUS_LABEL = {
    idle: "未连接",
    connecting: "连接中…",
    live: "直播中",
    demo: "演示直播中",
    disconnected: "已断开",
    error: "连接失败",
  };

  function setLiveStatus(status) {
    state.liveStatus = status;
    el.liveDot.dataset.status = status;
    el.liveStatusText.textContent = LIVE_STATUS_LABEL[status] || status;
    const isDemo = status === "demo";
    el.liveBadge.hidden = !isDemo;
    el.btnLiveDisconnect.disabled = !(status === "live" || status === "connecting");
    el.btnLiveConnect.disabled = status === "live" || status === "connecting" || state.demoRunning;
    el.btnLiveDemo.disabled = state.demoRunning || status === "live" || status === "connecting";
    el.btnLiveStopDemo.disabled = !state.demoRunning;
    if (state.mode === "live") updatePanel();
  }

  function normalizeEvent(raw) {
    const ev = typeof raw === "string" ? JSON.parse(raw) : raw;
    const out = {
      ts: ev.ts || new Date().toISOString(),
      agent: ev.agent || "system",
      type: ev.type || "message",
      message: ev.message || "",
      edge: ev.edge || null,
      state: ev.state || null,
      activeNodes: Array.isArray(ev.activeNodes) ? ev.activeNodes : null,
    };
    if (ev.task_id != null) out.task_id = String(ev.task_id);
    if (ev.step != null && Number.isFinite(Number(ev.step))) out.step = Number(ev.step);
    if (ev.tool != null) out.tool = String(ev.tool);
    if (ev.status != null) out.status = String(ev.status);
    if (ev.detail != null && typeof ev.detail === "object") out.detail = ev.detail;
    if (ev.createChild != null && typeof ev.createChild === "object") out.createChild = ev.createChild;
    return out;
  }

  function ingestEvent(raw, opts) {
    opts = opts || {};
    let ev;
    try {
      ev = normalizeEvent(raw);
    } catch {
      return;
    }
    harvestChildren(ev);
    state.events.push(ev);
    if (ev.task_id && (ev.type === "task_start" || !state.currentTaskId)) {
      state.currentTaskId = ev.task_id;
      if (el.taskIdDisplay) el.taskIdDisplay.textContent = ev.task_id;
    }

    const agent = ev.agent;
    if (agent && agent !== "system") {
      if (state.nodeStates[agent] === undefined && String(agent).startsWith("child-")) {
        ensureChild(agent);
      }
      if (state.nodeStates[agent] !== undefined) {
        if (ev.state) state.nodeStates[agent] = ev.state;
        else if (ev.type === "status" || ev.type === "tool") state.nodeStates[agent] = "工作中";
        else if (ev.type === "complete") state.nodeStates[agent] = "完成";
        state.lastByNode[agent] = ev.message;
      }
    }

    if (ev.activeNodes) {
      ev.activeNodes.forEach((id) => {
        if (String(id).startsWith("child-")) ensureChild(id);
      });
      state.activeNodes = new Set(ev.activeNodes);
    } else if (agent && agent !== "system") {
      state.activeNodes = new Set([agent]);
    }

    if (ev.edge && !edgeById(ev.edge)) {
      harvestChildren(ev);
    }

    if (ev.edge && edgeById(ev.edge)) {
      state.activeEdge = ev.edge;
      state.lastByEdge[ev.edge] = ev.message;
      const edge = edgeById(ev.edge);
      state.lastByNode[edge.from] = ev.message;
      state.lastByNode[edge.to] = ev.message;
      if (!ev.activeNodes) {
        state.activeNodes = new Set([edge.from, edge.to]);
      }
    }

    if (ev.type === "complete") {
      showToast(ev.message || "运行完成");
    } else if (!opts.silentToast) {
      showToast(`${AGENT_TITLE[agent] || agent} · ${ev.type}`);
    }

    if (agent && agent !== "system" && nodeById(agent) && !state.selected) {
      state.selected = { kind: "node", id: agent };
    }

    renderEventList();
    applyHighlights();
    updatePanel();
  }

  function clearLiveEvents() {
    state.events = [];
    resetGraph(false);
    showToast("");
    renderEventList();
    applyHighlights();
    updatePanel();
  }

  function stopDemoLive() {
    if (state.demoTimer) {
      clearTimeout(state.demoTimer);
      state.demoTimer = null;
    }
    state.demoRunning = false;
    if (state.liveStatus === "demo") setLiveStatus("idle");
    else {
      el.btnLiveDemo.disabled = state.liveStatus === "live" || state.liveStatus === "connecting";
      el.btnLiveStopDemo.disabled = true;
    }
  }

  function scheduleDemoTick() {
    if (!state.demoRunning) return;
    if (state.demoIndex >= DEMO_LIVE_EVENTS.length) {
      state.demoRunning = false;
      setLiveStatus("idle");
      showToast("演示直播结束");
      el.btnLiveStopDemo.disabled = true;
      el.btnLiveDemo.disabled = false;
      return;
    }
    const delay = state.demoIndex === 0 ? 200 : 900;
    state.demoTimer = setTimeout(() => {
      if (!state.demoRunning) return;
      ingestEvent(DEMO_LIVE_EVENTS[state.demoIndex]);
      state.demoIndex += 1;
      scheduleDemoTick();
    }, delay);
  }

  function startDemoLive() {
    disconnectSSE(true);
    clearLiveEvents();
    state.demoIndex = 0;
    state.demoRunning = true;
    setLiveStatus("demo");
    showToast("演示直播 · 浏览器内定时注入多 Agent 事件");
    scheduleDemoTick();
  }

  function disconnectSSE(silent) {
    if (state.es) {
      try {
        state.es.close();
      } catch {
        /* ignore */
      }
      state.es = null;
    }
    if (!silent && state.mode === "live" && !state.demoRunning) {
      setLiveStatus("disconnected");
    }
  }

  function connectSSE() {
    stopDemoLive();
    disconnectSSE(true);
    const url = (el.sseUrl.value || "").trim();
    if (!url) {
      setLiveStatus("error");
      showToast("请填写 SSE 地址");
      return;
    }
    setLiveStatus("connecting");
    showToast("正在连接 SSE…");
    let opened = false;
    try {
      const es = new EventSource(url);
      state.es = es;
      es.onopen = () => {
        opened = true;
        setLiveStatus("live");
        showToast("已连接 · 等待真实事件");
      };
      es.onmessage = (msg) => {
        if (!msg.data || msg.data === ":keepalive") return;
        try {
          ingestEvent(JSON.parse(msg.data));
        } catch {
          ingestEvent({ agent: "system", type: "message", message: msg.data });
        }
      };
      es.addEventListener("agent", (msg) => {
        try {
          ingestEvent(JSON.parse(msg.data));
        } catch {
          /* ignore bad payloads */
        }
      });
      es.onerror = () => {
        if (state.es === es) {
          es.close();
          state.es = null;
          setLiveStatus(opened ? "disconnected" : "error");
          showToast(opened ? "SSE 已断开" : "无法连接 SSE（可先跑 server/ 或改用演示直播）");
        }
      };
    } catch (err) {
      setLiveStatus("error");
      showToast("SSE 初始化失败");
    }
  }

  function apiBaseFromSse() {
    const url = (el.sseUrl.value || "").trim() || "http://127.0.0.1:8787/events";
    try {
      const u = new URL(url);
      let path = u.pathname || "";
      if (path.endsWith("/events")) path = path.slice(0, -"/events".length) || "";
      return `${u.origin}${path}`;
    } catch {
      return "http://127.0.0.1:8787";
    }
  }

  async function refreshRunnerHint() {
    if (!el.runnerHint) return;
    try {
      const res = await fetch(`${apiBaseFromSse()}/runner`);
      const data = await res.json();
      if (!data.ok) {
        el.runnerHint.textContent = data.error || "runner 不可用";
        return;
      }
      state.runnerHint = data.runner_kind;
      el.runnerHint.textContent = data.dsh_on_path
        ? `runner: dsh (${data.profile}) · 多 Agent`
        : `runner: fake-dsh（未检测到 dsh）· 多 Agent`;
      el.runnerHint.title = data.hint || data.runner || "";
    } catch {
      el.runnerHint.textContent = "无法读取 /runner（先启动 node server/sse-server.js）";
    }
  }

  async function submitRealTask() {
    const prompt = ((el.taskPrompt && el.taskPrompt.value) || "").trim();
    if (!prompt) {
      showToast("请填写真实任务内容");
      return;
    }
    stopDemoLive();
    if (state.liveStatus !== "live" && state.liveStatus !== "connecting") {
      connectSSE();
    }
    el.btnTaskSubmit.disabled = true;
    showToast("正在提交多 Agent 任务…");
    try {
      const res = await fetch(`${apiBaseFromSse()}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "multi" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      state.currentTaskId = data.task_id;
      if (el.taskIdDisplay) el.taskIdDisplay.textContent = data.task_id;
      showToast(`已受理 ${data.task_id} · ${data.runner_kind} · multi`);
      refreshRunnerHint();
    } catch (err) {
      showToast(`提交失败：${err.message || err}`);
    } finally {
      el.btnTaskSubmit.disabled = false;
    }
  }

  function setMode(mode) {
    if (mode === state.mode) return;

    if (state.mode === "script") {
      pause();
    } else {
      stopDemoLive();
      disconnectSSE(true);
    }

    state.mode = mode;
    document.body.classList.toggle("mode-live", mode === "live");
    el.tabScript.classList.toggle("active", mode === "script");
    el.tabLive.classList.toggle("active", mode === "live");
    el.tabScript.setAttribute("aria-selected", mode === "script" ? "true" : "false");
    el.tabLive.setAttribute("aria-selected", mode === "live" ? "true" : "false");
    el.toolbarScript.hidden = mode !== "script";
    el.toolbarLive.hidden = mode !== "live";
    el.timelineWrap.hidden = mode !== "script";
    el.eventStreamWrap.hidden = mode !== "live";

    state.selected = null;
    if (mode === "script") {
      resetGraph(true);
      applyStep(state.step >= 0 ? state.step : -1);
      syncButtons();
    } else {
      resetGraph(false);
      showToast("直播模式：多 Agent（用户 / 根 Agent / 子 Agent / 工具）· 演示直播 / SSE / 本机 dsh");
      setLiveStatus(state.es ? "live" : "idle");
      renderEventList();
      applyHighlights();
      updatePanel();
      refreshRunnerHint();
    }
  }

  function layout() {
    layoutChildPositions();
    renderEdges();
    applyHighlights();
  }

  resetGraph(true);
  renderTimeline();
  renderEventList();
  layout();
  applyStep(-1);
  syncButtons();
  setLiveStatus("idle");

  el.btnPlay.addEventListener("click", play);
  el.btnPause.addEventListener("click", pause);
  el.btnStep.addEventListener("click", stepOnce);
  el.btnReset.addEventListener("click", resetScript);

  el.tabScript.addEventListener("click", () => setMode("script"));
  el.tabLive.addEventListener("click", () => setMode("live"));

  el.btnLiveDemo.addEventListener("click", startDemoLive);
  el.btnLiveStopDemo.addEventListener("click", () => {
    stopDemoLive();
    showToast("已停止演示直播");
  });
  el.btnLiveConnect.addEventListener("click", connectSSE);
  el.btnLiveDisconnect.addEventListener("click", () => {
    disconnectSSE(false);
    showToast("已断开 SSE");
  });
  el.btnLiveClear.addEventListener("click", () => {
    clearLiveEvents();
    showToast("事件流已清空");
  });

  if (el.btnTaskSubmit) {
    el.btnTaskSubmit.addEventListener("click", submitRealTask);
  }
  if (el.taskPrompt) {
    el.taskPrompt.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        submitRealTask();
      }
    });
  }
  if (el.taskFilter) {
    el.taskFilter.addEventListener("change", () => {
      state.filterCurrentTask = !!el.taskFilter.checked;
      renderEventList();
    });
  }
  el.tabLive.addEventListener("click", () => {
    refreshRunnerHint();
  });

  window.addEventListener("resize", () => {
    layout();
  });

  requestAnimationFrame(() => layout());
})();
