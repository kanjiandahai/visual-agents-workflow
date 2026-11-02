"use strict";

/**
 * Phase-1 local runner: spawn `dsh` (DeepSeek Harness) when on PATH,
 * otherwise scripts/fake-dsh.sh. Emits REAL_TASKS schema events via callback.
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
  if (real) {
    return { bin: real, kind: "dsh", argsPrefix: ["--profile", process.env.DSH_PROFILE || "headless"] };
  }
  if (!fs.existsSync(FAKE_DSH)) {
    throw new Error(`dsh not on PATH and fake runner missing: ${FAKE_DSH}`);
  }
  return {
    bin: FAKE_DSH,
    kind: "fake-dsh",
    argsPrefix: ["--profile", process.env.DSH_PROFILE || "headless"],
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
 * @param {object} base
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
 * @param {{ prompt: string, cwd?: string }} opts
 * @param {(ev: object) => void} emit
 */
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

  // Kick off async — do not block HTTP response
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
 * @param {{ bin: string, kind: string, argsPrefix: string[] }} runner
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
    edge: "e-user-planner",
    state: "已提交真实任务",
    activeNodes: ["user", "planner"],
    detail: { runner: runner.bin, runner_kind: runner.kind, cwd },
  });

  emitStep(emit, base, {
    agent: "planner",
    type: "status",
    status: "running",
    message: `拆解：用本机 ${runner.kind} 执行用户任务`,
    state: "拆解步骤中",
    activeNodes: ["planner"],
  });

  emitStep(emit, base, {
    agent: "planner",
    type: "dispatch",
    status: "ok",
    message: `派发执行者 · ${runner.kind}`,
    edge: "e-planner-executor",
    state: "已派发，等待回报",
    activeNodes: ["planner", "executor"],
    tool: runner.kind,
  });

  const cmdArgs = [...runner.argsPrefix, prompt];
  emitStep(emit, base, {
    agent: "executor",
    type: "tool",
    tool: runner.kind,
    status: "running",
    message: `启动 ${path.basename(runner.bin)} ${runner.argsPrefix.join(" ")} …`,
    state: "调用 dsh…",
    activeNodes: ["executor"],
    detail: { argv0: runner.bin, profile: process.env.DSH_PROFILE || "headless" },
  });

  const child = spawn(runner.bin, cmdArgs, {
    cwd,
    env: { ...process.env, VISUAL_AGENTS_TASK_ID: rec.task_id },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let lineBuf = "";
  let chunkCount = 0;

  const flushLines = (chunk, streamName) => {
    lineBuf += chunk;
    const parts = lineBuf.split(/\r?\n/);
    lineBuf = parts.pop() || "";
    for (const line of parts) {
      const t = line.trim();
      if (!t) continue;
      chunkCount += 1;
      // Cap chatty streams so the event bus stays readable
      if (chunkCount <= 40) {
        emitStep(emit, base, {
          agent: "executor",
          type: streamName === "stderr" ? "status" : "message",
          tool: runner.kind,
          status: "running",
          message: truncate(t, 300),
          state: "执行中…",
          activeNodes: ["executor"],
          detail: { stream: streamName },
        });
      }
    }
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
      activeNodes: ["system"],
      detail: { runner: runner.bin },
    });
  });

  child.on("close", (code) => {
    if (lineBuf.trim() && chunkCount < 40) {
      emitStep(emit, base, {
        agent: "executor",
        type: "message",
        tool: runner.kind,
        status: "running",
        message: truncate(lineBuf.trim(), 300),
        state: "执行中…",
        activeNodes: ["executor"],
      });
      lineBuf = "";
    }

    const ok = code === 0;
    const summary = truncate(stdout.trim() || stderr.trim() || "(no output)", 400);
    rec.exit_code = code;
    rec.summary = summary;
    rec.updated_at = new Date().toISOString();

    emitStep(emit, base, {
      agent: "executor",
      type: "tool",
      tool: runner.kind,
      status: ok ? "ok" : "error",
      message: ok
        ? `${runner.kind} 退出 0 · 输出 ${stdout.length} 字符`
        : `${runner.kind} 退出 ${code}`,
      state: ok ? "已产出结果" : "执行失败",
      activeNodes: ["executor"],
      detail: { exit_code: code, stdout_chars: stdout.length, stderr_chars: stderr.length },
    });

    emitStep(emit, base, {
      agent: "executor",
      type: "handoff",
      status: ok ? "ok" : "error",
      message: ok ? `提交审核：${summary}` : `失败摘要：${truncate(stderr || summary, 280)}`,
      edge: "e-executor-reviewer",
      activeNodes: ["executor", "reviewer"],
    });

    emitStep(emit, base, {
      agent: "reviewer",
      type: "status",
      status: "running",
      message: ok ? "检查输出是否非空且可交付" : "记录失败原因",
      state: "检查中",
      activeNodes: ["reviewer"],
    });

    if (ok) {
      emitStep(emit, base, {
        agent: "reviewer",
        type: "message",
        status: "ok",
        message: "通过（第一期自动审核：退出码 0）",
        state: "已通过",
        activeNodes: ["reviewer"],
      });
      emitStep(emit, base, {
        agent: "reviewer",
        type: "handoff",
        status: "ok",
        message: `审核通过，交规划者汇总：${summary}`,
        edge: "e-reviewer-planner",
        activeNodes: ["reviewer", "planner"],
        state: "已反馈",
      });
      emitStep(emit, base, {
        agent: "planner",
        type: "handoff",
        status: "ok",
        message: `汇总交付用户：${summary}`,
        edge: "e-planner-user",
        activeNodes: ["planner", "user"],
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
      emitStep(emit, base, {
        agent: "reviewer",
        type: "message",
        status: "error",
        message: "未通过：runner 非零退出",
        state: "已驳回",
        activeNodes: ["reviewer"],
      });
      rec.status = "error";
      rec.error = `exit ${code}`;
      emitStep(emit, base, {
        agent: "system",
        type: "error",
        status: "error",
        message: `任务失败 · ${rec.task_id} · exit ${code}`,
        activeNodes: ["reviewer"],
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
      hint:
        r.kind === "fake-dsh"
          ? "Install DeepSeek Harness so `dsh` is on PATH, or set DSH_BIN. Using scripts/fake-dsh.sh for demo."
          : "Using real dsh from PATH (or DSH_BIN).",
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
};
