"use strict";

/**
 * Phase-1 local runner: spawn `dsh` (DeepSeek Harness) when on PATH,
 * otherwise scripts/fake-dsh.sh. Emits REAL_TASKS schema events for a
 * **single Agent** topology: user ↔ agent ↔ tools (no planner/reviewer).
 */

const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const REPO_ROOT = path.resolve(__dirname, "..");
const FAKE_DSH = path.join(REPO_ROOT, "scripts", "fake-dsh.sh");

/** @typedef {{
 *  task_id: string,
 *  prompt: string,
 *  status: 'queued'|'running'|'complete'|'error',
 *  runner: string,
 *  runner_kind: 'dsh'|'fake-dsh',
 *  created_at: string,
 *  updated_at: string,
 *  exit_code: number|null,
 *  error: string|null,
 *  summary: string|null,
 * }} TaskRecord */

/** @type {Map<string, TaskRecord>} */
const tasks = new Map();

function whichDsh() {
  if (process.env.DSH_BIN && fs.existsSync(process.env.DSH_BIN)) {
    return process.env.DSH_BIN;
  }
  const r = spawnSync("bash", ["-lc", "command -v dsh"], {
    encoding: "utf8",
  });
  const p = (r.stdout || "").trim();
  return p || null;
}

function resolveRunner() {
  const real = whichDsh();
  const profile = process.env.DSH_PROFILE || "headless";
  // Prefer --json NDJSON for real headless dsh (see: dsh --profile headless --help).
  const wantJson = process.env.DSH_JSON !== "0";
  const looksFake =
    real &&
    (path.basename(real) === "fake-dsh.sh" ||
      real === FAKE_DSH ||
      /fake-dsh/i.test(real));
  if (real && !looksFake) {
    const argsPrefix = ["--profile", profile];
    if (wantJson) argsPrefix.push("--json");
    return { bin: real, kind: "dsh", argsPrefix, jsonPreferred: wantJson };
  }
  const bin = looksFake ? real : FAKE_DSH;
  if (!fs.existsSync(bin)) {
    throw new Error(`dsh not on PATH and fake runner missing: ${FAKE_DSH}`);
  }
  return {
    bin,
    kind: "fake-dsh",
    argsPrefix: ["--profile", profile],
    jsonPreferred: false,
  };
}

function makeTaskId() {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `task_${stamp}_${rand}`;
}

function truncate(s, n = 240) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

/**
 * @param {(ev: object) => void} emit
 * @param {{ task_id: string, step: number }} base
 * @param {Partial<object>} fields
 */
function emitStep(emit, base, fields) {
  base.step += 1;
  const ev = {
    ts: new Date().toISOString(),
    task_id: base.task_id,
    step: base.step,
    ...fields,
  };
  emit(ev);
  return ev;
}

/**
 * Detect tool-looking plain-text lines from dsh / fake-dsh stdout.
 * @param {string} line
 * @returns {{ isTool: boolean, tool: string|null, status: string|null, isResult: boolean }}
 */
