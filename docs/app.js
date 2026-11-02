(() => {
  "use strict";

  const NODES = [
    {
      id: "user",
      title: "用户",
      en: "User",
      desc: "提出目标与约束，接收 Agent 最终回复。沙盘中代表真人发起方。",
    },
    {
      id: "agent",
      title: "助手",
      en: "Agent",
      desc: "dsh 单 Agent：理解任务、推理、决定是否调用工具，并整理回复交给用户。",
    },
    {
      id: "tools",
      title: "工具",
      en: "Tools",
      desc: "bash / Read / glob 等工具调用。亮起表示正在执行或刚返回结果。",
    },
  ];

  const EDGES = [
    { id: "e-user-agent", from: "user", to: "agent", label: "提出任务" },
    { id: "e-agent-tools", from: "agent", to: "tools", label: "调用工具" },
    { id: "e-tools-agent", from: "tools", to: "agent", label: "工具结果" },
    { id: "e-agent-user", from: "agent", to: "user", label: "回复交付" },
  ];

  const AGENT_TITLE = Object.fromEntries(NODES.map((n) => [n.id, n.title]));
  AGENT_TITLE.system = "系统";

  /** Scripted scenario: single-agent read → draft → deliver (matches dsh headless) */
  const SCRIPT = [
    {
      id: "brief",
      phase: "提出任务",
      activeNodes: ["user"],
      activeEdge: "e-user-agent",
      states: {
        user: "正在说明需求",
        agent: "待命",
        tools: "空闲",
      },
      focus: "user",
      message:
        "用户 → 助手\n请总结本仓库 README：用三条中文要点，并提到沙盘能力与 SSE。",
      toast: "用户提出任务",
    },
    {
      id: "think",
      phase: "理解与规划",
      activeNodes: ["agent"],
      activeEdge: null,
      states: {
        user: "等待中",
        agent: "理解任务中",
        tools: "空闲",
      },
      focus: "agent",
      message:
        "助手（内部）\n计划：① 用 Read 读 README ② 提炼三条要点 ③ 回复用户。仍是同一 Agent，不另开角色。",
      toast: "助手理解任务",
    },
    {
      id: "call-tool",
      phase: "调用工具",
      activeNodes: ["agent", "tools"],
      activeEdge: "e-agent-tools",
      states: {
        user: "等待中",
        agent: "发起工具调用",
        tools: "Read 运行中…",
      },
      focus: "tools",
      message:
        "助手 → 工具\ntool: Read · path=README.md · status=running",
      toast: "助手调用 Read",
    },
    {
      id: "tool-result",
      phase: "工具结果",
      activeNodes: ["tools", "agent"],
      activeEdge: "e-tools-agent",
      states: {
        user: "等待中",
        agent: "消化工具输出",
        tools: "Read 完成",
      },
      focus: "agent",
      message:
        "工具 → 助手\ntool: Read ok · README 约 180 行（摘要回传，未贴全文）",
      toast: "工具结果回到助手",
    },
    {
      id: "draft",
      phase: "起草回复",
      activeNodes: ["agent"],
      activeEdge: null,
      states: {
        user: "等待中",
        agent: "起草要点…",
        tools: "空闲",
      },
      focus: "agent",
      message:
        "助手（起草）\n① 可点沙盘对齐 dsh 单 Agent\n② 剧本 / 直播双模式\n③ 本机 SSE + Task API 可接真实步骤",
      toast: "助手起草回复",
    },
    {
      id: "deliver",
      phase: "回复交付",
      activeNodes: ["agent", "user"],
      activeEdge: "e-agent-user",
      states: {
        user: "查收成果",
        agent: "已交付",
        tools: "空闲",
      },
      focus: "user",
      message:
        "助手 → 用户\n【交付】三条要点已就绪：单 Agent 可视化 · 剧本/直播 · 本机 dsh/SSE。",
      toast: "回复已交付 · 剧本结束",
    },
  ];

  /** Browser-only demo live event sequence (Pages-safe). */
  const DEMO_LIVE_EVENTS = [
    { agent: "system", type: "status", message: "演示直播开始 · 假数据定时注入，对齐单 Agent（非真实 dsh）" },
    {
      agent: "user",
      type: "handoff",
      message: "请总结本仓库 README：三条中文要点，提到沙盘与 SSE。",
      edge: "e-user-agent",
      state: "正在说明需求",
      activeNodes: ["user", "agent"],
    },
    {
      agent: "agent",
      type: "status",
      message: "理解任务：读 README → 提炼 → 回复（同一 Agent）",
      state: "理解任务中",
      activeNodes: ["agent"],
    },
    {
      agent: "tools",
      type: "tool",
      tool: "Read",
      status: "running",
      message: "tool: Read · README.md",
      edge: "e-agent-tools",
      state: "Read 运行中…",
      activeNodes: ["agent", "tools"],
    },
    {
      agent: "tools",
      type: "tool",
      tool: "Read",
      status: "ok",
      message: "tool: Read ok · 约 180 行",
      edge: "e-tools-agent",
      state: "Read 完成",
      activeNodes: ["tools", "agent"],
    },
    {
      agent: "agent",
      type: "message",
      message: "草稿：① 单 Agent 沙盘 ② 剧本/直播 ③ 本机 SSE / dsh",
      state: "起草要点…",
      activeNodes: ["agent"],
    },
    {
      agent: "agent",
      type: "handoff",
      message: "【交付】三条要点已就绪",
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
    mode: "script", // script | live
    step: -1,
    playing: false,
    timer: null,
    selected: null,
    lastByNode: Object.fromEntries(NODES.map((n) => [n.id, "（尚未开始）"])),
    lastByEdge: Object.fromEntries(EDGES.map((e) => [e.id, "（尚未开始）"])),
    nodeStates: Object.fromEntries(NODES.map((n) => [n.id, "空闲"])),
    activeNodes: new Set(),
    activeEdge: null,
    // live
    liveStatus: "idle", // idle | connecting | live | demo | disconnected | error
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
      (ev) => !ev.task_id || ev.task_id === state.currentTaskId || ev.type === "status" && !ev.task_id
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
      const tid = ev.task_id
        ? escapeHtml(String(ev.task_id).replace(/^task_/, "…"))
        : "";
      const metaBits = [];
      if (ev.step != null) metaBits.push("#" + ev.step);
      if (ev.tool) metaBits.push(ev.tool);
      if (ev.status) metaBits.push(ev.status);
      const meta = metaBits.length ? metaBits.join(" · ") : (ev.type || "event");
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
      state.filterCurrentTask && state.currentTaskId
        ? `（过滤 ${state.currentTaskId}）`
        : "";
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
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", `${n.title} ${n.en}`);
      div.innerHTML = `
        <div class="role">
          <span class="dot" aria-hidden="true"></span>
          <h3>${n.title}</h3>
          <span class="en">${n.en}</span>
        </div>
        <p class="status" data-status>${state.nodeStates[n.id]}</p>
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
          "badge" +
          (state.liveStatus === "live" || state.liveStatus === "demo" ? " busy" : "");
        el.panelState.textContent = `${state.events.length} 条事件`;
      } else {
        el.panelBadge.textContent = state.step < 0 ? "空闲" : "运行中";
        el.panelBadge.className = "badge" + (state.step >= 0 ? " busy" : "");
        el.panelState.textContent = state.step < 0 ? "未开始" : SCRIPT[state.step].phase;
      }
      el.panelType.textContent = "—";
      el.panelDesc.textContent =
        "点击画布上的节点或消息边，查看职责与最近一次交接内容（用户 / 助手 / 工具）。";
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
      const busy = currentActiveNodes().has(n.id);
      el.panelTitle.textContent = `${n.title} · ${n.en}`;
      el.panelBadge.textContent = busy ? "活跃" : state.nodeStates[n.id];
      el.panelBadge.className = "badge" + (busy ? " busy" : "");
      el.panelType.textContent = "角色节点";
      el.panelState.textContent = state.nodeStates[n.id] || "空闲";
      el.panelDesc.textContent = n.desc;
      el.panelMessage.textContent = state.lastByNode[n.id] || "（尚未开始）";
      return;
    }

    const e = edgeById(state.selected.id);
    const from = nodeById(e.from);
    const to = nodeById(e.to);
    const isActive = currentActiveEdge() === e.id;
    el.panelTitle.textContent = `${from.title} → ${to.title}`;
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
    state.nodeStates = { ...step.states };
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
    const delay = state.step === 2 ? 1600 : 1100;
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
    state.lastByNode = Object.fromEntries(NODES.map((n) => [n.id, "（尚未开始）"]));
    state.lastByEdge = Object.fromEntries(EDGES.map((e) => [e.id, "（尚未开始）"]));
    applyStep(-1);
    syncButtons();
  }

  /* —— Live mode —— */

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
    return out;
  }

  function ingestEvent(raw, opts = {}) {
    let ev;
    try {
      ev = normalizeEvent(raw);
    } catch {
      return;
    }
    state.events.push(ev);
    if (ev.task_id && (ev.type === "task_start" || !state.currentTaskId)) {
      state.currentTaskId = ev.task_id;
      if (el.taskIdDisplay) el.taskIdDisplay.textContent = ev.task_id;
    }

    const agent = ev.agent;
    if (agent && agent !== "system" && state.nodeStates[agent] !== undefined) {
      if (ev.state) state.nodeStates[agent] = ev.state;
      else if (ev.type === "status" || ev.type === "tool") state.nodeStates[agent] = "工作中";
      else if (ev.type === "complete") state.nodeStates[agent] = "完成";
      state.lastByNode[agent] = ev.message;
    }

    if (ev.activeNodes) {
      state.activeNodes = new Set(ev.activeNodes);
    } else if (agent && agent !== "system") {
      state.activeNodes = new Set([agent]);
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
    } else if (ev.type === "status" || ev.type === "tool" || ev.type === "message") {
      // keep previous edge highlight briefly unless cleared
    }

    if (ev.type === "complete") {
      showToast(ev.message || "运行完成");
    } else if (!opts.silentToast) {
      showToast(`${AGENT_TITLE[agent] || agent} · ${ev.type}`);
    }

    if (agent && agent !== "system" && !state.selected) {
      state.selected = { kind: "node", id: agent };
    }

    renderEventList();
    applyHighlights();
    updatePanel();
  }

  function clearLiveEvents() {
    state.events = [];
    state.activeNodes = new Set();
    state.activeEdge = null;
    state.nodeStates = idleNodeStates();
    state.lastByNode = Object.fromEntries(NODES.map((n) => [n.id, "（尚未开始）"]));
    state.lastByEdge = Object.fromEntries(EDGES.map((e) => [e.id, "（尚未开始）"]));
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
    showToast("演示直播 · 浏览器内定时注入");
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
        ? `runner: dsh (${data.profile})`
        : `runner: fake-dsh（未检测到 dsh）`;
      el.runnerHint.title = data.hint || data.runner || "";
    } catch {
      el.runnerHint.textContent = "无法读取 /runner（先启动 node server/sse-server.js）";
    }
  }

  async function submitRealTask() {
    const prompt = (el.taskPrompt && el.taskPrompt.value || "").trim();
    if (!prompt) {
      showToast("请填写真实任务内容");
      return;
    }
    stopDemoLive();
    if (state.liveStatus !== "live" && state.liveStatus !== "connecting") {
      connectSSE();
    }
    el.btnTaskSubmit.disabled = true;
    showToast("正在提交任务…");
    try {
      const res = await fetch(`${apiBaseFromSse()}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      state.currentTaskId = data.task_id;
      if (el.taskIdDisplay) el.taskIdDisplay.textContent = data.task_id;
      showToast(`已受理 ${data.task_id} · ${data.runner_kind}`);
      refreshRunnerHint();
    } catch (err) {
      showToast(`提交失败：${err.message || err}`);
    } finally {
      el.btnTaskSubmit.disabled = false;
    }
  }

  function setMode(mode) {
    if (mode === state.mode) return;

    // tear down outgoing mode
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
      state.lastByNode = Object.fromEntries(NODES.map((n) => [n.id, "（尚未开始）"]));
      state.lastByEdge = Object.fromEntries(EDGES.map((e) => [e.id, "（尚未开始）"]));
      applyStep(state.step >= 0 ? state.step : -1);
      syncButtons();
    } else {
      state.nodeStates = idleNodeStates();
      state.activeNodes = new Set();
      state.activeEdge = null;
      showToast("直播模式：单 Agent（用户/助手/工具）· 演示直播 / SSE / 本机 dsh");
      setLiveStatus(state.es ? "live" : "idle");
      renderEventList();
      applyHighlights();
      updatePanel();
      refreshRunnerHint();
    }
  }

  function layout() {
    renderEdges();
    applyHighlights();
  }

  // init
  renderNodes();
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
