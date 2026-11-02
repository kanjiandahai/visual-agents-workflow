#!/usr/bin/env bash
# fake-dsh — drop-in demo runner when real `dsh` (DeepSeek Harness) is not on PATH.
# Accepts the same shape Task API uses: optional --profile <name>, then a job string.
# Prints staged stdout so the sandbox can stream realistic executor events.
set -euo pipefail

profile="headless"
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      profile="${2:-headless}"
      shift 2
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