function classifyPlainLine(line) {
  const t = line.trim();
  const lower = t.toLowerCase();
  const resultHint =
    /\b(tool[_ ]?result|result\s*[:=]|status\s*=\s*ok|status\s*=\s*error|tool.*\bok\b)/i.test(
      t
    );
  const m =
    t.match(/\btool\s*[:：]\s*([A-Za-z0-9_./-]+)/i) ||
    t.match(/\b(tool_call|tool_use)\s*[:\s]+([A-Za-z0-9_./-]+)/i) ||
    t.match(/\bcalling\s+([A-Za-z0-9_./-]+)/i) ||
    t.match(/\b(Read|Bash|bash|Glob|glob|Grep|Write|Shell|WebSearch)\b/);
  const toolName = m
    ? (m[2] || m[1] || "").replace(/^tool[_-]?/i, "") || m[0]
    : null;
  const looksTool =
    !!toolName ||
    /\btool[_:]/i.test(t) ||
    /\[tool/i.test(t) ||
    /\bworkspace\.\w+/i.test(t);
  let status = null;
  if (/status\s*=\s*error|\berror\b/i.test(lower) && looksTool) status = "error";
  else if (/status\s*=\s*ok|\bok\b/i.test(lower) && looksTool) status = "ok";
  else if (looksTool) status = resultHint ? "ok" : "running";
  return {
    isTool: looksTool,
    tool: toolName && toolName.length < 64 ? String(toolName) : null,
    status,
    isResult: looksTool && (resultHint || status === "ok" || status === "error"),
  };
}

/**
 * Map one NDJSON object from `dsh --json` (best-effort; schemas vary).
 * @param {object} obj
 * @returns {object|null} fields for emitStep, or null to skip
 */
function mapJsonEvent(obj) {
  if (!obj || typeof obj !== "object") return null;
  const typeRaw = String(obj.type || obj.event || obj.kind || "").toLowerCase();
  const role = String(obj.role || obj.agent || obj.speaker || "").toLowerCase();
  const msg =
    obj.message ||
    obj.text ||
    obj.content ||
    obj.delta ||
    obj.summary ||
    (typeof obj.result === "string" ? obj.result : null) ||
    (typeof obj.output === "string" ? obj.output : null) ||
    "";
  const toolName =
    obj.tool ||
    obj.name ||
    (obj.tool_call && (obj.tool_call.name || obj.tool_call.tool)) ||
    null;

  // Real dsh --json: session bootstrap
  if (typeRaw === "session") {
    return {
      agent: "system",
      type: "status",
      message: truncate(`session ${obj.sessionId || ""}`.trim(), 200),
      activeNodes: ["agent"],
      detail: { sessionId: obj.sessionId, cwd: obj.cwd },
    };
  }

  // Real dsh --json: status with phase (turn_start / step_start / …)
  if (typeRaw === "status" && obj.phase) {
    const phase = String(obj.phase);
    return {
      agent: "agent",
      type: "status",
      status: "running",
      message: truncate(
        `phase:${phase}${obj.turn != null ? ` turn=${obj.turn}` : ""}${
          obj.step != null ? ` step=${obj.step}` : ""
        }`,
        200
      ),
      state: phase,
      activeNodes: ["agent"],
      detail: { phase, turn: obj.turn, step: obj.step },
    };
  }

  if (
    typeRaw === "user" ||
    typeRaw === "user_message" ||
    typeRaw === "task_start" ||
    role === "user"
  ) {
    return {
      agent: "user",
      type: typeRaw === "task_start" ? "task_start" : "message",
      message: truncate(msg || "(user)", 300),
      edge: "e-user-agent",
      state: "已提交",
      activeNodes: ["user", "agent"],
    };
  }

  // Real dsh: {"type":"tool_call","tool":"read","input":{…}}
  if (typeRaw === "tool_call" || typeRaw === "tool_use") {
    const name = toolName ? String(toolName) : "tool";
    const inputHint =
      obj.input && typeof obj.input === "object"
        ? truncate(JSON.stringify(obj.input), 120)
        : "";
    return {
      agent: "tools",
      type: "tool",
      tool: name,
      status: "running",
      message: truncate(
        msg || `tool_call: ${name}${inputHint ? " · " + inputHint : ""}`,
        300
      ),
      edge: "e-agent-tools",
      state: `${name} 运行中…`,
      activeNodes: ["agent", "tools"],
      detail: { callId: obj.callId, input: obj.input },
    };
  }

  // Real dsh: {"type":"tool_result","status":"completed","result":"…"}
  if (
    typeRaw === "tool_result" ||
    typeRaw === "tool_response" ||
    typeRaw === "function_result"
  ) {
    const st = String(obj.status || (obj.ok === false ? "error" : "ok")).toLowerCase();
    const ok = st !== "error" && st !== "failed" && obj.ok !== false;
    const name = toolName ? String(toolName) : "tool";
    return {
      agent: "tools",
      type: "tool",
      tool: toolName ? String(toolName) : undefined,
      status: ok ? "ok" : "error",
      message: truncate(msg || `tool_result · ${ok ? "ok" : "error"}`, 300),
      edge: "e-tools-agent",
      state: ok ? `${name} 完成` : `${name} 失败`,
      activeNodes: ["tools", "agent"],
      detail: { callId: obj.callId, status: obj.status },
    };
  }

  if (typeRaw === "tool") {
    const st = String(obj.status || "running").toLowerCase();
    const running = !st || st === "running" || st === "pending" || st === "start";
    return {
      agent: "tools",
      type: "tool",
      tool: toolName ? String(toolName) : undefined,
      status: running ? "running" : st === "error" ? "error" : "ok",
      message: truncate(
        msg ||
          `tool: ${toolName || "unknown"}${running ? " · running" : " · " + st}`,
        300
      ),
      edge: running ? "e-agent-tools" : "e-tools-agent",
      state: running
        ? `${toolName || "tool"} 运行中…`
        : `${toolName || "tool"} ${st}`,
      activeNodes: running ? ["agent", "tools"] : ["tools", "agent"],
    };
  }

  // Real dsh: final / text / thinking
  if (typeRaw === "final" || typeRaw === "complete" || typeRaw === "done" || typeRaw === "finish") {
    if (!String(msg || "").trim() && typeRaw === "thinking") return null;
    return {
      agent: "agent",
      type: "message",
      status: "ok",
      message: truncate(msg || "最终回复就绪", 300),
      state: "准备交付",
      activeNodes: ["agent"],
      _finalHint: true,
    };
  }

  if (typeRaw === "thinking" || typeRaw === "thought") {
    if (!String(msg || "").trim()) return null; // dsh often emits empty thinking
    return {
      agent: "agent",
      type: "status",
      message: truncate(msg, 300),
      state: "思考中…",
      activeNodes: ["agent"],
    };
  }

  if (
    typeRaw === "text" ||
    typeRaw === "assistant" ||
    typeRaw === "message" ||
    typeRaw === "delta" ||
    typeRaw === "result" ||
    role === "assistant" ||
    role === "agent"
  ) {
    if (!String(msg || "").trim()) return null;
    return {
      agent: "agent",
      type: "message",
      message: truncate(msg, 300),
      state: typeRaw === "result" ? "准备交付" : "回复中…",
      activeNodes: ["agent"],
      _finalHint: typeRaw === "result" ? true : undefined,
    };
  }

  if (toolName) {
    return {
      agent: "tools",
      type: "tool",
      tool: String(toolName),
      status: String(obj.status || "running"),
      message: truncate(msg || `tool: ${toolName}`, 300),
      edge: "e-agent-tools",
      state: "工具活动",
      activeNodes: ["agent", "tools"],
    };
  }

  if (msg) {
    return {
      agent: "agent",
      type: "message",
      message: truncate(msg, 300),
      state: "执行中…",
      activeNodes: ["agent"],
    };
  }
  return null;
}

function createAndRunTask(opts, emit) {
  const prompt = String(opts.prompt || "").trim();
  if (!prompt) throw new Error("prompt is required");

  const runner = resolveRunner();
  const task_id = makeTaskId();
  const now = new Date().toISOString();
  /** @type {TaskRecord} */
  const rec = {
    task_id,
    prompt,
    status: "queued",
    runner: runner.bin,
    runner_kind: runner.kind,
    created_at: now,
    updated_at: now,
    exit_code: null,
    error: null,
    summary: null,
  };
  tasks.set(task_id, rec);

  const base = { task_id, step: 0 };
  const cwd = opts.cwd ? path.resolve(opts.cwd) : REPO_ROOT;

  setImmediate(() => runPipeline(rec, runner, prompt, cwd, emit, base));

  return {
    task_id,
    status: rec.status,
    runner: rec.runner,
    runner_kind: rec.runner_kind,
    prompt: truncate(prompt, 200),
  };
}

/**
 * @param {TaskRecord} rec
 * @param {{ bin: string, kind: string, argsPrefix: string[], jsonPreferred?: boolean }} runner
 * @param {string} prompt
 * @param {string} cwd
 * @param {(ev: object) => void} emit
 * @param {{ task_id: string, step: number }} base
 */
function runPipeline(rec, runner, prompt, cwd, emit, base) {
  rec.status = "running";
  rec.updated_at = new Date().toISOString();

  emitStep(emit, base, {
    agent: "user",
    type: "task_start",
    status: "running",
    message: truncate(prompt, 280),
    edge: "e-user-agent",
    state: "已提交真实任务",
    activeNodes: ["user", "agent"],
    detail: { runner: runner.bin, runner_kind: runner.kind, cwd },
  });

  emitStep(emit, base, {
    agent: "agent",
    type: "status",
    status: "running",
    message: `启动本机 ${runner.kind}（单 Agent · headless）`,
    state: "启动中…",
    activeNodes: ["agent"],
    detail: {
      argv0: runner.bin,
      profile: process.env.DSH_PROFILE || "headless",
      json: !!runner.jsonPreferred,
    },
  });

  const cmdArgs = [...runner.argsPrefix, prompt];
  const child = spawn(runner.bin, cmdArgs, {
    cwd,
    env: { ...process.env, VISUAL_AGENTS_TASK_ID: rec.task_id },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let lineBuf = "";
  let chunkCount = 0;
  let jsonHits = 0;
  let sawFinal = false;

  const emitFromLine = (line, streamName) => {
    const t = line.trim();
    if (!t) return;
    chunkCount += 1;
    if (chunkCount > 60) return;

    if (t.startsWith("{") && t.endsWith("}")) {
      try {
        const obj = JSON.parse(t);
        const mapped = mapJsonEvent(obj);
        if (mapped) {
          jsonHits += 1;
          const finalHint = mapped._finalHint;
          delete mapped._finalHint;
          if (finalHint) sawFinal = true;
          emitStep(emit, base, {
            ...mapped,
            detail: { stream: streamName, json: true },
          });
          return;
        }
      } catch {
        /* fall through */
      }
    }

    const cls = classifyPlainLine(t);
    if (cls.isTool) {
      const asResult = cls.isResult;
      emitStep(emit, base, {
        agent: "tools",
        type: "tool",
        tool: cls.tool || undefined,
        status: cls.status || (asResult ? "ok" : "running"),
        message: truncate(t, 300),
        edge: asResult ? "e-tools-agent" : "e-agent-tools",
        state: asResult
          ? `${cls.tool || "tool"} 完成`
          : `${cls.tool || "tool"} 运行中…`,
        activeNodes: asResult ? ["tools", "agent"] : ["agent", "tools"],
        detail: { stream: streamName },
      });
      return;
    }

    emitStep(emit, base, {
      agent: "agent",
      type: streamName === "stderr" ? "status" : "message",
      status: "running",
      message: truncate(t, 300),
      state: "执行中…",
      activeNodes: ["agent"],
      detail: { stream: streamName },
    });
  };

  const flushLines = (chunk, streamName) => {
    lineBuf += chunk;
    const parts = lineBuf.split(/\r?\n/);
    lineBuf = parts.pop() || "";
    for (const line of parts) emitFromLine(line, streamName);
  };

  child.stdout.on("data", (buf) => {
    const s = buf.toString("utf8");
    stdout += s;
    flushLines(s, "stdout");
  });
  child.stderr.on("data", (buf) => {
    const s = buf.toString("utf8");
    stderr += s;
    flushLines(s, "stderr");
  });

  child.on("error", (err) => {
    rec.status = "error";
    rec.error = String(err.message || err);
    rec.updated_at = new Date().toISOString();
    emitStep(emit, base, {
      agent: "system",
      type: "error",
      status: "error",
      message: `无法启动 runner: ${rec.error}`,
      activeNodes: ["agent"],
      detail: { runner: runner.bin },
    });
  });

  child.on("close", (code) => {
    if (lineBuf.trim() && chunkCount < 60) {
      emitFromLine(lineBuf.trim(), "stdout");
      lineBuf = "";
    }

    const ok = code === 0;
    const summary = truncate(stdout.trim() || stderr.trim() || "(no output)", 400);
    rec.exit_code = code;
    rec.summary = summary;
    rec.updated_at = new Date().toISOString();

    emitStep(emit, base, {
      agent: "agent",
      type: "status",
      status: ok ? "ok" : "error",
      message: ok
        ? `${runner.kind} 退出 0 · 输出 ${stdout.length} 字符${
            jsonHits ? ` · JSON 事件 ${jsonHits}` : ""
          }`
        : `${runner.kind} 退出 ${code}`,
      state: ok ? "整理回复…" : "执行失败",
      activeNodes: ["agent"],
      detail: {
        exit_code: code,
        stdout_chars: stdout.length,
        stderr_chars: stderr.length,
        json_hits: jsonHits,
      },
    });

    if (ok) {
      if (!sawFinal) {
        emitStep(emit, base, {
          agent: "agent",
          type: "message",
          status: "ok",
          message: truncate(summary, 360),
          state: "最终回复",
          activeNodes: ["agent"],
        });
      }
      emitStep(emit, base, {
        agent: "agent",
        type: "handoff",
        status: "ok",
        message: `回复交付用户：${truncate(summary, 280)}`,
        edge: "e-agent-user",
        activeNodes: ["agent", "user"],
        state: "已交付",
      });
      emitStep(emit, base, {
        agent: "user",
        type: "status",
        status: "ok",
        message: "已收到任务结果（见事件流）",
        state: "查收成果",
        activeNodes: ["user"],
      });
      rec.status = "complete";
      emitStep(emit, base, {
        agent: "system",
        type: "complete",
        status: "ok",
        message: `任务完成 · ${rec.task_id}`,
        activeNodes: ["user"],
        detail: { exit_code: 0, runner_kind: runner.kind },
      });
    } else {
      rec.status = "error";
      rec.error = `exit ${code}`;
      emitStep(emit, base, {
        agent: "system",
        type: "error",
        status: "error",
        message: `任务失败 · ${rec.task_id} · exit ${code}`,
        activeNodes: ["agent"],
        detail: { exit_code: code, stderr: truncate(stderr, 500) },
      });
    }
    rec.updated_at = new Date().toISOString();
  });
}

function getTask(id) {
  return tasks.get(id) || null;
}

function listTasks() {
  return Array.from(tasks.values()).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );
}

function runnerInfo() {
  try {
    const r = resolveRunner();
    return {
      ok: true,
      dsh_on_path: r.kind === "dsh",
      runner: r.bin,
      runner_kind: r.kind,
      profile: process.env.DSH_PROFILE || "headless",
      json: !!r.jsonPreferred,
      topology: "user-agent-tools",
      hint:
        r.kind === "fake-dsh"
          ? "Install DeepSeek Harness so `dsh` is on PATH, or set DSH_BIN. Using scripts/fake-dsh.sh for demo."
          : "Using real dsh from PATH (or DSH_BIN). Events map to single-agent user/agent/tools.",
    };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

module.exports = {
  createAndRunTask,
  getTask,
  listTasks,
  runnerInfo,
  resolveRunner,
  whichDsh,
  FAKE_DSH,
  classifyPlainLine,
  mapJsonEvent,
};
