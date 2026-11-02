(() => {
  "use strict";

  const NODES = [
    {
      id: "user",
      title: "用户",
      en: "User",
      desc: "提出目标与约束，接收最终汇总。沙盘中代表真人发起方。",
    },
    {
      id: "planner",
      title: "规划者",
      en: "Planner",
      desc: "理解目标、拆解步骤、向执行者派发任务，并在审核打回时调整计划。",
    },
    {
      id: "executor",
      title: "执行者",
      en: "Executor",
      desc: "按规划执行子任务（检索、起草、整理），把中间产物交给审核者。",
    },
    {
      id: "reviewer",
      title: "审核者",
      en: "Reviewer",
      desc: "检查质量与合规，决定通过或打回；通过后由规划者汇总给用户。",
    },
  ];

  const EDGES = [
    { id: "e-user-planner", from: "user", to: "planner", label: "提出任务" },
    { id: "e-planner-executor", from: "planner", to: "executor", label: "派发" },
    { id: "e-executor-reviewer", from: "executor", to: "reviewer", label: "提交审核" },
    { id: "e-reviewer-planner", from: "reviewer", to: "planner", label: "审核结果" },
    { id: "e-planner-user", from: "planner", to: "user", label: "汇总交付" },
  ];

  const AGENT_TITLE = Object.fromEntries(NODES.map((n) => [n.id, n.title]));
  AGENT_TITLE.system = "系统";

  /** Scripted scenario: planning → dispatch → wait → review → summary */
  const SCRIPT = [
    {
      id: "brief",
      phase: "提出目标",
      activeNodes: ["user"],
      activeEdge: "e-user-planner",
      states: {
        user: "正在说明需求",
        planner: "待命",
        executor: "空闲",
        reviewer: "空闲",
      },
      focus: "user",
      message:
        "用户 → 规划者\n请为「Q1 产品发布」起草对外公告：强调稳定性与迁移指引，语气专业克制，800 字内。",
      toast: "用户提出任务目标",
    },
    {
      id: "plan",
      phase: "规划拆解",
      activeNodes: ["planner"],
      activeEdge: null,
      states: {
        user: "等待中",
        planner: "拆解步骤中",
        executor: "空闲",
        reviewer: "空闲",
      },
      focus: "planner",
      message:
        "规划者（内部）\n1) 收集产品卖点与风险提示\n2) 执行者起草公告正文\n3) 审核者检查口径与敏感表述\n4) 汇总交付用户",
      toast: "规划者拆解任务",
    },
    {
      id: "dispatch",
      phase: "派发执行",
      activeNodes: ["planner", "executor"],
      activeEdge: "e-planner-executor",
      states: {
        user: "等待中",
        planner: "已派发，等待回报",
        executor: "接收任务",
        reviewer: "空闲",
      },
      focus: "executor",
      message:
        "规划者 → 执行者\n子任务：撰写公告草稿。约束：专业克制、含迁移三步指引、避免绝对化承诺。",
      toast: "任务已派发给执行者",
    },
    {
      id: "work",
      phase: "执行中",
      activeNodes: ["executor"],
      activeEdge: null,
      states: {
        user: "等待中",
        planner: "等待回报",
        executor: "撰写草稿…",
        reviewer: "空闲",
      },
      focus: "executor",
      message:
        "执行者（进行中）\n已生成大纲：开场价值主张 → 核心改进 → 迁移指引 → 支持渠道。正在填充细节…",
      toast: "执行者工作中（模拟等待）",
    },
    {
      id: "submit",
      phase: "提交审核",
      activeNodes: ["executor", "reviewer"],
      activeEdge: "e-executor-reviewer",
      states: {
        user: "等待中",
        planner: "等待审核",
        executor: "已提交",
        reviewer: "排队审阅",
      },
      focus: "reviewer",
      message:
        "执行者 → 审核者\n【草稿摘要】Q1 版本更稳、迁移三步走、提供回滚说明。请审口径与风险表述。",
      toast: "草稿提交审核",
    },
    {
      id: "review",
      phase: "审核检查",
      activeNodes: ["reviewer"],
      activeEdge: null,
      states: {
        user: "等待中",
        planner: "等待审核",
        executor: "待命（可修订）",
        reviewer: "检查质量中",
      },
      focus: "reviewer",
      message:
        "审核者（检查清单）\n✓ 无绝对化承诺\n✓ 含迁移与回滚\n△ 建议弱化「业界领先」措辞\n结论：有条件通过",
      toast: "审核者检查中",
    },
    {
      id: "feedback",
      phase: "审核反馈",
      activeNodes: ["reviewer", "planner"],
      activeEdge: "e-reviewer-planner",
      states: {
        user: "等待中",
        planner: "接收审核意见",
        executor: "待命",
        reviewer: "已反馈",
      },
      focus: "planner",
      message:
        "审核者 → 规划者\n有条件通过。请去掉「业界领先」，改为「显著提升稳定性」后即可汇总交付。",
      toast: "审核结果回传规划者",
    },
    {
      id: "revise",
      phase: "微调定稿",
      activeNodes: ["planner", "executor"],
      activeEdge: "e-planner-executor",
      states: {
        user: "等待中",
        planner: "安排微调",
        executor: "按意见修订",
        reviewer: "等待终稿确认",
      },
      focus: "executor",
      message:
        "规划者 → 执行者\n请按审核意见替换措辞并回传终稿（无需再开新需求）。",
      toast: "执行者按意见微调",
    },
    {
      id: "summary",
      phase: "汇总交付",
      activeNodes: ["planner", "user"],
      activeEdge: "e-planner-user",
      states: {
        user: "查收成果",
        planner: "已交付",
        executor: "完成",
        reviewer: "完成",
      },
      focus: "user",
      message:
        "规划者 → 用户\n【交付】Q1 产品发布公告终稿已就绪（已按审核修订）。\n附件：公告正文 · 迁移三步指引 · 风险说明。",
      toast: "汇总已交付给用户 · 剧本结束",
    },
  ];

  /** Browser-only demo live event sequence (Pages-safe). */
  const DEMO_LIVE_EVENTS = [
    { agent: "system", type: "status", message: "演示直播开始 · 假数据定时注入，非真实 Agent" },
    {
      agent: "user",
      type: "handoff",
      message: "请为「Q1 产品发布」起草对外公告，专业克制，800 字内。",
      edge: "e-user-planner",
      state: "正在说明需求",
      activeNodes: ["user"],
    },
    {
      agent: "planner",
      type: "status",
      message: "拆解：收集卖点 → 起草 → 审核 → 汇总",
      state: "拆解步骤中",
      activeNodes: ["planner"],
    },
    {
      agent: "planner",
      type: "dispatch",
      message: "派发：撰写公告草稿（含迁移三步指引）",
      edge: "e-planner-executor",
      state: "已派发，等待回报",
      activeNodes: ["planner", "executor"],
    },
    {
      agent: "executor",
      type: "tool",
      message: "tool: draft_outline → 价值主张 / 改进 / 迁移 / 支持",
      state: "撰写草稿…",
      activeNodes: ["executor"],
    },
    {
      agent: "executor",
      type: "message",
      message: "草稿摘要已生成，准备提交审核",
      state: "已提交",
      activeNodes: ["executor"],
    },
    {
      agent: "executor",
      type: "handoff",
      message: "提交审核：稳定性 + 迁移三步 + 回滚说明",
      edge: "e-executor-reviewer",
      activeNodes: ["executor", "reviewer"],
    },
    {
      agent: "reviewer",
      type: "status",
      message: "检查口径与敏感表述…",
      state: "检查质量中",
      activeNodes: ["reviewer"],
    },
    {
      agent: "reviewer",
      type: "handoff",
      message: "有条件通过：弱化「业界领先」→「显著提升稳定性」",
      edge: "e-reviewer-planner",
      state: "已反馈",
      activeNodes: ["reviewer", "planner"],
    },
    {
      agent: "planner",
      type: "dispatch",
      message: "安排微调措辞后交付",
      edge: "e-planner-executor",
      state: "安排微调",
      activeNodes: ["planner", "executor"],
    },
    {
      agent: "executor",
      type: "message",
      message: "终稿已修订完成",
      state: "完成",
      activeNodes: ["executor"],
    },
    {
      agent: "planner",
      type: "handoff",
      message: "【交付】公告终稿 · 迁移指引 · 风险说明",
      edge: "e-planner-user",
      state: "已交付",
      activeNodes: ["planner", "user"],
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

  function renderEventList() {
    el.eventList.innerHTML = "";
    const slice = state.events.slice(-80).reverse();
    slice.forEach((ev, idx) => {
      const li = document.createElement("li");
      if (idx === 0) li.classList.add("fresh");
      const agent = ev.agent || "system";
      li.innerHTML = `
        <span class="ts">${formatClock(ev.ts)}</span>
        <span class="agent" data-agent="${agent}">${AGENT_TITLE[agent] || agent}</span>
        <span class="etype">${ev.type || "event"}</span>
        <span class="payload">${escapeHtml(ev.message || "")}</span>
      `;
      el.eventList.appendChild(li);
    });
    el.eventCount.textContent = `${state.events.length} 条`;
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
        "点击画布上的角色或消息边，查看角色职责与最近一次交接内容。";
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
    const delay = state.step === 3 ? 1600 : 1100;
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
    return {
      ts: ev.ts || new Date().toISOString(),
      agent: ev.agent || "system",
      type: ev.type || "message",
      message: ev.message || "",
      edge: ev.edge || null,
      state: ev.state || null,
      activeNodes: Array.isArray(ev.activeNodes) ? ev.activeNodes : null,
    };
  }

  function ingestEvent(raw, opts = {}) {
    let ev;
    try {
      ev = normalizeEvent(raw);
    } catch {
      return;
    }
    state.events.push(ev);

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
      showToast("直播模式：可用「演示直播」（Pages 可开）或连接本地 SSE");
      setLiveStatus(state.es ? "live" : "idle");
      renderEventList();
      applyHighlights();
      updatePanel();
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

  window.addEventListener("resize", () => {
    layout();
  });

  requestAnimationFrame(() => layout());
})();
