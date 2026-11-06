#!/usr/bin/env bash
# fake-dsh — drop-in demo runner when real `dsh` (DeepSeek Harness) is not on PATH.
# Accepts the same shape Task API uses: optional --profile <name>, then a job string.
# Prints staged stdout so the sandbox can stream realistic single-agent / tool events.
set -euo pipefail

profile="headless"
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      profile="${2:-headless}"
      shift 2
      ;;
    --json)
      # accepted for argv compatibility with real dsh headless; still prints text lines
      shift
      ;;
    --help|-h)
      echo "fake-dsh [--profile <name>] <job>"
      echo "Demo stand-in for DeepSeek Harness CLI (dsh). Not a real model."
      exit 0
      ;;
    --version)
      echo "fake-dsh 0.1.0 (visual-agents-workflow demo)"
      exit 0
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

job="${args[*]:-}"
if [[ -z "$job" ]]; then
  echo "fake-dsh: missing job string" >&2
  exit 2
fi

# Truncate for display
short="$job"
if [[ ${#short} -gt 120 ]]; then
  short="${short:0:117}…"
fi

# Opt-in multi-agent NDJSON so POST /tasks { mode: "multi" } can map subagent tools.
# Default (unset VISUAL_AGENTS_MODE) stays the original single-agent text output.
if [[ "${VISUAL_AGENTS_MODE:-}" == "multi" ]]; then
  echo "[fake-dsh] profile=$profile mode=multi" >&2
  python3 -c '
import json, sys, time
job = sys.argv[1]
def emit(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)
    time.sleep(0.28)
emit({"type": "session", "sessionId": "fake-root", "cwd": "."})
emit({"type": "status", "phase": "turn_start", "turn": 1})
emit({"type": "thinking", "text": "两项调研相互独立，同一轮用 subagent 与 subagent_fork 委派。"})
emit({
    "type": "tool_call",
    "callId": "call_a1",
    "tool": "subagent",
    "input": {"label": "research-a", "task": "调研本仓库沙盘可视化：节点、连线、剧本与直播"},
})
emit({"type": "tool_result", "callId": "call_a1", "status": "completed", "result": "started subagent session-childAdemo01"})
emit({
    "type": "tool_call",
    "callId": "call_b1",
    "tool": "subagent_fork",
    "input": {"label": "research-b", "task": "调研本机 dsh headless --json 与 SSE /tasks"},
})
emit({"type": "tool_result", "callId": "call_b1", "status": "completed", "result": "started subagent session-childBdemo02"})
emit({"type": "tool_call", "callId": "call_l1", "tool": "list_agents", "input": {"scope": "children"}})
emit({"type": "tool_result", "callId": "call_l1", "status": "completed", "result": "children: session-childAdemo01 running; session-childBdemo02 running"})
emit({"type": "text", "text": "Background subagent session-childAdemo01 finished and will do no further work unless you send it more. Its closing message: 沙盘默认拓扑是用户 ↔ 助手 ↔ 工具，支持剧本回放与演示直播。"})
emit({"type": "text", "text": "Background subagent session-childBdemo02 finished and will do no further work unless you send it more. Its closing message: 本机 dsh --profile headless --json 是根会话投影，经 POST /tasks 与 GET /events 推到沙盘。"})
emit({"type": "final", "text": "【演示汇总】（fake-dsh，无真实模型）针对「%s」：子 A 汇报沙盘为用户↔助手↔工具；子 B 汇报本机 dsh headless --json 与 SSE /tasks。根 Agent 已汇总。" % job})
' "$short"
  echo "[fake-dsh] done" >&2
  exit 0
fi

echo "[fake-dsh] profile=$profile"
echo "[fake-dsh] accepted job: $short"
sleep 0.35
echo "[fake-dsh] planning: read context → draft answer → self-check"
sleep 0.45
echo "[fake-dsh] tool: workspace.scan status=ok"
sleep 0.4
echo "[fake-dsh] drafting response…"
sleep 0.5
cat <<RESULT
[fake-dsh] RESULT
This is a **demo** answer from fake-dsh (no model API).
Job echo: $short
Suggested next step: install real dsh (DeepSeek Harness) and re-run so PATH resolves \`dsh\`.
RESULT
sleep 0.25
echo "[fake-dsh] done"
exit 0
